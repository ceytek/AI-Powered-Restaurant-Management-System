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
        """Get today's shift schedule — which shifts are defined and how many staff are scheduled for each."""
        try:
            result = await db.execute(text("""
                SELECT s.name as shift_name, s.start_time, s.end_time, s.color,
                       COUNT(ss.id) as assigned_count
                FROM shifts s
                LEFT JOIN staff_schedules ss
                    ON ss.shift_id = s.id
                    AND ss.company_id = s.company_id
                    AND ss.date = CURRENT_DATE
                    AND ss.status NOT IN ('absent', 'sick', 'vacation', 'day_off')
                WHERE s.company_id = :company_id AND s.is_active = true
                GROUP BY s.id, s.name, s.start_time, s.end_time, s.color
                ORDER BY s.start_time
            """), {"company_id": company_id})

            shifts = result.fetchall()
            if not shifts:
                return "No shifts are configured."

            lines = ["🕐 TODAY'S SHIFT SCHEDULE:\n"]
            for s in shifts:
                start = s.start_time.strftime('%H:%M') if s.start_time else '?'
                end = s.end_time.strftime('%H:%M') if s.end_time else '?'
                lines.append(f"  📌 {s.shift_name}: {start} - {end} ({s.assigned_count} staff scheduled)")

            # Also list staff scheduled today
            staff_today = await db.execute(text("""
                SELECT u.first_name, u.last_name, sh.name as shift_name,
                       pos.name as position_name, pos.department
                FROM staff_schedules ss
                JOIN staff_profiles sp ON ss.staff_id = sp.id
                JOIN users u ON sp.user_id = u.id
                LEFT JOIN shifts sh ON ss.shift_id = sh.id
                LEFT JOIN staff_positions pos ON sp.position_id = pos.id
                WHERE ss.company_id = :company_id
                  AND ss.date = CURRENT_DATE
                  AND ss.status NOT IN ('absent', 'sick', 'vacation', 'day_off')
                ORDER BY sh.start_time, u.first_name
            """), {"company_id": company_id})

            staff_rows = staff_today.fetchall()
            if staff_rows:
                lines.append(f"\n👥 STAFF ON DUTY TODAY ({len(staff_rows)}):")
                for sr in staff_rows:
                    dept = f" [{sr.department}]" if sr.department else ""
                    lines.append(
                        f"    • {sr.first_name} {sr.last_name} — {sr.position_name or 'No position'}{dept}"
                        f" | Shift: {sr.shift_name or 'Custom'}"
                    )
            else:
                lines.append("\n  ⚠️ No staff scheduled for today.")

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
                SELECT u.first_name, u.last_name, u.phone, u.email,
                       pos.department, sp.contract_type,
                       pos.name as position_name, sp.employment_status
                FROM staff_profiles sp
                JOIN users u ON sp.user_id = u.id
                LEFT JOIN staff_positions pos ON sp.position_id = pos.id
                WHERE sp.company_id = :company_id AND sp.employment_status = 'active'
            """
            params = {"company_id": company_id}

            if department:
                query += " AND pos.department = :dept"
                params["dept"] = department

            query += " ORDER BY pos.department, u.first_name"

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
                    f" | {(r.contract_type or 'N/A').replace('_', ' ').title()}"
                    f" | 📞 {r.phone or 'N/A'}"
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
                    COUNT(*) FILTER (WHERE sp.employment_status = 'active') as active,
                    COUNT(*) FILTER (WHERE sp.employment_status != 'active') as inactive
                FROM staff_profiles sp
                WHERE sp.company_id = :company_id
            """), {"company_id": company_id})
            totals = result.fetchone()

            dept_result = await db.execute(text("""
                SELECT pos.department, COUNT(*) as count
                FROM staff_profiles sp
                LEFT JOIN staff_positions pos ON sp.position_id = pos.id
                WHERE sp.company_id = :company_id AND sp.employment_status = 'active'
                GROUP BY pos.department
                ORDER BY count DESC
            """), {"company_id": company_id})
            depts = dept_result.fetchall()

            type_result = await db.execute(text("""
                SELECT sp.contract_type, COUNT(*) as count
                FROM staff_profiles sp
                WHERE sp.company_id = :company_id AND sp.employment_status = 'active'
                GROUP BY sp.contract_type
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

            lines.append("\n  BY CONTRACT TYPE:")
            for t in types:
                lines.append(f"    • {(t.contract_type or 'N/A').replace('_', ' ').title()}: {t.count}")

            return "\n".join(lines)
        except Exception as e:
            logger.error(f"get_staff_summary error: {e}")
            return f"Error fetching staff summary: {str(e)}"

    return [get_todays_shifts, list_staff_members, get_staff_summary]
