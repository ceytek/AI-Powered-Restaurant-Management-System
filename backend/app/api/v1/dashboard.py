"""Dashboard summary API endpoint."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from datetime import date, datetime, timezone

from app.core.database import get_db
from app.middleware.auth import get_current_user, CurrentUser
from app.models.restaurant import Table
from app.models.reservation import Reservation
from app.models.menu import MenuItem
from app.models.customer import Customer
from app.models.inventory import InventoryItem
from app.models.staff import StaffProfile, StaffPosition, StaffSchedule, Shift
from app.models.core import User

router = APIRouter()


@router.get("/summary")
async def get_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get dashboard summary data."""
    cid = current_user.company_id
    today = date.today()

    # Table stats
    table_total = (await db.execute(
        select(func.count()).select_from(Table).where(Table.company_id == cid, Table.is_active == True)
    )).scalar() or 0
    table_available = (await db.execute(
        select(func.count()).select_from(Table).where(Table.company_id == cid, Table.is_active == True, Table.status == "available")
    )).scalar() or 0
    table_occupied = (await db.execute(
        select(func.count()).select_from(Table).where(Table.company_id == cid, Table.is_active == True, Table.status == "occupied")
    )).scalar() or 0
    table_reserved = (await db.execute(
        select(func.count()).select_from(Table).where(Table.company_id == cid, Table.is_active == True, Table.status == "reserved")
    )).scalar() or 0

    # Today's reservation stats
    today_reservations = (await db.execute(
        select(func.count()).select_from(Reservation).where(
            Reservation.company_id == cid, Reservation.date == today,
            Reservation.status.notin_(["cancelled", "no_show"]),
        )
    )).scalar() or 0
    today_guests = (await db.execute(
        select(func.coalesce(func.sum(Reservation.party_size), 0)).select_from(Reservation).where(
            Reservation.company_id == cid, Reservation.date == today,
            Reservation.status.notin_(["cancelled", "no_show"]),
        )
    )).scalar() or 0
    pending_reservations = (await db.execute(
        select(func.count()).select_from(Reservation).where(
            Reservation.company_id == cid, Reservation.date == today, Reservation.status == "pending",
        )
    )).scalar() or 0

    # Menu stats
    total_menu_items = (await db.execute(
        select(func.count()).select_from(MenuItem).where(MenuItem.company_id == cid, MenuItem.is_available == True)
    )).scalar() or 0

    # Customer stats
    total_customers = (await db.execute(
        select(func.count()).select_from(Customer).where(Customer.company_id == cid, Customer.is_active == True)
    )).scalar() or 0
    vip_customers = (await db.execute(
        select(func.count()).select_from(Customer).where(
            Customer.company_id == cid, Customer.is_active == True, Customer.vip_status == True,
        )
    )).scalar() or 0

    # Low stock items
    low_stock_count = (await db.execute(
        select(func.count()).select_from(InventoryItem).where(
            InventoryItem.company_id == cid, InventoryItem.is_active == True,
            InventoryItem.current_stock <= InventoryItem.minimum_stock,
        )
    )).scalar() or 0

    # ==================== Staff Stats ====================
    total_staff = (await db.execute(
        select(func.count()).select_from(StaffProfile).where(
            StaffProfile.company_id == cid, StaffProfile.employment_status == "active"
        )
    )).scalar() or 0

    on_leave_staff = (await db.execute(
        select(func.count()).select_from(StaffProfile).where(
            StaffProfile.company_id == cid, StaffProfile.employment_status == "on_leave"
        )
    )).scalar() or 0

    # Today's scheduled staff
    today_scheduled = (await db.execute(
        select(func.count()).select_from(StaffSchedule).where(
            StaffSchedule.company_id == cid,
            StaffSchedule.date == today,
            StaffSchedule.status.in_(["scheduled", "confirmed"]),
        )
    )).scalar() or 0

    # Department breakdown
    dept_q = await db.execute(
        select(StaffPosition.department, func.count(StaffProfile.id))
        .join(StaffProfile, StaffProfile.position_id == StaffPosition.id)
        .where(StaffProfile.company_id == cid, StaffProfile.employment_status == "active")
        .group_by(StaffPosition.department)
    )
    departments = {row[0]: row[1] for row in dept_q.all()}

    # Today's schedule with names (for dashboard widget)
    today_schedule_q = await db.execute(
        select(StaffSchedule)
        .where(
            StaffSchedule.company_id == cid,
            StaffSchedule.date == today,
            StaffSchedule.status.in_(["scheduled", "confirmed"]),
        )
        .options(
            selectinload(StaffSchedule.staff).selectinload(StaffProfile.user),
            selectinload(StaffSchedule.staff).selectinload(StaffProfile.position),
            selectinload(StaffSchedule.shift),
        )
        .order_by(StaffSchedule.staff_id)
    )
    today_schedules = today_schedule_q.scalars().all()

    today_staff_list = []
    for s in today_schedules:
        if s.staff and s.staff.user and s.shift:
            today_staff_list.append({
                "name": f"{s.staff.user.first_name} {s.staff.user.last_name}",
                "position": s.staff.position.name if s.staff.position else "—",
                "department": s.staff.position.department if s.staff.position else "—",
                "shift": s.shift.name,
                "shift_time": f"{s.shift.start_time.strftime('%H:%M')} - {s.shift.end_time.strftime('%H:%M')}",
                "status": s.status,
            })

    return {
        "tables": {
            "total": table_total,
            "available": table_available,
            "occupied": table_occupied,
            "reserved": table_reserved,
            "occupancy_rate": round((table_occupied + table_reserved) / table_total * 100, 1) if table_total > 0 else 0,
        },
        "reservations_today": {
            "total": today_reservations,
            "expected_guests": today_guests,
            "pending": pending_reservations,
        },
        "menu": {
            "total_items": total_menu_items,
        },
        "customers": {
            "total": total_customers,
            "vip": vip_customers,
        },
        "inventory": {
            "low_stock_alerts": low_stock_count,
        },
        "staff": {
            "total_active": total_staff,
            "on_leave": on_leave_staff,
            "today_scheduled": today_scheduled,
            "departments": departments,
            "today_staff": today_staff_list,
        },
    }
