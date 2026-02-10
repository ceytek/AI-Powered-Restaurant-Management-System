"""Chat API endpoints for the AI agent."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.config import settings
from app.services.conversation_service import ConversationService

router = APIRouter(prefix="/chat", tags=["AI Chat Agent"])


# ==================== Schemas ====================

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="User message")
    session_id: Optional[str] = Field(None, description="Session ID for continuing a conversation")
    customer_phone: Optional[str] = Field(None, description="Customer phone number (for caller ID)")
    input_type: Optional[str] = Field("text", description="Input type: text or voice")


class ChatResponse(BaseModel):
    response: str
    session_id: str
    tools_used: list[str] = []
    latency_ms: int = 0
    call_active: bool = True


class SessionInfo(BaseModel):
    session_id: str
    started_at: Optional[str] = None
    last_message_at: Optional[str] = None
    message_count: int = 0
    customer_phone: Optional[str] = None


class MessageInfo(BaseModel):
    role: str
    content: str
    input_type: Optional[str] = None
    tool_name: Optional[str] = None
    latency_ms: Optional[int] = None
    timestamp: Optional[str] = None


# ==================== Endpoints ====================

@router.post("", response_model=ChatResponse)
async def send_message(
    data: ChatRequest,
    company_id: UUID = Query(..., description="Company ID"),
    db: AsyncSession = Depends(get_db),
):
    """Send a message to the AI agent and get a response.

    This simulates a phone call with the restaurant's AI receptionist.
    Start a new conversation by omitting session_id, or continue one by providing it.
    """
    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key not configured. Please set OPENAI_API_KEY in environment.",
        )

    # Get company name
    company_q = await db.execute(
        text("SELECT name FROM companies WHERE id = :cid LIMIT 1"),
        {"cid": str(company_id)},
    )
    company = company_q.fetchone()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Process message through agent
    service = ConversationService(db)
    result = await service.chat(
        company_id=str(company_id),
        company_name=company.name,
        message=data.message,
        session_id=data.session_id,
        customer_phone=data.customer_phone,
        input_type=data.input_type or "text",
    )

    return ChatResponse(**result)


@router.get("/sessions", response_model=list[SessionInfo])
async def list_sessions(
    company_id: UUID = Query(...),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List recent conversation sessions."""
    service = ConversationService(db)
    sessions = await service.list_sessions(str(company_id), limit)
    return [SessionInfo(**s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=list[MessageInfo])
async def get_session_history(
    session_id: str,
    company_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get full message history for a conversation session."""
    service = ConversationService(db)
    messages = await service.get_session_history(session_id, str(company_id))
    if not messages:
        raise HTTPException(status_code=404, detail="Session not found")
    return [MessageInfo(**m) for m in messages]


@router.post("/start", response_model=ChatResponse)
async def start_call(
    company_id: UUID = Query(...),
    customer_phone: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Start a new phone call simulation.

    This initiates the conversation with the AI greeting the caller.
    Returns the AI's opening greeting and a new session_id.
    """
    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key not configured.",
        )

    # Get company name
    company_q = await db.execute(
        text("SELECT name FROM companies WHERE id = :cid LIMIT 1"),
        {"cid": str(company_id)},
    )
    company = company_q.fetchone()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Start with an implicit "phone ringing" message
    service = ConversationService(db)
    result = await service.chat(
        company_id=str(company_id),
        company_name=company.name,
        message="[Phone rings - customer picks up]",
        session_id=None,
        customer_phone=customer_phone,
        input_type="system",
    )

    return ChatResponse(**result)
