"""Knowledge Base API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from uuid import UUID
import math

from app.core.database import get_db
from app.models.knowledge_base import KnowledgeCategory, KnowledgeEntry, MenuEmbedding
from app.schemas.knowledge import (
    KnowledgeCategoryCreate, KnowledgeCategoryResponse,
    KnowledgeEntryCreate, KnowledgeEntryUpdate, KnowledgeEntryResponse,
    MenuEmbeddingResponse, SyncStatusResponse,
    SemanticSearchRequest, SemanticSearchResponse, SearchResult,
)
from app.services.embedding_service import embedding_service

router = APIRouter(prefix="/knowledge", tags=["Knowledge Base"])


# ==================== Categories ====================

@router.get("/categories", response_model=list[KnowledgeCategoryResponse])
async def list_categories(
    company_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """List all knowledge categories for a company."""
    result = await db.execute(
        select(KnowledgeCategory)
        .where(KnowledgeCategory.company_id == company_id, KnowledgeCategory.is_active == True)
        .order_by(KnowledgeCategory.sort_order)
    )
    return [KnowledgeCategoryResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/categories", response_model=KnowledgeCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    company_id: UUID,
    data: KnowledgeCategoryCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new knowledge category."""
    category = KnowledgeCategory(company_id=company_id, **data.model_dump())
    db.add(category)
    await db.flush()
    await db.refresh(category)
    return KnowledgeCategoryResponse.model_validate(category)


# ==================== Entries ====================

@router.get("/entries", response_model=dict)
async def list_entries(
    company_id: UUID = Query(...),
    category_id: Optional[UUID] = None,
    entry_type: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List knowledge entries with filtering."""
    query = select(KnowledgeEntry).where(
        KnowledgeEntry.company_id == company_id,
        KnowledgeEntry.is_active == True,
    )

    if category_id:
        query = query.where(KnowledgeEntry.category_id == category_id)
    if entry_type:
        query = query.where(KnowledgeEntry.entry_type == entry_type)
    if search:
        from sqlalchemy import or_
        query = query.where(or_(
            KnowledgeEntry.title.ilike(f"%{search}%"),
            KnowledgeEntry.content.ilike(f"%{search}%"),
        ))

    # Count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    # Paginate
    query = query.order_by(KnowledgeEntry.priority.desc(), KnowledgeEntry.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    entries = result.scalars().all()

    items = []
    for e in entries:
        resp = KnowledgeEntryResponse.model_validate(e)
        resp.has_embedding = e.embedding is not None
        items.append(resp)

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total else 0,
    }


@router.post("/entries", response_model=KnowledgeEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_entry(
    company_id: UUID,
    data: KnowledgeEntryCreate,
    auto_embed: bool = Query(True, description="Auto-generate embedding"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new knowledge entry."""
    entry = KnowledgeEntry(company_id=company_id, **data.model_dump())
    db.add(entry)
    await db.flush()

    # Auto-generate embedding if requested
    if auto_embed and settings.OPENAI_API_KEY:
        try:
            await embedding_service.embed_knowledge_entry(db, entry)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to embed entry: {e}")

    await db.refresh(entry)
    resp = KnowledgeEntryResponse.model_validate(entry)
    resp.has_embedding = entry.embedding is not None
    return resp


@router.put("/entries/{entry_id}", response_model=KnowledgeEntryResponse)
async def update_entry(
    entry_id: UUID,
    company_id: UUID,
    data: KnowledgeEntryUpdate,
    re_embed: bool = Query(True, description="Re-generate embedding"),
    db: AsyncSession = Depends(get_db),
):
    """Update a knowledge entry."""
    result = await db.execute(
        select(KnowledgeEntry).where(
            KnowledgeEntry.id == entry_id,
            KnowledgeEntry.company_id == company_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(entry, key, value)

    # Re-embed if content changed
    if re_embed and settings.OPENAI_API_KEY and ("title" in update_data or "content" in update_data):
        try:
            await embedding_service.embed_knowledge_entry(db, entry)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to re-embed entry: {e}")

    await db.flush()
    await db.refresh(entry)
    resp = KnowledgeEntryResponse.model_validate(entry)
    resp.has_embedding = entry.embedding is not None
    return resp


@router.delete("/entries/{entry_id}")
async def delete_entry(
    entry_id: UUID,
    company_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a knowledge entry."""
    result = await db.execute(
        select(KnowledgeEntry).where(
            KnowledgeEntry.id == entry_id,
            KnowledgeEntry.company_id == company_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry.is_active = False
    await db.flush()
    return {"message": "Entry deleted"}


# ==================== Search ====================

@router.post("/search", response_model=SemanticSearchResponse)
async def semantic_search(
    data: SemanticSearchRequest,
    company_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Perform semantic search over knowledge base and/or menu."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    if data.search_type == "knowledge":
        raw_results = await embedding_service.search_knowledge(db, company_id, data.query, data.limit)
    elif data.search_type == "menu":
        raw_results = await embedding_service.search_menu(db, company_id, data.query, data.limit)
    else:
        raw_results = await embedding_service.search_all(db, company_id, data.query, data.limit)

    results = [SearchResult(**r) for r in raw_results]
    return SemanticSearchResponse(query=data.query, results=results, total=len(results))


# ==================== Sync & Embeddings ====================

@router.post("/sync/menu-embeddings")
async def sync_menu_embeddings(
    company_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Sync menu items and generate embeddings."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    count = await embedding_service.sync_menu_embeddings(db, company_id)
    return {"message": f"Synced {count} menu item embeddings", "synced": count}


@router.post("/sync/knowledge-embeddings")
async def sync_knowledge_embeddings(
    company_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Generate embeddings for knowledge entries that don't have them."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    count = await embedding_service.embed_all_knowledge(db, company_id)
    return {"message": f"Embedded {count} knowledge entries", "embedded": count}


@router.get("/sync/status", response_model=SyncStatusResponse)
async def get_sync_status(
    company_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get embedding sync status for a company."""
    # Menu embeddings count
    menu_count = (await db.execute(
        select(func.count()).where(MenuEmbedding.company_id == company_id)
    )).scalar()

    # Knowledge entries counts
    total_knowledge = (await db.execute(
        select(func.count()).where(
            KnowledgeEntry.company_id == company_id,
            KnowledgeEntry.is_active == True,
        )
    )).scalar()

    embedded_knowledge = (await db.execute(
        select(func.count()).where(
            KnowledgeEntry.company_id == company_id,
            KnowledgeEntry.is_active == True,
            KnowledgeEntry.embedding != None,
        )
    )).scalar()

    # Last sync time
    last_sync = (await db.execute(
        select(func.max(MenuEmbedding.last_synced_at)).where(MenuEmbedding.company_id == company_id)
    )).scalar()

    return SyncStatusResponse(
        menu_items_synced=menu_count,
        knowledge_entries_with_embeddings=embedded_knowledge,
        knowledge_entries_total=total_knowledge,
        last_sync=last_sync,
    )


# Need this import at the module level for the auto_embed feature
from app.core.config import settings
