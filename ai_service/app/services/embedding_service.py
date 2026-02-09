"""Embedding service using OpenAI for vector operations."""
import logging
from typing import List, Optional
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, func
from uuid import UUID

from app.core.config import settings
from app.models.knowledge_base import KnowledgeEntry, MenuEmbedding

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Handles embedding generation and semantic search."""

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = settings.OPENAI_EMBEDDING_MODEL
        self.dimensions = settings.OPENAI_EMBEDDING_DIMENSIONS

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for a single text."""
        response = await self.client.embeddings.create(
            model=self.model,
            input=text,
            dimensions=self.dimensions,
        )
        return response.data[0].embedding

    async def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a batch of texts."""
        if not texts:
            return []

        # OpenAI allows up to 2048 inputs per request
        batch_size = settings.EMBEDDING_BATCH_SIZE
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = await self.client.embeddings.create(
                model=self.model,
                input=batch,
                dimensions=self.dimensions,
            )
            all_embeddings.extend([item.embedding for item in response.data])

        return all_embeddings

    async def embed_knowledge_entry(self, db: AsyncSession, entry: KnowledgeEntry) -> None:
        """Generate and store embedding for a knowledge entry."""
        # Combine title, content, keywords for rich embedding
        text_parts = [entry.title, entry.content]
        if entry.short_answer:
            text_parts.append(entry.short_answer)
        if entry.keywords:
            text_parts.append(" ".join(entry.keywords))

        combined_text = " | ".join(text_parts)
        embedding = await self.generate_embedding(combined_text)
        entry.embedding = embedding
        await db.flush()
        logger.info(f"Embedded knowledge entry: {entry.title}")

    async def embed_all_knowledge(self, db: AsyncSession, company_id: UUID) -> int:
        """Generate embeddings for all knowledge entries without them."""
        result = await db.execute(
            select(KnowledgeEntry).where(
                KnowledgeEntry.company_id == company_id,
                KnowledgeEntry.is_active == True,
                KnowledgeEntry.embedding == None,
            )
        )
        entries = result.scalars().all()

        if not entries:
            return 0

        texts = []
        for entry in entries:
            parts = [entry.title, entry.content]
            if entry.short_answer:
                parts.append(entry.short_answer)
            if entry.keywords:
                parts.append(" ".join(entry.keywords))
            texts.append(" | ".join(parts))

        embeddings = await self.generate_embeddings_batch(texts)

        for entry, embedding in zip(entries, embeddings):
            entry.embedding = embedding

        await db.flush()
        logger.info(f"Embedded {len(entries)} knowledge entries for company {company_id}")
        return len(entries)

    async def sync_menu_embeddings(self, db: AsyncSession, company_id: UUID) -> int:
        """Sync menu items from the menu_items table and generate embeddings."""
        # Query existing menu items from the backend's tables
        menu_query = text("""
            SELECT mi.id, mi.name, mi.description, mi.base_price, mi.is_available,
                   mc.name as category_name,
                   COALESCE(
                       (SELECT json_agg(t.name) FROM menu_item_tags mt 
                        JOIN menu_tags t ON t.id = mt.tag_id 
                        WHERE mt.menu_item_id = mi.id), '[]'
                   ) as tags,
                   COALESCE(
                       (SELECT json_agg(a.name) FROM menu_item_allergens mia 
                        JOIN menu_allergens a ON a.id = mia.allergen_id 
                        WHERE mia.menu_item_id = mi.id), '[]'
                   ) as allergens
            FROM menu_items mi
            LEFT JOIN menu_categories mc ON mc.id = mi.category_id
            WHERE mi.company_id = :company_id AND mi.is_active = true
        """)

        result = await db.execute(menu_query, {"company_id": company_id})
        menu_items = result.fetchall()

        if not menu_items:
            return 0

        synced = 0
        for item in menu_items:
            # Build the text to embed
            text_parts = [item.name]
            if item.description:
                text_parts.append(item.description)
            if item.category_name:
                text_parts.append(f"Category: {item.category_name}")
            if item.base_price:
                text_parts.append(f"Price: ${item.base_price:.2f}")
            if item.tags and item.tags != [None]:
                text_parts.append(f"Tags: {', '.join([t for t in item.tags if t])}")
            if item.allergens and item.allergens != [None]:
                text_parts.append(f"Allergens: {', '.join([a for a in item.allergens if a])}")

            embedded_text = " | ".join(text_parts)

            # Check if embedding exists
            existing = await db.execute(
                select(MenuEmbedding).where(MenuEmbedding.menu_item_id == item.id)
            )
            menu_emb = existing.scalar_one_or_none()

            if menu_emb:
                # Update existing
                menu_emb.item_name = item.name
                menu_emb.item_description = item.description
                menu_emb.category_name = item.category_name
                menu_emb.price = float(item.base_price) if item.base_price else None
                menu_emb.allergens = [a for a in (item.allergens or []) if a]
                menu_emb.tags = [t for t in (item.tags or []) if t]
                menu_emb.is_available = item.is_available
                menu_emb.embedded_text = embedded_text
                # Re-embed if text changed
                embedding = await self.generate_embedding(embedded_text)
                menu_emb.embedding = embedding
            else:
                # Create new
                embedding = await self.generate_embedding(embedded_text)
                menu_emb = MenuEmbedding(
                    company_id=company_id,
                    menu_item_id=item.id,
                    item_name=item.name,
                    item_description=item.description,
                    category_name=item.category_name,
                    price=float(item.base_price) if item.base_price else None,
                    allergens=[a for a in (item.allergens or []) if a],
                    tags=[t for t in (item.tags or []) if t],
                    is_available=item.is_available,
                    embedded_text=embedded_text,
                    embedding=embedding,
                )
                db.add(menu_emb)

            synced += 1

        await db.flush()
        logger.info(f"Synced {synced} menu embeddings for company {company_id}")
        return synced

    async def search_knowledge(
        self, db: AsyncSession, company_id: UUID, query: str, limit: int = 5
    ) -> List[dict]:
        """Semantic search over knowledge base entries."""
        query_embedding = await self.generate_embedding(query)

        result = await db.execute(
            text("""
                SELECT id, title, content, short_answer, entry_type, priority, extra_data, keywords,
                       1 - (embedding <=> CAST(:embedding AS vector)) as similarity
                FROM knowledge_entries
                WHERE company_id = :company_id
                  AND is_active = true
                  AND embedding IS NOT NULL
                ORDER BY embedding <=> CAST(:embedding AS vector)
                LIMIT :limit
            """),
            {
                "embedding": str(query_embedding),
                "company_id": company_id,
                "limit": limit,
            },
        )

        results = []
        for row in result.fetchall():
            results.append({
                "id": row.id,
                "source": "knowledge",
                "title": row.title,
                "content": row.short_answer or row.content,
                "score": float(row.similarity),
                "metadata": {
                    "entry_type": row.entry_type,
                    "priority": row.priority,
                    "keywords": row.keywords or [],
                    **(row.extra_data or {}),
                },
            })

        return results

    async def search_menu(
        self, db: AsyncSession, company_id: UUID, query: str, limit: int = 5
    ) -> List[dict]:
        """Semantic search over menu items."""
        query_embedding = await self.generate_embedding(query)

        result = await db.execute(
            text("""
                SELECT id, menu_item_id, item_name, item_description, category_name,
                       price, allergens, tags, is_available,
                       1 - (embedding <=> CAST(:embedding AS vector)) as similarity
                FROM menu_embeddings
                WHERE company_id = :company_id
                  AND is_available = true
                  AND embedding IS NOT NULL
                ORDER BY embedding <=> CAST(:embedding AS vector)
                LIMIT :limit
            """),
            {
                "embedding": str(query_embedding),
                "company_id": company_id,
                "limit": limit,
            },
        )

        results = []
        for row in result.fetchall():
            results.append({
                "id": row.id,
                "source": "menu",
                "title": row.item_name,
                "content": row.item_description or row.item_name,
                "score": float(row.similarity),
                "metadata": {
                    "menu_item_id": str(row.menu_item_id),
                    "category": row.category_name,
                    "price": row.price,
                    "allergens": row.allergens or [],
                    "tags": row.tags or [],
                },
            })

        return results

    async def search_all(
        self, db: AsyncSession, company_id: UUID, query: str, limit: int = 5
    ) -> List[dict]:
        """Combined semantic search over knowledge base and menu."""
        knowledge_results = await self.search_knowledge(db, company_id, query, limit)
        menu_results = await self.search_menu(db, company_id, query, limit)

        # Merge and sort by score
        all_results = knowledge_results + menu_results
        all_results.sort(key=lambda x: x["score"], reverse=True)

        return all_results[:limit]


# Singleton
embedding_service = EmbeddingService()
