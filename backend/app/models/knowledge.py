"""
AI Knowledge Base and Conversation models for the AI voice agent.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Integer, Float,
    Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ========================== Knowledge Base ==========================

class KnowledgeBase(Base):
    """
    Knowledge base entries for the AI agent.
    Includes FAQs, policies, general info, and custom responses.
    Uses pgvector for semantic search.
    """
    __tablename__ = "knowledge_base"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(50), nullable=False)
    # faq, policy, general_info, greeting, hours, address, directions, parking,
    # reservation_policy, cancellation_policy, dress_code, payment_info, events, custom
    title = Column(String(200), nullable=False)
    question = Column(Text, nullable=True)  # For FAQ-style entries
    answer = Column(Text, nullable=False)  # The content/response
    short_answer = Column(String(500), nullable=True)  # Brief version for voice
    keywords = Column(Text, nullable=True)  # Comma-separated keywords for boosting search
    language = Column(String(10), default="en", nullable=False)

    # Vector embedding for semantic search
    embedding = Column(Vector(1536), nullable=True)  # OpenAI text-embedding-3-small

    # Priority & ordering
    priority = Column(Integer, default=0, nullable=False)  # Higher = more important
    sort_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_public = Column(Boolean, default=True, nullable=False)  # Can AI share this info?

    # Metadata
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    usage_count = Column(Integer, default=0, nullable=False)

    # Audit
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])

    __table_args__ = (
        Index("ix_knowledge_base_company", "company_id"),
        Index("ix_knowledge_base_category", "company_id", "category"),
        Index("ix_knowledge_base_active", "company_id", "is_active"),
    )


# ========================== AI Conversations ==========================

class AIConversation(Base):
    """Log of AI agent conversations (phone calls, chat sessions)."""
    __tablename__ = "ai_conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(String(100), nullable=False, unique=True)

    # Caller info
    caller_phone = Column(String(50), nullable=True)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    customer_name = Column(String(200), nullable=True)  # Detected during conversation

    # Session info
    channel = Column(String(20), default="voice", nullable=False)  # voice, chat, web_simulator
    language = Column(String(10), default="en", nullable=False)
    started_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=True)

    # Outcome
    status = Column(String(20), default="active", nullable=False)
    # active, completed, abandoned, error, transferred_to_human
    summary = Column(Text, nullable=True)  # AI-generated conversation summary
    sentiment = Column(String(20), nullable=True)  # positive, neutral, negative, mixed
    satisfaction_score = Column(Float, nullable=True)  # 1-5 scale
    intent_detected = Column(String(50), nullable=True)
    # reservation, menu_inquiry, hours, address, cancellation, complaint, general

    # Actions taken by the AI
    actions_taken = Column(JSONB, nullable=True)
    # [{"action": "create_reservation", "entity_id": "...", "success": true}]
    reservation_id = Column(UUID(as_uuid=True), ForeignKey("reservations.id", ondelete="SET NULL"), nullable=True)

    # Quality metrics
    total_messages = Column(Integer, default=0, nullable=False)
    total_tokens_used = Column(Integer, default=0, nullable=False)
    model_used = Column(String(50), nullable=True)  # "gpt-4o-mini"
    error_message = Column(Text, nullable=True)

    # Escalation
    was_escalated = Column(Boolean, default=False, nullable=False)
    escalated_to = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    escalation_reason = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    customer = relationship("Customer")
    reservation = relationship("Reservation")
    messages = relationship("AIConversationMessage", back_populates="conversation", cascade="all, delete-orphan")
    escalated_user = relationship("User", foreign_keys=[escalated_to])

    __table_args__ = (
        Index("ix_ai_conversations_company", "company_id"),
        Index("ix_ai_conversations_session", "session_id"),
        Index("ix_ai_conversations_date", "company_id", "started_at"),
        Index("ix_ai_conversations_customer", "customer_id"),
        Index("ix_ai_conversations_status", "company_id", "status"),
    )


# ========================== AI Conversation Messages ==========================

class AIConversationMessage(Base):
    """Individual messages within an AI conversation."""
    __tablename__ = "ai_conversation_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False)

    role = Column(String(20), nullable=False)  # user, assistant, system, tool
    content = Column(Text, nullable=False)

    # Audio info (for voice conversations)
    audio_url = Column(String(500), nullable=True)  # Stored audio file URL
    audio_duration_seconds = Column(Float, nullable=True)

    # Tool calls (if assistant used tools)
    tool_calls = Column(JSONB, nullable=True)
    # [{"tool": "create_reservation", "args": {...}, "result": {...}}]

    # Metadata
    tokens_used = Column(Integer, nullable=True)
    processing_time_ms = Column(Integer, nullable=True)
    confidence_score = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    conversation = relationship("AIConversation", back_populates="messages")

    __table_args__ = (
        Index("ix_ai_messages_conversation", "conversation_id"),
        Index("ix_ai_messages_date", "conversation_id", "created_at"),
    )
