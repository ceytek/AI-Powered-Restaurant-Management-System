"""Dashboard summary API endpoint."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, and_
from sqlalchemy.orm import selectinload
from datetime import date, datetime, timezone, timedelta

from app.core.database import get_db
from app.middleware.auth import get_current_user, CurrentUser
from app.models.restaurant import Table
from app.models.reservation import Reservation
from app.models.menu import MenuItem
from app.models.customer import Customer
from app.models.inventory import InventoryItem, InventoryCategory, StockMovement, UnitOfMeasure
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

    # ==================== INVENTORY STATS (Enhanced) ====================

    # Total active inventory items
    total_inventory_items = (await db.execute(
        select(func.count()).select_from(InventoryItem).where(
            InventoryItem.company_id == cid, InventoryItem.is_active == True
        )
    )).scalar() or 0

    # Total inventory value
    total_inventory_value = (await db.execute(
        select(func.coalesce(func.sum(InventoryItem.current_stock * InventoryItem.unit_cost), 0))
        .select_from(InventoryItem)
        .where(InventoryItem.company_id == cid, InventoryItem.is_active == True)
    )).scalar() or 0

    # Low stock items count
    low_stock_count = (await db.execute(
        select(func.count()).select_from(InventoryItem).where(
            InventoryItem.company_id == cid, InventoryItem.is_active == True,
            InventoryItem.current_stock <= InventoryItem.minimum_stock,
        )
    )).scalar() or 0

    # Out of stock items count
    out_of_stock_count = (await db.execute(
        select(func.count()).select_from(InventoryItem).where(
            InventoryItem.company_id == cid, InventoryItem.is_active == True,
            InventoryItem.current_stock <= 0,
        )
    )).scalar() or 0

    # Detailed low stock items (top 15, most critical first)
    low_stock_q = await db.execute(
        select(InventoryItem)
        .where(
            InventoryItem.company_id == cid,
            InventoryItem.is_active == True,
            InventoryItem.current_stock <= InventoryItem.minimum_stock,
            InventoryItem.minimum_stock > 0,
        )
        .options(
            selectinload(InventoryItem.category),
            selectinload(InventoryItem.unit),
        )
        .order_by(
            # Most critical first (lowest ratio of current/minimum)
            (InventoryItem.current_stock / InventoryItem.minimum_stock).asc()
        )
        .limit(15)
    )
    low_stock_items_raw = low_stock_q.scalars().all()

    low_stock_items = []
    for item in low_stock_items_raw:
        stock_pct = round(float(item.current_stock) / float(item.minimum_stock) * 100, 0) if item.minimum_stock and float(item.minimum_stock) > 0 else 0
        severity = "critical" if stock_pct <= 25 else ("warning" if stock_pct <= 60 else "low")
        low_stock_items.append({
            "id": str(item.id),
            "name": item.name,
            "sku": item.sku,
            "category": item.category.name if item.category else None,
            "current_stock": float(item.current_stock),
            "minimum_stock": float(item.minimum_stock),
            "reorder_point": float(item.reorder_point) if item.reorder_point else None,
            "reorder_quantity": float(item.reorder_quantity) if item.reorder_quantity else None,
            "unit_cost": float(item.unit_cost),
            "unit": item.unit.abbreviation if item.unit else None,
            "storage_location": item.storage_location,
            "stock_percentage": stock_pct,
            "severity": severity,
        })

    # Inventory by category (with value and item counts)
    cat_q = await db.execute(
        select(
            InventoryCategory.name,
            func.count(InventoryItem.id).label("item_count"),
            func.coalesce(func.sum(InventoryItem.current_stock * InventoryItem.unit_cost), 0).label("total_value"),
            func.count(case(
                (InventoryItem.current_stock <= InventoryItem.minimum_stock, 1),
            )).label("low_count"),
        )
        .join(InventoryItem, and_(
            InventoryItem.category_id == InventoryCategory.id,
            InventoryItem.is_active == True,
        ))
        .where(InventoryCategory.company_id == cid, InventoryCategory.is_active == True)
        .group_by(InventoryCategory.name)
        .order_by(func.count(InventoryItem.id).desc())
    )
    category_breakdown = [
        {
            "name": row[0],
            "item_count": row[1],
            "total_value": round(float(row[2]), 2),
            "low_stock_count": row[3],
        }
        for row in cat_q.all()
    ]

    # Recent stock movements (last 10)
    now = datetime.now(timezone.utc)
    recent_movements_q = await db.execute(
        select(StockMovement)
        .where(StockMovement.company_id == cid)
        .options(
            selectinload(StockMovement.inventory_item),
            selectinload(StockMovement.performer),
        )
        .order_by(StockMovement.performed_at.desc())
        .limit(10)
    )
    recent_movements_raw = recent_movements_q.scalars().all()
    recent_movements = []
    for m in recent_movements_raw:
        recent_movements.append({
            "id": str(m.id),
            "item_name": m.inventory_item.name if m.inventory_item else "—",
            "movement_type": m.movement_type,
            "quantity": float(m.quantity),
            "unit_cost": float(m.unit_cost) if m.unit_cost else None,
            "total_cost": float(m.total_cost) if m.total_cost else None,
            "stock_after": float(m.stock_after) if m.stock_after is not None else None,
            "performed_by": f"{m.performer.first_name} {m.performer.last_name}" if m.performer else None,
            "performed_at": m.performed_at.isoformat() if m.performed_at else None,
            "notes": m.notes,
        })

    # Waste in last 7 days
    seven_days_ago = now - timedelta(days=7)
    waste_value = (await db.execute(
        select(func.coalesce(func.sum(func.abs(StockMovement.quantity) * StockMovement.unit_cost), 0))
        .select_from(StockMovement)
        .where(
            StockMovement.company_id == cid,
            StockMovement.movement_type == "waste",
            StockMovement.performed_at >= seven_days_ago,
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
            "total_items": total_inventory_items,
            "total_value": round(float(total_inventory_value), 2),
            "low_stock_alerts": low_stock_count,
            "out_of_stock": out_of_stock_count,
            "waste_last_7_days": round(float(waste_value), 2),
            "low_stock_items": low_stock_items,
            "category_breakdown": category_breakdown,
            "recent_movements": recent_movements,
        },
        "staff": {
            "total_active": total_staff,
            "on_leave": on_leave_staff,
            "today_scheduled": today_scheduled,
            "departments": departments,
            "today_staff": today_staff_list,
        },
    }
