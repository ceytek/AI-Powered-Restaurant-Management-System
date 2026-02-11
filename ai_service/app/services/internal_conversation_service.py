"""Internal conversation service — manages sessions and message history for staff/owner chat."""
import logging
import time
from typing import Optional, List
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from langchain_core.messages import HumanMessage, AIMessage

from app.agents.internal.graph import build_internal_agent_graph, InternalAgentState

logger = logging.getLogger(__name__)


class InternalConversationService:
    """Manages internal AI assistant conversations for authenticated staff."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_session(self, session_id: Optional[str] = None) -> str:
        """Get existing session or create a new one."""
        if session_id:
            result = await self.db.execute(
                text("SELECT session_id FROM conversation_logs WHERE session_id = :sid LIMIT 1"),
                {"sid": session_id},
            )
            if result.fetchone():
                return session_id
        return f"internal-{uuid4().hex[:12]}"

    async def get_conversation_history(self, session_id: str, company_id: str, limit: int = 30) -> List:
        """Load recent conversation messages as LangChain message objects."""
        result = await self.db.execute(
            text("""
                SELECT role, content FROM conversation_logs
                WHERE session_id = :sid AND company_id = :cid
                  AND role IN ('user', 'assistant')
                ORDER BY created_at ASC
                LIMIT :limit
            """),
            {"sid": session_id, "cid": company_id, "limit": limit},
        )

        messages = []
        for row in result.fetchall():
            if row.role == "user":
                messages.append(HumanMessage(content=row.content))
            elif row.role == "assistant":
                messages.append(AIMessage(content=row.content))
        return messages

    async def save_message(
        self,
        session_id: str,
        company_id: str,
        role: str,
        content: str,
        input_type: str = "text",
        tool_name: Optional[str] = None,
        tokens_used: Optional[int] = None,
        latency_ms: Optional[int] = None,
    ):
        """Save a message to the conversation log."""
        await self.db.execute(
            text("""
                INSERT INTO conversation_logs
                    (company_id, session_id, role, content, input_type, tool_name, tokens_used, latency_ms)
                VALUES
                    (:company_id, :session_id, :role, :content, :input_type, :tool_name, :tokens_used, :latency_ms)
            """),
            {
                "company_id": company_id,
                "session_id": session_id,
                "role": role,
                "content": content,
                "input_type": input_type,
                "tool_name": tool_name,
                "tokens_used": tokens_used,
                "latency_ms": latency_ms,
            },
        )
        await self.db.flush()

    async def chat(
        self,
        company_id: str,
        company_name: str,
        user_name: str,
        message: str,
        session_id: Optional[str] = None,
    ) -> dict:
        """Process an internal chat message through the agent graph.

        Returns dict with: response, session_id, tools_used, latency_ms
        """
        start_time = time.time()

        session_id = await self.get_or_create_session(session_id)
        history = await self.get_conversation_history(session_id, company_id)

        # Save user message
        await self.save_message(session_id, company_id, "user", message, input_type="internal_chat")

        # Build internal agent graph
        graph = build_internal_agent_graph(self.db, company_id, company_name, user_name)

        initial_state: InternalAgentState = {
            "messages": history + [HumanMessage(content=message)],
            "company_id": company_id,
            "company_name": company_name,
            "session_id": session_id,
            "user_name": user_name,
            "tools_used": [],
        }

        try:
            result = await graph.ainvoke(initial_state)
            await self.db.commit()
        except Exception as e:
            logger.error(f"Internal graph execution error: {e}")
            await self.db.rollback()
            latency = int((time.time() - start_time) * 1000)
            return {
                "response": "I'm sorry, I encountered an error processing your request. Please try again.",
                "session_id": session_id,
                "tools_used": [],
                "latency_ms": latency,
            }

        # Extract assistant's response
        response_text = "I couldn't generate a response. Please try again."
        if result.get("messages"):
            for msg in reversed(result["messages"]):
                if isinstance(msg, AIMessage) and msg.content:
                    response_text = msg.content
                    break

        latency = int((time.time() - start_time) * 1000)
        tools_used = result.get("tools_used", [])

        # Save assistant response
        try:
            await self.save_message(
                session_id, company_id, "assistant", response_text,
                input_type="internal_chat",
                tool_name=",".join(tools_used) if tools_used else None,
                latency_ms=latency,
            )
            await self.db.commit()
        except Exception as e:
            logger.error(f"Error saving internal response: {e}")
            await self.db.rollback()

        return {
            "response": response_text,
            "session_id": session_id,
            "tools_used": tools_used,
            "latency_ms": latency,
        }
