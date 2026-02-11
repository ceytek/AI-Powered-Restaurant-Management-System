"""LangGraph agent for internal restaurant assistant (staff/owner queries)."""
import logging
from typing import TypedDict, List, Optional, Annotated

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

from app.agents.internal.prompts import get_internal_assistant_prompt
from app.agents.internal.tools.inventory_tools import create_inventory_tools
from app.agents.internal.tools.staff_tools import create_staff_tools
from app.agents.internal.tools.reservation_tools import create_internal_reservation_tools
from app.agents.internal.tools.table_tools import create_table_tools
from app.agents.internal.tools.analytics_tools import create_analytics_tools
from app.agents.prompts import get_current_time_str
from app.core.config import settings

logger = logging.getLogger(__name__)


class InternalAgentState(TypedDict):
    """State for the internal assistant agent."""
    messages: Annotated[List[BaseMessage], add_messages]
    company_id: str
    company_name: str
    session_id: str
    user_name: str
    tools_used: List[str]


def build_internal_agent_graph(db, company_id: str, company_name: str, user_name: str = "User"):
    """Build the LangGraph agent for internal queries.

    This is a simpler, single-agent architecture (no supervisor/routing needed).
    The agent directly uses tools to answer operational questions.
    """

    current_time = get_current_time_str()

    # Create LLM with tool binding
    llm = ChatOpenAI(
        model=settings.OPENAI_MODEL,
        api_key=settings.OPENAI_API_KEY,
        temperature=0.3,  # Lower temperature for factual answers
        max_tokens=1000,
    )

    # Create all internal tools
    inventory_tools = create_inventory_tools(db, company_id)
    staff_tools = create_staff_tools(db, company_id)
    reservation_tools = create_internal_reservation_tools(db, company_id)
    table_tools = create_table_tools(db, company_id)
    analytics_tools = create_analytics_tools(db, company_id)

    all_tools_list = inventory_tools + staff_tools + reservation_tools + table_tools + analytics_tools
    tool_map = {t.name: t for t in all_tools_list}

    # Bind tools to LLM
    llm_with_tools = llm.bind_tools(all_tools_list)

    # ==================== Agent Node ====================

    async def assistant_node(state: InternalAgentState) -> dict:
        """Internal assistant: answers queries using operational tools."""
        system_prompt = get_internal_assistant_prompt(company_name, current_time, user_name)

        messages = [SystemMessage(content=system_prompt)] + state["messages"]
        tools_used = list(state.get("tools_used", []))

        # ReAct loop — allow multiple tool calls
        max_iterations = 6
        for i in range(max_iterations):
            response = await llm_with_tools.ainvoke(messages)

            if not response.tool_calls:
                # No tool calls — agent has a direct response
                return {
                    "messages": [response],
                    "tools_used": tools_used,
                }

            # Process tool calls
            messages.append(response)

            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                logger.info(f"Internal agent calling tool: {tool_name}({tool_args})")

                tool_fn = tool_map.get(tool_name)
                if tool_fn:
                    try:
                        result = await tool_fn.ainvoke(tool_args)
                        tools_used.append(tool_name)
                    except Exception as e:
                        logger.error(f"Internal tool {tool_name} error: {e}")
                        result = f"Error executing {tool_name}: {str(e)}"
                else:
                    result = f"Unknown tool: {tool_name}"

                messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

        # Exhausted iterations — get final response
        final_response = await llm.ainvoke(messages)
        return {
            "messages": [final_response],
            "tools_used": tools_used,
        }

    # ==================== Build Graph ====================

    graph = StateGraph(InternalAgentState)
    graph.add_node("assistant", assistant_node)
    graph.add_edge(START, "assistant")
    graph.add_edge("assistant", END)

    return graph.compile()
