"""Agent state definition for the restaurant phone call simulation."""
from typing import TypedDict, List, Optional, Annotated
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """State shared across all agents in the conversation graph."""

    # Conversation messages (LangGraph auto-manages append with add_messages)
    messages: Annotated[List[BaseMessage], add_messages]

    # Context
    company_id: str
    company_name: str
    session_id: str
    customer_phone: Optional[str]

    # Routing
    next_agent: str  # "supervisor", "reservation", "information", "farewell", "__end__"

    # Reservation draft (being built step by step during conversation)
    reservation_draft: Optional[dict]

    # Recognized customer info
    customer_info: Optional[dict]

    # Conversation metadata
    call_active: bool
    tools_used: List[str]
