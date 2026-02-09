"""Knowledge Base models for AI agent."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Boolean, Integer, Float, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from pgvector.sqlalchemy import Vector
from app.core.database import Base
from app.core.config import settings

VECTOR_DIM = settings.OPENAI_EMBEDDING_DIMENSIONS


class KnowledgeCategory(Base):
    """Categories for organizing knowledge base entries."""
    __tablename__ = "knowledge_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    name = Column(String(100), nullable=False)  # e.g. "general_info", "faq", "campaigns", "policies"
    display_name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))


class KnowledgeEntry(Base):
    """Individual knowledge base entries with vector embeddings."""
    __tablename__ = "knowledge_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("knowledge_categories.id"), nullable=True)

    # Content
    title = Column(String(300), nullable=False)
    content = Column(Text, nullable=False)  # The actual knowledge content
    short_answer = Column(Text, nullable=True)  # Concise answer for the AI to use
    keywords = Column(JSONB, default=list)  # Additional keywords for matching

    # Embedding
    embedding = Column(Vector(VECTOR_DIM), nullable=True)  # pgvector embedding

    # Metadata
    entry_type = Column(String(50), default="info")  # info, faq, policy, campaign, hours, etc.
    priority = Column(Integer, default=0)  # Higher = more important
    extra_data = Column(JSONB, default=dict)  # Flexible metadata (e.g., valid_from, valid_to for campaigns)

    # Status
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))
    created_by = Column(UUID(as_uuid=True), nullable=True)


class MenuEmbedding(Base):
    """Pre-computed embeddings for menu items (mirrors menu data with vectors)."""
    __tablename__ = "menu_embeddings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    menu_item_id = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)

    # Cached menu info for fast retrieval
    item_name = Column(String(200), nullable=False)
    item_description = Column(Text, nullable=True)
    category_name = Column(String(200), nullable=True)
    price = Column(Float, nullable=True)
    allergens = Column(JSONB, default=list)
    tags = Column(JSONB, default=list)
    is_available = Column(Boolean, default=True)

    # The combined text that was embedded
    embedded_text = Column(Text, nullable=False)

    # Vector embedding
    embedding = Column(Vector(VECTOR_DIM), nullable=True)

    # Sync tracking
    last_synced_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ConversationLog(Base):
    """Log of AI agent conversations for analytics and improvement."""
    __tablename__ = "conversation_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    session_id = Column(String(100), nullable=False, index=True)

    # Conversation
    role = Column(String(20), nullable=False)  # "user", "assistant", "system", "tool"
    content = Column(Text, nullable=False)
    tool_calls = Column(JSONB, nullable=True)  # If the assistant called tools
    tool_name = Column(String(100), nullable=True)

    # Metadata
    input_type = Column(String(20), default="text")  # "text" or "voice"
    tokens_used = Column(Integer, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    customer_phone = Column(String(50), nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
