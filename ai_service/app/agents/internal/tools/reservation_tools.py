"""Internal tools for reservation analytics and queries (read-only)."""
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from langchain_core.tools import tool

logger = logging.getLogger(__name__)


def create_internal_reservation_tools(db: AsyncSession, company_id: str):
    """Create internal (read-only) reservation query tools."""

    @tool
    async def get_todays_reservations() -> str:
        """Get all reservations for today, including status and details."""
        try:
            result = await db.execute(text("""
                SELECT r.reservation_number, r.customer_name, r.customer_phone,
                       r.date, r.start_time, r.end_time, r.party_size, r.status,
                       r.special_requests, t.table_number, ts.name as section_name
                FROM reservations r
                LEFT JOIN tables t ON r.table_id = t.id
                LEFT JOIN table_sections ts ON t.section_id = ts.id
                WHERE r.company_id = :company_id
                  AND r.date = CURRENT_DATE
                ORDER BY r.start_time
            """), {"company_id": company_id})

            rows = result.fetchall()
            if not rows:
                return "No reservations scheduled for today."

            lines = [f"📅 TODAY'S RESERVATIONS ({len(rows)} total):\n"]
            for r in rows:
                status_icon = {"confirmed": "✅", "pending": "⏳", "seated": "🍽️", "completed": "✓", "cancelled": "❌", "no_show": "🚫"}.get(r.status, "❓")
                time_str = r.start_time.strftime('%H:%M') if r.start_time else '?'
                table_str = f"Table {r.table_number}" if r.table_number else "No table"
                section_str = f" ({r.section_name})" if r.section_name else ""
                lines.append(
                    f"  {status_icon} {time_str} — {r.customer_name} | Party of {r.party_size} | "
                    f"{table_str}{section_str} | {r.status.upper()} | #{r.reservation_number}"
                    f"{' | Note: ' + r.special_requests if r.special_requests else ''}"
                )
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_todays_reservations error: {e}")
            return f"Error fetching today's reservations: {str(e)}"

    @tool
    async def get_reservation_stats(days: Optional[int] = 7) -> str:
        """Get reservation statistics for the last N days.

        Args:
            days: Number of days to look back. Default 7.
        """
        try:
            result = await db.execute(text("""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
                    COUNT(*) FILTER (WHERE status = 'no_show') as no_show,
                    COALESCE(AVG(party_size), 0) as avg_party_size,
                    COALESCE(SUM(party_size), 0) as total_guests
                FROM reservations
                WHERE company_id = :company_id
                  AND date >= CURRENT_DATE - :days * INTERVAL '1 day'
            """), {"company_id": company_id, "days": days})

            row = result.fetchone()

            # Daily breakdown
            daily = await db.execute(text("""
                SELECT date, COUNT(*) as count, SUM(party_size) as guests
                FROM reservations
                WHERE company_id = :company_id
                  AND date >= CURRENT_DATE - :days * INTERVAL '1 day'
                  AND status NOT IN ('cancelled')
                GROUP BY date
                ORDER BY date DESC
            """), {"company_id": company_id, "days": days})
            daily_rows = daily.fetchall()

            lines = [
                f"📊 RESERVATION STATS (Last {days} days)",
                f"  Total: {row.total} | Avg Party: {float(row.avg_party_size):.1f} | Total Guests: {int(row.total_guests)}",
                f"  ✅ Confirmed: {row.confirmed} | ⏳ Pending: {row.pending}",
                f"  ✓ Completed: {row.completed} | ❌ Cancelled: {row.cancelled} | 🚫 No-show: {row.no_show}",
                "",
                "  DAILY BREAKDOWN:",
            ]
            for d in daily_rows:
                lines.append(f"    {d.date.strftime('%a %m/%d')}: {d.count} reservations, {d.guests or 0} guests")

            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_reservation_stats error: {e}")
            return f"Error fetching reservation stats: {str(e)}"

    @tool
    async def get_upcoming_reservations(hours: Optional[int] = 3) -> str:
        """Get reservations coming up in the next N hours.

        Args:
            hours: Look-ahead window in hours. Default 3.
        """
        try:
            result = await db.execute(text("""
                SELECT r.reservation_number, r.customer_name, r.customer_phone,
                       r.start_time, r.party_size, r.status, r.special_requests,
                       t.table_number, ts.name as section_name
                FROM reservations r
                LEFT JOIN tables t ON r.table_id = t.id
                LEFT JOIN table_sections ts ON t.section_id = ts.id
                WHERE r.company_id = :company_id
                  AND r.date = CURRENT_DATE
                  AND r.start_time BETWEEN CURRENT_TIME AND CURRENT_TIME + :hours * INTERVAL '1 hour'
                  AND r.status IN ('confirmed', 'pending')
                ORDER BY r.start_time
            """), {"company_id": company_id, "hours": hours})

            rows = result.fetchall()
            if not rows:
                return f"No upcoming reservations in the next {hours} hours."

            lines = [f"⏰ UPCOMING ({len(rows)} in next {hours}h):\n"]
            for r in rows:
                time_str = r.start_time.strftime('%H:%M') if r.start_time else '?'
                table_str = f"Table {r.table_number}" if r.table_number else "No table"
                lines.append(
                    f"  🔜 {time_str} — {r.customer_name} | Party of {r.party_size} | {table_str}"
                    f"{' | ⚠️ ' + r.special_requests if r.special_requests else ''}"
                )
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_upcoming_reservations error: {e}")
            return f"Error fetching upcoming reservations: {str(e)}"

    @tool
    async def get_reservations_by_date(date: str) -> str:
        """Get all reservations for a specific date.

        Args:
            date: The date to query in YYYY-MM-DD format (e.g. '2026-02-12' for tomorrow).
        """
        try:
            result = await db.execute(text("""
                SELECT r.reservation_number, r.customer_name, r.customer_phone,
                       r.date, r.start_time, r.end_time, r.party_size, r.status,
                       r.special_requests, t.table_number, ts.name as section_name
                FROM reservations r
                LEFT JOIN tables t ON r.table_id = t.id
                LEFT JOIN table_sections ts ON t.section_id = ts.id
                WHERE r.company_id = :company_id
                  AND r.date = :target_date
                ORDER BY r.start_time
            """), {"company_id": company_id, "target_date": date})

            rows = result.fetchall()
            if not rows:
                return f"No reservations found for {date}."

            lines = [f"📅 RESERVATIONS FOR {date} ({len(rows)} total):\n"]
            for r in rows:
                status_icon = {"confirmed": "✅", "pending": "⏳", "seated": "🍽️", "completed": "✓", "cancelled": "❌", "no_show": "🚫"}.get(r.status, "❓")
                time_str = r.start_time.strftime('%H:%M') if r.start_time else '?'
                table_str = f"Table {r.table_number}" if r.table_number else "No table"
                section_str = f" ({r.section_name})" if r.section_name else ""
                lines.append(
                    f"  {status_icon} {time_str} — {r.customer_name} | Party of {r.party_size} | "
                    f"{table_str}{section_str} | {r.status.upper()} | #{r.reservation_number}"
                    f"{' | Note: ' + r.special_requests if r.special_requests else ''}"
                )
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_reservations_by_date error: {e}")
            return f"Error fetching reservations for {date}: {str(e)}"

    return [get_todays_reservations, get_reservation_stats, get_upcoming_reservations, get_reservations_by_date]
