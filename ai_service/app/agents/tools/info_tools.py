"""Information tools for the AI agent - knowledge base and menu search."""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from langchain_core.tools import tool
from app.services.embedding_service import embedding_service
from app.core.config import settings

logger = logging.getLogger(__name__)


def create_info_tools(db: AsyncSession, company_id: str):
    """Create information tools bound to a specific db session and company."""

    @tool
    async def search_knowledge(query: str) -> str:
        """Search the restaurant's knowledge base for information about hours, address, policies, FAQ, campaigns, and general info.

        Args:
            query: Natural language question or keywords to search for
        """
        try:
            # If embeddings are available, use semantic search
            if settings.OPENAI_API_KEY:
                results = await embedding_service.search_knowledge(db, company_id, query, limit=3)
                if results:
                    lines = []
                    for r in results:
                        lines.append(f"[{r['metadata'].get('entry_type', 'info')}] {r['title']}: {r['content']}")
                    return "\n\n".join(lines)

            # Fallback: keyword search
            result = await db.execute(text("""
                SELECT title, content, short_answer, entry_type
                FROM knowledge_entries
                WHERE company_id = :company_id
                  AND is_active = true
                  AND (
                      title ILIKE :query
                      OR content ILIKE :query
                      OR short_answer ILIKE :query
                      OR keywords::text ILIKE :query
                  )
                ORDER BY priority DESC
                LIMIT 3
            """), {"company_id": company_id, "query": f"%{query}%"})

            entries = result.fetchall()
            if not entries:
                return f"I couldn't find specific information about '{query}' in our knowledge base."

            lines = []
            for e in entries:
                answer = e.short_answer or e.content
                lines.append(f"[{e.entry_type}] {e.title}: {answer}")

            return "\n\n".join(lines)

        except Exception as e:
            logger.error(f"search_knowledge error: {e}")
            return "I'm having trouble searching our information right now."

    @tool
    async def search_menu(query: str) -> str:
        """Search the restaurant menu for dishes, prices, ingredients, and allergen information.

        Args:
            query: Dish name, ingredient, dietary requirement, or food type to search for
        """
        try:
            # If embeddings are available, use semantic search
            if settings.OPENAI_API_KEY:
                results = await embedding_service.search_menu(db, company_id, query, limit=5)
                if results:
                    lines = []
                    for r in results:
                        meta = r.get("metadata", {})
                        price_str = f" - ${meta['price']:.2f}" if meta.get("price") else ""
                        allergen_str = f" (Allergens: {', '.join(meta['allergens'])})" if meta.get("allergens") else ""
                        tag_str = f" [{', '.join(meta['tags'])}]" if meta.get("tags") else ""
                        category_str = f" ({meta['category']})" if meta.get("category") else ""
                        lines.append(f"• {r['title']}{category_str}{price_str}{tag_str}{allergen_str}\n  {r['content']}")
                    return "Here are the matching menu items:\n\n" + "\n\n".join(lines)

            # Fallback: direct database search
            result = await db.execute(text("""
                SELECT mi.name, mi.description, mi.base_price, mc.name as category,
                       mi.is_available,
                       COALESCE(
                           (SELECT string_agg(a.name, ', ')
                            FROM menu_item_allergens mia
                            JOIN menu_allergens a ON a.id = mia.allergen_id
                            WHERE mia.menu_item_id = mi.id), ''
                       ) as allergens
                FROM menu_items mi
                LEFT JOIN menu_categories mc ON mc.id = mi.category_id
                WHERE mi.company_id = :company_id
                  AND mi.is_active = true
                  AND (
                      mi.name ILIKE :query
                      OR mi.description ILIKE :query
                      OR mc.name ILIKE :query
                  )
                ORDER BY mi.is_available DESC, mi.base_price ASC
                LIMIT 5
            """), {"company_id": company_id, "query": f"%{query}%"})

            items = result.fetchall()
            if not items:
                return f"I couldn't find any menu items matching '{query}'. Would you like me to suggest something else?"

            lines = []
            for item in items:
                price_str = f" - ${item.base_price:.2f}" if item.base_price else ""
                status = " (Currently unavailable)" if not item.is_available else ""
                allergen_str = f" (Allergens: {item.allergens})" if item.allergens else ""
                lines.append(f"• {item.name} ({item.category or 'Menu'}){price_str}{status}{allergen_str}\n  {item.description or ''}")

            return "Here are the matching menu items:\n\n" + "\n\n".join(lines)

        except Exception as e:
            logger.error(f"search_menu error: {e}")
            return "I'm having trouble searching our menu right now."

    return [search_knowledge, search_menu]
