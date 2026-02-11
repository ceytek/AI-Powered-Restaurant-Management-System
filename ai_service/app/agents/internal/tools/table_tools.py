"""Internal tools for table status and occupancy queries."""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from langchain_core.tools import tool

logger = logging.getLogger(__name__)


def create_table_tools(db: AsyncSession, company_id: str):
    """Create table status query tools."""

    @tool
    async def get_table_status() -> str:
        """Get current status of all tables — which are available, occupied, reserved, etc."""
        try:
            result = await db.execute(text("""
                SELECT t.table_number, t.status, t.capacity_min, t.capacity_max,
                       ts.name as section_name, ts.color as section_color
                FROM tables t
                LEFT JOIN table_sections ts ON t.section_id = ts.id
                WHERE t.company_id = :company_id AND t.is_active = true
                ORDER BY ts.name, t.table_number
            """), {"company_id": company_id})

            rows = result.fetchall()
            if not rows:
                return "No tables configured."

            # Group by section
            sections: dict = {}
            for r in rows:
                sec = r.section_name or 'Unassigned'
                if sec not in sections:
                    sections[sec] = []
                sections[sec].append(r)

            status_icons = {
                'available': '🟢', 'occupied': '🔴', 'reserved': '🔵',
                'maintenance': '⚙️', 'cleaning': '🧹'
            }

            # Summary counts
            total = len(rows)
            available = sum(1 for r in rows if r.status == 'available')
            occupied = sum(1 for r in rows if r.status == 'occupied')
            reserved = sum(1 for r in rows if r.status == 'reserved')

            lines = [
                f"🪑 TABLE STATUS ({total} tables)",
                f"  🟢 Available: {available} | 🔴 Occupied: {occupied} | 🔵 Reserved: {reserved}",
                f"  Occupancy Rate: {round((occupied + reserved) / total * 100) if total else 0}%",
                "",
            ]

            for sec_name, tables in sections.items():
                lines.append(f"  📍 {sec_name}:")
                for t in tables:
                    icon = status_icons.get(t.status, '❓')
                    cap = f"{t.capacity_min}-{t.capacity_max}" if t.capacity_min != t.capacity_max else str(t.capacity_min)
                    lines.append(f"    {icon} Table {t.table_number} ({cap} seats) — {t.status}")

            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_table_status error: {e}")
            return f"Error fetching table status: {str(e)}"

    @tool
    async def get_table_occupancy_summary() -> str:
        """Get a quick summary of table occupancy rates by section."""
        try:
            result = await db.execute(text("""
                SELECT ts.name as section_name,
                       COUNT(*) as total_tables,
                       COUNT(*) FILTER (WHERE t.status = 'available') as available,
                       COUNT(*) FILTER (WHERE t.status = 'occupied') as occupied,
                       COUNT(*) FILTER (WHERE t.status = 'reserved') as reserved
                FROM tables t
                LEFT JOIN table_sections ts ON t.section_id = ts.id
                WHERE t.company_id = :company_id AND t.is_active = true
                GROUP BY ts.name
                ORDER BY ts.name
            """), {"company_id": company_id})

            rows = result.fetchall()
            if not rows:
                return "No tables configured."

            lines = ["🪑 OCCUPANCY BY SECTION:\n"]
            for r in rows:
                occ_rate = round((r.occupied + r.reserved) / r.total_tables * 100) if r.total_tables else 0
                lines.append(
                    f"  📍 {r.section_name or 'Unassigned'}: {r.total_tables} tables | "
                    f"🟢 {r.available} free | 🔴 {r.occupied} occupied | 🔵 {r.reserved} reserved | "
                    f"Rate: {occ_rate}%"
                )
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_table_occupancy_summary error: {e}")
            return f"Error fetching occupancy: {str(e)}"

    return [get_table_status, get_table_occupancy_summary]
