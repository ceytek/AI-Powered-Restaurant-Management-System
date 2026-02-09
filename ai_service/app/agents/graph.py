"""LangGraph multi-agent graph for restaurant phone call simulation."""
import json
import re
import logging
from typing import Literal

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END

from app.agents.state import AgentState
from app.agents.prompts import (
    get_supervisor_prompt,
    get_reservation_agent_prompt,
    get_info_agent_prompt,
    get_current_time_str,
)
from app.agents.tools.reservation_tools import create_reservation_tools
from app.agents.tools.info_tools import create_info_tools
from app.core.config import settings

logger = logging.getLogger(__name__)


# Supervisor uses structured output via function calling for reliable routing
SUPERVISOR_FUNCTIONS = [
    {
        "type": "function",
        "function": {
            "name": "route_call",
            "description": "Route the phone call to the appropriate specialist or respond directly.",
            "parameters": {
                "type": "object",
                "properties": {
                    "route": {
                        "type": "string",
                        "enum": ["self", "reservation", "information", "farewell"],
                        "description": "Who should handle this: 'self' for greetings/general, 'reservation' for booking-related, 'information' for menu/hours/info questions, 'farewell' for goodbyes",
                    },
                    "message": {
                        "type": "string",
                        "description": "Your spoken response to the caller. Required when route is 'self' or 'farewell'. Leave empty when routing to a specialist.",
                    },
                },
                "required": ["route", "message"],
            },
        },
    }
]


