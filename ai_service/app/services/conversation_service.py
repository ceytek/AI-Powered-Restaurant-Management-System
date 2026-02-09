"""Conversation service - manages sessions and message history."""
import logging
import time
from typing import Optional, List
from uuid import uuid4
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from app.models.knowledge_base import ConversationLog
from app.agents.graph import build_agent_graph
from app.agents.state import AgentState

logger = logging.getLogger(__name__)


class ConversationService:
    """Manages AI agent conversations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_or_create_session(self, session_id: Optional[str] = None) -> str:
        """Get existing session or create a new one."""
        if session_id:
            # Verify session exists
            result = await self.db.execute(
                text("SELECT session_id FROM conversation_logs WHERE session_id = :sid LIMIT 1"),
                {"sid": session_id},
            )
            if result.fetchone():
                return session_id

        # Create new session
        return f"session-{uuid4().hex[:12]}"

    async def get_conversation_history(
        self, session_id: str, company_id: str, limit: int = 50
    ) -> List:
        """Load conversation history from database as LangChain messages."""
        result = await self.db.execute(
            text("""
                SELECT role, content FROM conversation_logs
                WHERE session_id = :sid AND company_id = :cid
                ORDER BY created_at ASC
                LIMIT :limit
            """),
            {"sid": session_id, "cid": company_id, "limit": limit},
        )
        rows = result.fetchall()

        messages = []
        for row in rows:
            if row.role == "user":
                messages.append(HumanMessage(content=row.content))
            elif row.role == "assistant":
                messages.append(AIMessage(content=row.content))
            # Skip system/tool messages for history

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
        customer_phone: Optional[str] = None,
    ):
        """Save a message to the conversation log."""
        log = ConversationLog(
            company_id=company_id,
            session_id=session_id,
            role=role,
            content=content,
            input_type=input_type,
            tool_name=tool_name,
            tokens_used=tokens_used,
            latency_ms=latency_ms,
            customer_phone=customer_phone,
        )
        self.db.add(log)
        await self.db.flush()

    async def chat(
        self,
        company_id: str,
        company_name: str,
        message: str,
        session_id: Optional[str] = None,
        customer_phone: Optional[str] = None,
        input_type: str = "text",
    ) -> dict:
        """Process a chat message through the agent graph.

        Returns dict with: response, session_id, tools_used
        """
        start_time = time.time()

        # Get/create session
        session_id = await self.get_or_create_session(session_id)

        # Load history
        history = await self.get_conversation_history(session_id, company_id)

        # Save user message
        await self.save_message(
            session_id, company_id, "user", message,
            input_type=input_type, customer_phone=customer_phone,
        )

        # Build agent graph
        graph = build_agent_graph(self.db, company_id, company_name)

        # Prepare initial state
        initial_state: AgentState = {
            "messages": history + [HumanMessage(content=message)],
            "company_id": company_id,
            "company_name": company_name,
            "session_id": session_id,
            "customer_phone": customer_phone,
            "next_agent": "supervisor",
            "reservation_draft": None,
            "customer_info": None,
            "call_active": True,
            "tools_used": [],
        }

        # Run the graph
        try:
            result = await graph.ainvoke(initial_state)

            # Extract the last AI message
            ai_messages = [m for m in result["messages"] if isinstance(m, AIMessage)]
            if ai_messages:
                response_text = ai_messages[-1].content
            else:
                response_text = "I'm sorry, I didn't quite catch that. Could you say that again?"

            tools_used = result.get("tools_used", [])
            call_active = result.get("call_active", True)

        except Exception as e:
            logger.error(f"Agent graph error: {e}", exc_info=True)
            response_text = "I apologize, I'm having a technical difficulty. Could you repeat that?"
            tools_used = []
            call_active = True
            # Ensure we can continue using the db session
            try:
                await self.db.rollback()
            except Exception:
                pass

        # Calculate latency
        latency_ms = int((time.time() - start_time) * 1000)

        # Save assistant response in a clean transaction
        try:
            await self.save_message(
                session_id, company_id, "assistant", response_text,
                latency_ms=latency_ms, customer_phone=customer_phone,
            )
            await self.db.commit()
        except Exception:
            try:
                await self.db.rollback()
            except Exception:
                pass

        return {
            "response": response_text,
            "session_id": session_id,
            "tools_used": tools_used,
            "latency_ms": latency_ms,
            "call_active": call_active,
        }

    async def get_session_history(self, session_id: str, company_id: str) -> List[dict]:
        """Get full conversation history for a session."""
        result = await self.db.execute(
            text("""
                SELECT role, content, input_type, tool_name, latency_ms, created_at
                FROM conversation_logs
                WHERE session_id = :sid AND company_id = :cid
                ORDER BY created_at ASC
            """),
            {"sid": session_id, "cid": company_id},
        )

        return [
            {
                "role": row.role,
                "content": row.content,
                "input_type": row.input_type,
                "tool_name": row.tool_name,
                "latency_ms": row.latency_ms,
                "timestamp": row.created_at.isoformat() if row.created_at else None,
            }
            for row in result.fetchall()
        ]

    async def list_sessions(self, company_id: str, limit: int = 20) -> List[dict]:
        """List recent conversation sessions."""
        result = await self.db.execute(
            text("""
                SELECT session_id,
                       MIN(created_at) as started_at,
                       MAX(created_at) as last_message_at,
                       COUNT(*) as message_count,
                       MAX(customer_phone) as customer_phone
                FROM conversation_logs
                WHERE company_id = :cid
                GROUP BY session_id
                ORDER BY MAX(created_at) DESC
                LIMIT :limit
            """),
            {"cid": company_id, "limit": limit},
        )

        return [
            {
                "session_id": row.session_id,
                "started_at": row.started_at.isoformat() if row.started_at else None,
                "last_message_at": row.last_message_at.isoformat() if row.last_message_at else None,
                "message_count": row.message_count,
                "customer_phone": row.customer_phone,
            }
            for row in result.fetchall()
        ]
