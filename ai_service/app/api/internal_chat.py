"""Internal Chat API endpoints — authenticated staff/owner AI assistant."""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.config import settings
from app.services.internal_conversation_service import InternalConversationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal-chat", tags=["Internal AI Assistant"])


# ==================== Auth Helper ====================

async def verify_jwt_and_get_user(
    authorization: str = Header(..., description="Bearer token"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Verify JWT token by querying the backend's users table.

    Since the AI service shares the same database, we can verify the token
    by decoding it (or querying the users table directly).
    For simplicity, we validate the token against the backend's token structure.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization.replace("Bearer ", "")

    # Decode JWT to get user_id (using the same secret as the backend)
    try:
        from jose import jwt, JWTError
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

    # Get user info from database
    result = await db.execute(
        text("""
            SELECT u.id, u.email, u.first_name, u.last_name, u.company_id,
                   c.name as company_name
            FROM users u
            JOIN companies c ON u.company_id = c.id
            WHERE u.id = :user_id AND u.is_active = true
        """),
        {"user_id": user_id},
    )
    user = result.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    return {
        "user_id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "company_id": str(user.company_id),
        "company_name": user.company_name,
        "full_name": f"{user.first_name} {user.last_name}",
    }


# ==================== Schemas ====================

class InternalChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="User message")
    session_id: Optional[str] = Field(None, description="Session ID for continuing a conversation")


class InternalChatResponse(BaseModel):
    response: str
    session_id: str
    tools_used: list[str] = []
    latency_ms: int = 0


# ==================== Endpoints ====================

@router.post("", response_model=InternalChatResponse)
async def internal_chat(
    data: InternalChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_jwt_and_get_user),
):
    """Send a message to the internal AI assistant.

    Requires a valid JWT token. The assistant can answer questions about
    inventory, staff, reservations, tables, and analytics.
    """
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured.")

    logger.info(
        f"Internal chat from {current_user['full_name']} "
        f"(company: {current_user['company_name']}): {data.message[:80]}..."
    )

    service = InternalConversationService(db)
    result = await service.chat(
        company_id=current_user["company_id"],
        company_name=current_user["company_name"],
        user_name=current_user["full_name"],
        message=data.message,
        session_id=data.session_id,
    )

    return InternalChatResponse(**result)


@router.get("/sessions")
async def list_internal_sessions(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_jwt_and_get_user),
):
    """List recent internal chat sessions."""
    result = await db.execute(
        text("""
            SELECT session_id,
                   MIN(created_at) as started_at,
                   MAX(created_at) as last_message_at,
                   COUNT(*) as message_count
            FROM conversation_logs
            WHERE company_id = :company_id
              AND session_id LIKE 'internal-%'
            GROUP BY session_id
            ORDER BY MAX(created_at) DESC
            LIMIT :limit
        """),
        {"company_id": current_user["company_id"], "limit": limit},
    )

    sessions = []
    for row in result.fetchall():
        sessions.append({
            "session_id": row.session_id,
            "started_at": row.started_at.isoformat() if row.started_at else None,
            "last_message_at": row.last_message_at.isoformat() if row.last_message_at else None,
            "message_count": row.message_count,
        })
    return sessions


@router.get("/sessions/{session_id}")
async def get_internal_session_history(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(verify_jwt_and_get_user),
):
    """Get full message history for an internal chat session."""
    result = await db.execute(
        text("""
            SELECT role, content, input_type, tool_name, latency_ms, created_at
            FROM conversation_logs
            WHERE session_id = :sid AND company_id = :cid
              AND role IN ('user', 'assistant')
            ORDER BY created_at ASC
        """),
        {"sid": session_id, "cid": current_user["company_id"]},
    )

    messages = []
    for row in result.fetchall():
        messages.append({
            "role": row.role,
            "content": row.content,
            "tool_name": row.tool_name,
            "latency_ms": row.latency_ms,
            "timestamp": row.created_at.isoformat() if row.created_at else None,
        })

    if not messages:
        raise HTTPException(status_code=404, detail="Session not found")
    return messages
