"""Schemas for Knowledge Base."""
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from uuid import UUID
from datetime import datetime


# ==================== Knowledge Category ====================

class KnowledgeCategoryCreate(BaseModel):
    name: str = Field(..., max_length=100)
    display_name: str = Field(..., max_length=200)
    description: Optional[str] = None
    icon: Optional[str] = None
    sort_order: int = 0


class KnowledgeCategoryResponse(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    display_name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    sort_order: int
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ==================== Knowledge Entry ====================

class KnowledgeEntryCreate(BaseModel):
    category_id: Optional[UUID] = None
    title: str = Field(..., max_length=300)
    content: str
    short_answer: Optional[str] = None
    keywords: List[str] = []
    entry_type: str = "info"
    priority: int = 0
    extra_data: dict = {}


class KnowledgeEntryUpdate(BaseModel):
    category_id: Optional[UUID] = None
    title: Optional[str] = None
    content: Optional[str] = None
    short_answer: Optional[str] = None
    keywords: Optional[List[str]] = None
    entry_type: Optional[str] = None
    priority: Optional[int] = None
    extra_data: Optional[dict] = None
    is_active: Optional[bool] = None


class KnowledgeEntryResponse(BaseModel):
    id: UUID
    company_id: UUID
    category_id: Optional[UUID] = None
    title: str
    content: str
    short_answer: Optional[str] = None
    keywords: List[Any] = []
    entry_type: str
    priority: int
    extra_data: dict = {}
    is_active: bool
    has_embedding: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ==================== Menu Embedding ====================

class MenuEmbeddingResponse(BaseModel):
    id: UUID
    menu_item_id: UUID
    item_name: str
    item_description: Optional[str] = None
    category_name: Optional[str] = None
    price: Optional[float] = None
    allergens: List[str] = []
    tags: List[str] = []
    is_available: bool
    last_synced_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ==================== Search ====================

class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    search_type: str = "all"  # "all", "knowledge", "menu"
    limit: int = Field(5, ge=1, le=20)


class SearchResult(BaseModel):
    id: UUID
    source: str  # "knowledge" or "menu"
    title: str
    content: str
    score: float  # Similarity score (0-1)
    extra_data: dict = {}


class SemanticSearchResponse(BaseModel):
    query: str
    results: List[SearchResult]
    total: int


# ==================== Conversation ====================

class ConversationMessage(BaseModel):
    role: str
    content: str
    tool_calls: Optional[List[dict]] = None
    tool_name: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    company_id: UUID
    customer_phone: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    tool_calls_made: List[str] = []


# ==================== Sync ====================

class SyncStatusResponse(BaseModel):
    menu_items_synced: int
    knowledge_entries_with_embeddings: int
    knowledge_entries_total: int
    last_sync: Optional[datetime] = None
