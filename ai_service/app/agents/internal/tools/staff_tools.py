"""Internal tools for staff and shift queries."""
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from langchain_core.tools import tool

logger = logging.getLogger(__name__)


def create_staff_tools(db: AsyncSession, company_id: str):
    """Create staff query tools bound to a specific db session and company."""

    @tool
    async def get_todays_shifts() -> str:
        """Get today's shift schedule — which shifts are active and who is assigned to them."""
        try:
            result = await db.execute(text("""
                SELECT s.name as shift_name, s.start_time, s.end_time, s.color,
                       COUNT(sp.id) as assigned_count
                FROM shifts s
                LEFT JOIN staff_profiles sp ON sp.shift_id = s.id AND sp.is_active = true
                WHERE s.company_id = :company_id AND s.is_active = true
                GROUP BY s.id, s.name, s.start_time, s.end_time, s.color
                ORDER BY s.start_time
            """), {"company_id": company_id})

            shifts = result.fetchall()
            if not shifts:
                return "No shifts are configured for today."

            lines = ["🕐 TODAY'S SHIFT SCHEDULE:\n"]
            for s in shifts:
                start = s.start_time.strftime('%H:%M') if s.start_time else '?'
                end = s.end_time.strftime('%H:%M') if s.end_time else '?'
                lines.append(f"  📌 {s.shift_name}: {start} - {end} ({s.assigned_count} staff assigned)")

            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_todays_shifts error: {e}")
            return f"Error fetching shifts: {str(e)}"

    @tool
    async def list_staff_members(department: Optional[str] = None) -> str:
        """List all active staff members, optionally filtered by department.

        Args:
            department: Filter by department name (e.g. 'kitchen', 'service', 'bar', 'management'). Leave empty for all.
        """
        try:
            query = """
                SELECT sp.first_name, sp.last_name, sp.phone, sp.email,
                       sp.department, sp.employment_type,
                       pos.name as position_name,
                       s.name as shift_name
                FROM staff_profiles sp
                LEFT JOIN staff_positions pos ON sp.position_id = pos.id
                LEFT JOIN shifts s ON sp.shift_id = s.id
                WHERE sp.company_id = :company_id AND sp.is_active = true
            """
            params = {"company_id": company_id}

            if department:
                query += " AND sp.department = :dept"
                params["dept"] = department

            query += " ORDER BY sp.department, sp.first_name"

            result = await db.execute(text(query), params)
            rows = result.fetchall()

            if not rows:
                dept_msg = f" in {department} department" if department else ""
                return f"No active staff members found{dept_msg}."

            lines = [f"👥 STAFF MEMBERS ({len(rows)} total):\n"]
            current_dept = None
            for r in rows:
                if r.department != current_dept:
                    current_dept = r.department
                    lines.append(f"\n  📂 {(current_dept or 'Unassigned').upper()}")

                lines.append(
                    f"    • {r.first_name} {r.last_name} — {r.position_name or 'No position'}"
                    f" | Shift: {r.shift_name or 'Unassigned'}"
                    f" | {r.employment_type or 'N/A'}"
                )
            return "\n".join(lines)
        except Exception as e:
            logger.error(f"list_staff_members error: {e}")
            return f"Error fetching staff: {str(e)}"

    @tool
    async def get_staff_summary() -> str:
        """Get a summary of staff: total count, by department, by employment type."""
        try:
            result = await db.execute(text("""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE is_active = true) as active,
                    COUNT(*) FILTER (WHERE is_active = false) as inactive
                FROM staff_profiles
                WHERE company_id = :company_id
            """), {"company_id": company_id})
            totals = result.fetchone()

            dept_result = await db.execute(text("""
                SELECT department, COUNT(*) as count
                FROM staff_profiles
                WHERE company_id = :company_id AND is_active = true
                GROUP BY department
                ORDER BY count DESC
            """), {"company_id": company_id})
            depts = dept_result.fetchall()

            type_result = await db.execute(text("""
                SELECT employment_type, COUNT(*) as count
                FROM staff_profiles
                WHERE company_id = :company_id AND is_active = true
                GROUP BY employment_type
                ORDER BY count DESC
            """), {"company_id": company_id})
            types = type_result.fetchall()

            lines = [
                "👥 STAFF SUMMARY",
                f"  Total: {totals.total} | Active: {totals.active} | Inactive: {totals.inactive}",
                "",
                "  BY DEPARTMENT:",
            ]
            for d in depts:
                lines.append(f"    • {(d.department or 'Unassigned').capitalize()}: {d.count}")

            lines.append("\n  BY EMPLOYMENT TYPE:")
            for t in types:
                lines.append(f"    • {(t.employment_type or 'N/A').capitalize()}: {t.count}")

            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_staff_summary error: {e}")
            return f"Error fetching staff summary: {str(e)}"

    return [get_todays_shifts, list_staff_members, get_staff_summary]