def build_agent_graph(db, company_id: str, company_name: str):
    """Build the LangGraph agent graph with bound context.

    This creates a new graph instance for each conversation turn,
    with tools bound to the current db session and company.
    """

    current_time = get_current_time_str()

    # Create LLM instances
    supervisor_llm = ChatOpenAI(
        model=settings.OPENAI_MODEL,
        api_key=settings.OPENAI_API_KEY,
        temperature=0.7,
        max_tokens=300,
    ).bind(
        tools=SUPERVISOR_FUNCTIONS,
        tool_choice={"type": "function", "function": {"name": "route_call"}},
    )

    specialist_llm = ChatOpenAI(
        model=settings.OPENAI_MODEL,
        api_key=settings.OPENAI_API_KEY,
        temperature=0.6,
        max_tokens=500,
    )

    # Create tools
    reservation_tools = create_reservation_tools(db, company_id)
    info_tools = create_info_tools(db, company_id)

    # Bind tools to specialist LLMs
    reservation_llm = specialist_llm.bind_tools(reservation_tools)
    info_llm = specialist_llm.bind_tools(info_tools)

    # Tool lookup map
    all_tools = {t.name: t for t in reservation_tools + info_tools}

    # ==================== Node Functions ====================

    async def supervisor_node(state: AgentState) -> dict:
        """Supervisor: understands intent, routes to specialist or responds directly."""
        system_prompt = get_supervisor_prompt(company_name, current_time)

        messages = [SystemMessage(content=system_prompt)] + state["messages"]

        response = await supervisor_llm.ainvoke(messages)

        # Extract routing from function call
        route = "self"
        message = ""

        if response.tool_calls:
            tool_call = response.tool_calls[0]
            args = tool_call.get("args", {})
            route = args.get("route", "self")
            message = args.get("message", "")
        elif response.content:
            # Fallback: try to parse content as JSON or use directly
            content = response.content.strip()
            try:
                # Try JSON extraction
                json_match = re.search(r'\{[^}]+\}', content)
                if json_match:
                    parsed = json.loads(json_match.group())
                    route = parsed.get("route", "self")
                    message = parsed.get("message", content)
                else:
                    message = content
            except (json.JSONDecodeError, KeyError):
                message = content

        logger.info(f"Supervisor routed to: {route}")

        if route == "reservation":
            return {"next_agent": "reservation"}
        elif route == "information":
            return {"next_agent": "information"}
        elif route == "farewell":
            return {
                "messages": [AIMessage(content=message or "Thank you for calling! Have a wonderful day. Goodbye!")],
                "next_agent": "farewell",
                "call_active": False,
            }
        else:  # "self" - supervisor responds directly
            return {
                "messages": [AIMessage(content=message or "Hello! Thank you for calling. How can I help you today?")],
                "next_agent": "__end__",
            }

    async def reservation_node(state: AgentState) -> dict:
        """Reservation specialist: handles all reservation operations with tools."""
        system_prompt = get_reservation_agent_prompt(company_name, current_time)

        # Build messages with system prompt
        messages = [SystemMessage(content=system_prompt)] + state["messages"]

        # ReAct loop - allow multiple tool calls
        max_iterations = 5
        tools_used = list(state.get("tools_used", []))

        for i in range(max_iterations):
            response = await reservation_llm.ainvoke(messages)

            if not response.tool_calls:
                # No tool calls - agent has a direct response
                return {
                    "messages": [response],
                    "next_agent": "__end__",
                    "tools_used": tools_used,
                }

            # Process tool calls
            messages.append(response)

            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                logger.info(f"Reservation agent calling tool: {tool_name}({tool_args})")

                tool_fn = all_tools.get(tool_name)
                if tool_fn:
                    try:
                        result = await tool_fn.ainvoke(tool_args)
                        tools_used.append(tool_name)
                    except Exception as e:
                        logger.error(f"Tool {tool_name} error: {e}")
                        result = f"Error executing {tool_name}: {str(e)}"
                else:
                    result = f"Unknown tool: {tool_name}"

                messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

        # If we exhausted iterations, get final response without tools
        final_response = await specialist_llm.ainvoke(messages)
        return {
            "messages": [final_response],
            "next_agent": "__end__",
            "tools_used": tools_used,
        }

    async def info_node(state: AgentState) -> dict:
        """Information specialist: answers questions using knowledge base and menu."""
        system_prompt = get_info_agent_prompt(company_name, current_time)

        messages = [SystemMessage(content=system_prompt)] + state["messages"]

        # ReAct loop
        max_iterations = 3
        tools_used = list(state.get("tools_used", []))

        for i in range(max_iterations):
            response = await info_llm.ainvoke(messages)

            if not response.tool_calls:
                return {
                    "messages": [response],
                    "next_agent": "__end__",
                    "tools_used": tools_used,
                }

            messages.append(response)

            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                logger.info(f"Info agent calling tool: {tool_name}({tool_args})")

                tool_fn = all_tools.get(tool_name)
                if tool_fn:
                    try:
                        result = await tool_fn.ainvoke(tool_args)
                        tools_used.append(tool_name)
                    except Exception as e:
                        logger.error(f"Tool {tool_name} error: {e}")
                        result = f"Error: {str(e)}"
                else:
                    result = f"Unknown tool: {tool_name}"

                messages.append(ToolMessage(content=str(result), tool_call_id=tool_call["id"]))

        final_response = await specialist_llm.ainvoke(messages)
        return {
            "messages": [final_response],
            "next_agent": "__end__",
            "tools_used": tools_used,
        }

    # ==================== Router ====================

    def route_supervisor(state: AgentState) -> str:
        """Route based on supervisor's decision."""
        next_agent = state.get("next_agent", "__end__")
        if next_agent == "reservation":
            return "reservation"
        elif next_agent == "information":
            return "information"
        else:
            return "__end__"

    # ==================== Build Graph ====================

    graph = StateGraph(AgentState)

    # Add nodes
    graph.add_node("supervisor", supervisor_node)
    graph.add_node("reservation", reservation_node)
    graph.add_node("information", info_node)

    # Add edges
    graph.add_edge(START, "supervisor")

    graph.add_conditional_edges(
        "supervisor",
        route_supervisor,
        {
            "reservation": "reservation",
            "information": "information",
            "__end__": END,
        },
    )

    # Specialists always end the turn (user gets to respond)
    graph.add_edge("reservation", END)
    graph.add_edge("information", END)

    return graph.compile()
