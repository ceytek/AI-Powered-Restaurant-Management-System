"""Internal tools for inventory queries."""
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from langchain_core.tools import tool

logger = logging.getLogger(__name__)


def create_inventory_tools(db: AsyncSession, company_id: str):
    """Create inventory query tools bound to a specific db session and company."""

    @tool
    async def get_low_stock_items(threshold_pct: Optional[int] = 60) -> str:
        """Get inventory items that are below their minimum stock level or a given threshold percentage.

        Args:
            threshold_pct: Items with stock percentage below this value are returned. Default 60%.
        """
        try:
            result = await db.execute(text("""
                SELECT i.name, i.current_stock, i.minimum_stock, i.unit,
                       ic.name as category_name,
                       CASE WHEN i.minimum_stock > 0
                            THEN ROUND((i.current_stock::numeric / i.minimum_stock::numeric) * 100)
                            ELSE 100
                       END as stock_pct
                FROM inventory_items i
                LEFT JOIN inventory_categories ic ON i.category_id = ic.id
                WHERE i.company_id = :company_id
                  AND i.is_active = true
                  AND i.minimum_stock > 0
                  AND (i.current_stock::numeric / NULLIF(i.minimum_stock::numeric, 0)) * 100 < :threshold
                ORDER BY (i.current_stock::numeric / NULLIF(i.minimum_stock::numeric, 0)) ASC
            """), {"company_id": company_id, "threshold": threshold_pct})

            rows = result.fetchall()
            if not rows:
                return f"Great news! No inventory items are below {threshold_pct}% stock level."

            lines = [f"⚠️ {len(rows)} items below {threshold_pct}% stock level:\n"]
            for r in rows:
                status = "🔴 CRITICAL" if r.stock_pct <= 25 else "🟡 LOW"
                lines.append(
                    f"  {status} {r.name} ({r.category_name or 'Uncategorized'}): "
                    f"{r.current_stock} / {r.minimum_stock} {r.unit or 'units'} ({r.stock_pct}%)"
                )
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_low_stock_items error: {e}")
            return f"Error fetching low stock items: {str(e)}"

    @tool
    async def get_inventory_summary() -> str:
        """Get a summary of the entire inventory: total items, total value, categories breakdown."""
        try:
            result = await db.execute(text("""
                SELECT
                    COUNT(*) as total_items,
                    COALESCE(SUM(current_stock::numeric * unit_cost::numeric), 0) as total_value,
                    COUNT(*) FILTER (WHERE minimum_stock > 0 AND (current_stock::numeric / NULLIF(minimum_stock::numeric, 0)) < 0.25) as critical_count,
                    COUNT(*) FILTER (WHERE minimum_stock > 0 AND (current_stock::numeric / NULLIF(minimum_stock::numeric, 0)) BETWEEN 0.25 AND 0.6) as low_count,
                    COUNT(*) FILTER (WHERE is_active = false) as inactive_count
                FROM inventory_items
                WHERE company_id = :company_id
            """), {"company_id": company_id})

            row = result.fetchone()
            if not row:
                return "No inventory data found."

            # Category breakdown
            cat_result = await db.execute(text("""
                SELECT ic.name, COUNT(*) as item_count,
                       COALESCE(SUM(i.current_stock::numeric * i.unit_cost::numeric), 0) as category_value
                FROM inventory_items i
                LEFT JOIN inventory_categories ic ON i.category_id = ic.id
                WHERE i.company_id = :company_id AND i.is_active = true
                GROUP BY ic.name
                ORDER BY category_value DESC
            """), {"company_id": company_id})

            cats = cat_result.fetchall()

            lines = [
                "📦 INVENTORY SUMMARY",
                f"  Total Items: {row.total_items}",
                f"  Total Value: ${float(row.total_value):,.2f}",
                f"  🔴 Critical Stock: {row.critical_count} items",
                f"  🟡 Low Stock: {row.low_count} items",
                f"  ⏸️  Inactive: {row.inactive_count} items",
                "",
                "📂 BY CATEGORY:",
            ]
            for c in cats:
                lines.append(f"  • {c.name or 'Uncategorized'}: {c.item_count} items (${float(c.category_value):,.2f})")

            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_inventory_summary error: {e}")
            return f"Error fetching inventory summary: {str(e)}"

    @tool
    async def search_inventory_item(query: str) -> str:
        """Search for a specific inventory item by name and get its details.

        Args:
            query: Name or partial name of the inventory item to search for.
        """
        try:
            result = await db.execute(text("""
                SELECT i.name, i.sku, i.current_stock, i.minimum_stock, i.maximum_stock,
                       i.unit, i.unit_cost, i.reorder_point, i.reorder_quantity,
                       ic.name as category_name, i.is_active
                FROM inventory_items i
                LEFT JOIN inventory_categories ic ON i.category_id = ic.id
                WHERE i.company_id = :company_id
                  AND i.name ILIKE :query
                ORDER BY i.name
                LIMIT 5
            """), {"company_id": company_id, "query": f"%{query}%"})

            rows = result.fetchall()
            if not rows:
                return f"No inventory items found matching '{query}'."

            lines = []
            for r in rows:
                stock_pct = round((float(r.current_stock) / float(r.minimum_stock)) * 100) if r.minimum_stock and float(r.minimum_stock) > 0 else 100
                lines.append(
                    f"📦 {r.name} (SKU: {r.sku or 'N/A'})\n"
                    f"   Category: {r.category_name or 'Uncategorized'}\n"
                    f"   Stock: {r.current_stock} / {r.minimum_stock} {r.unit or 'units'} ({stock_pct}%)\n"
                    f"   Unit Cost: ${float(r.unit_cost):,.2f}\n"
                    f"   Reorder Point: {r.reorder_point or 'N/A'} | Reorder Qty: {r.reorder_quantity or 'N/A'}\n"
                    f"   Status: {'Active' if r.is_active else 'Inactive'}"
                )
            return "\n\n".join(lines)
        except Exception as e:
            logger.error(f"search_inventory_item error: {e}")
            return f"Error searching inventory: {str(e)}"

    @tool
    async def get_recent_stock_movements(limit: Optional[int] = 10) -> str:
        """Get recent stock movements (purchases, usage, adjustments, waste, etc.).

        Args:
            limit: Number of recent movements to return. Default 10.
        """
        try:
            result = await db.execute(text("""
                SELECT sm.movement_type, sm.quantity, sm.unit_cost, sm.notes, sm.reference_number,
                       sm.created_at, i.name as item_name
                FROM stock_movements sm
                JOIN inventory_items i ON sm.inventory_item_id = i.id
                WHERE sm.company_id = :company_id
                ORDER BY sm.created_at DESC
                LIMIT :limit
            """), {"company_id": company_id, "limit": limit})

            rows = result.fetchall()
            if not rows:
                return "No stock movements found."

            lines = ["📋 RECENT STOCK MOVEMENTS:\n"]
            for r in rows:
                direction = "➕" if r.movement_type in ('purchase', 'return', 'adjustment_in') else "➖"
                lines.append(
                    f"  {direction} {r.item_name}: {r.movement_type} x{r.quantity} "
                    f"@ ${float(r.unit_cost or 0):,.2f} | {r.created_at.strftime('%m/%d %H:%M')}"
                    f"{' — ' + r.notes if r.notes else ''}"
                )
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_recent_stock_movements error: {e}")
            return f"Error fetching stock movements: {str(e)}"

    return [get_low_stock_items, get_inventory_summary, search_inventory_item, get_recent_stock_movements]
