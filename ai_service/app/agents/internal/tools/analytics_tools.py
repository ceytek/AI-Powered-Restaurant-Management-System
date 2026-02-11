"""Internal tools for analytics and business insights."""
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from langchain_core.tools import tool

logger = logging.getLogger(__name__)


def create_analytics_tools(db: AsyncSession, company_id: str):
    """Create analytics and insight tools."""

    @tool
    async def get_popular_menu_items(limit: Optional[int] = 10) -> str:
        """Get the most popular menu items based on order data or featured status.

        Args:
            limit: Number of items to return. Default 10.
        """
        try:
            # Since we may not have order history, use featured + price info
            result = await db.execute(text("""
                SELECT mi.name, mi.price, mi.cost_price,
                       mc.name as category_name,
                       mi.is_featured, mi.is_available, mi.calories,
                       mi.is_vegetarian, mi.is_vegan, mi.is_spicy
                FROM menu_items mi
                LEFT JOIN menu_categories mc ON mi.category_id = mc.id
                WHERE mi.company_id = :company_id AND mi.is_active = true
                ORDER BY mi.is_featured DESC, mi.price DESC
                LIMIT :limit
            """), {"company_id": company_id, "limit": limit})

            rows = result.fetchall()
            if not rows:
                return "No menu items found."

            lines = [f"🍽️ TOP MENU ITEMS ({len(rows)}):\n"]
            for i, r in enumerate(rows, 1):
                margin = ""
                if r.cost_price and float(r.cost_price) > 0:
                    margin_pct = round((float(r.price) - float(r.cost_price)) / float(r.price) * 100)
                    margin = f" | Margin: {margin_pct}%"

                tags = []
                if r.is_featured:
                    tags.append("⭐ Featured")
                if r.is_vegetarian:
                    tags.append("🌿 Veg")
                if r.is_vegan:
                    tags.append("🌱 Vegan")
                if r.is_spicy:
                    tags.append("🌶️ Spicy")
                if not r.is_available:
                    tags.append("⛔ Unavailable")

                tag_str = f" [{', '.join(tags)}]" if tags else ""
                lines.append(
                    f"  {i}. {r.name} — ${float(r.price):.2f}{margin}"
                    f" | {r.category_name or 'Uncategorized'}{tag_str}"
                )
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_popular_menu_items error: {e}")
            return f"Error fetching menu items: {str(e)}"

    @tool
    async def get_customer_stats() -> str:
        """Get customer statistics: total customers, VIPs, recent signups, etc."""
        try:
            result = await db.execute(text("""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE vip_status = true) as vip_count,
                    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as new_30d,
                    COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as new_7d,
                    COUNT(*) FILTER (WHERE is_blacklisted = true) as blacklisted
                FROM customers
                WHERE company_id = :company_id
            """), {"company_id": company_id})

            row = result.fetchone()

            # Top customers by visit count
            top = await db.execute(text("""
                SELECT first_name, last_name, total_visits, total_spent,
                       vip_status, customer_tier
                FROM customers
                WHERE company_id = :company_id AND is_active = true
                ORDER BY total_visits DESC
                LIMIT 5
            """), {"company_id": company_id})
            top_rows = top.fetchall()

            lines = [
                "👤 CUSTOMER STATS",
                f"  Total: {row.total} | ⭐ VIP: {row.vip_count} | 🚫 Blacklisted: {row.blacklisted}",
                f"  New (7d): {row.new_7d} | New (30d): {row.new_30d}",
            ]

            if top_rows:
                lines.append("\n  🏆 TOP CUSTOMERS (by visits):")
                for c in top_rows:
                    vip = " ⭐" if c.vip_status else ""
                    tier = f" [{c.customer_tier}]" if c.customer_tier and c.customer_tier != "regular" else ""
                    spent = f" | Spent: ${float(c.total_spent):,.2f}" if c.total_spent else ""
                    lines.append(f"    • {c.first_name} {c.last_name}{vip}{tier}: {c.total_visits} visits{spent}")

            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_customer_stats error: {e}")
            return f"Error fetching customer stats: {str(e)}"

    @tool
    async def search_customer(query: str) -> str:
        """Search for a customer by name, phone number, or email.

        Args:
            query: Customer name, phone, or email to search for.
        """
        try:
            result = await db.execute(text("""
                SELECT first_name, last_name, phone, email,
                       vip_status, customer_tier, total_visits, total_spent,
                       last_visit_date, is_blacklisted, is_active,
                       seating_preference, notes
                FROM customers
                WHERE company_id = :company_id
                  AND (
                      first_name ILIKE :q
                      OR last_name ILIKE :q
                      OR phone ILIKE :q
                      OR email ILIKE :q
                      OR (first_name || ' ' || COALESCE(last_name, '')) ILIKE :q
                  )
                ORDER BY total_visits DESC
                LIMIT 10
            """), {"company_id": company_id, "q": f"%{query}%"})

            rows = result.fetchall()
            if not rows:
                return f"No customers found matching '{query}'."

            lines = [f"👤 CUSTOMERS MATCHING '{query}' ({len(rows)} found):\n"]
            for c in rows:
                name = f"{c.first_name} {c.last_name or ''}".strip()
                vip = " ⭐ VIP" if c.vip_status else ""
                tier = f" [{c.customer_tier}]" if c.customer_tier and c.customer_tier != "regular" else ""
                blacklisted = " 🚫 BLACKLISTED" if c.is_blacklisted else ""
                inactive = " (inactive)" if not c.is_active else ""
                phone = f" | 📞 {c.phone}" if c.phone else ""
                email = f" | ✉️ {c.email}" if c.email else ""
                visits = f" | Visits: {c.total_visits}"
                spent = f" | Spent: ${float(c.total_spent):,.2f}" if c.total_spent else ""
                last_visit = f" | Last: {c.last_visit_date.strftime('%m/%d/%Y')}" if c.last_visit_date else ""
                pref = f"\n     Seating: {c.seating_preference}" if c.seating_preference else ""
                note = f"\n     Note: {c.notes[:100]}..." if c.notes and len(c.notes) > 100 else (f"\n     Note: {c.notes}" if c.notes else "")

                lines.append(
                    f"  • {name}{vip}{tier}{blacklisted}{inactive}{phone}{email}{visits}{spent}{last_visit}{pref}{note}"
                )
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"search_customer error: {e}")
            return f"Error searching customers: {str(e)}"

    @tool
    async def get_daily_overview() -> str:
        """Get a comprehensive daily overview: reservations, table status, low stock alerts, and staff on shift."""
        try:
            # Reservations today
            res = await db.execute(text("""
                SELECT COUNT(*) as total,
                       COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
                       COUNT(*) FILTER (WHERE status = 'pending') as pending,
                       COUNT(*) FILTER (WHERE status = 'seated') as seated,
                       COALESCE(SUM(party_size) FILTER (WHERE status NOT IN ('cancelled', 'no_show')), 0) as expected_guests
                FROM reservations
                WHERE company_id = :company_id AND date = CURRENT_DATE
            """), {"company_id": company_id})
            r = res.fetchone()

            # Tables
            tables = await db.execute(text("""
                SELECT COUNT(*) as total,
                       COUNT(*) FILTER (WHERE status = 'available') as available,
                       COUNT(*) FILTER (WHERE status = 'occupied') as occupied
                FROM tables
                WHERE company_id = :company_id AND is_active = true
            """), {"company_id": company_id})
            t = tables.fetchone()

            # Low stock
            low = await db.execute(text("""
                SELECT COUNT(*) as low_count
                FROM inventory_items
                WHERE company_id = :company_id AND is_active = true
                  AND minimum_stock > 0
                  AND (current_stock::numeric / NULLIF(minimum_stock::numeric, 0)) < 0.6
            """), {"company_id": company_id})
            l = low.fetchone()

            # Staff count
            staff = await db.execute(text("""
                SELECT COUNT(*) as active_staff
                FROM staff_profiles
                WHERE company_id = :company_id AND is_active = true
            """), {"company_id": company_id})
            s = staff.fetchone()

            occ_rate = round((t.occupied) / t.total * 100) if t.total else 0

            lines = [
                "📋 DAILY OVERVIEW",
                "═══════════════════",
                "",
                f"📅 Reservations Today: {r.total} ({r.confirmed} confirmed, {r.pending} pending, {r.seated} seated)",
                f"   Expected Guests: {int(r.expected_guests)}",
                "",
                f"🪑 Tables: {t.available}/{t.total} available | Occupancy: {occ_rate}%",
                "",
                f"📦 Inventory Alerts: {l.low_count} items below 60% stock",
                "",
                f"👥 Active Staff: {s.active_staff}",
            ]

            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_daily_overview error: {e}")
            return f"Error fetching daily overview: {str(e)}"

    return [get_popular_menu_items, get_customer_stats, search_customer, get_daily_overview]
