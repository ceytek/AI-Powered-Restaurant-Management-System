"""Reservation management API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from typing import Optional
from uuid import UUID
from datetime import date, datetime, time, timedelta, timezone
import math
import random
import string

from app.core.database import get_db
from app.middleware.auth import get_current_user, require_permissions, CurrentUser
from app.models.reservation import Reservation, ReservationStatusHistory, Waitlist
from app.models.restaurant import Table
from app.models.customer import Customer
from app.schemas.reservation import (
    ReservationCreate, ReservationUpdate, ReservationStatusUpdate, ReservationResponse, ReservationBriefResponse,
    WaitlistCreate, WaitlistStatusUpdate, WaitlistResponse,
)
from app.schemas.common import PaginatedResponse, MessageResponse
from app.repositories.base import BaseRepository
from app.services.audit_service import AuditService, serialize_for_audit

router = APIRouter()


def generate_reservation_number() -> str:
    """Generate a unique reservation number."""
    today = date.today().strftime("%Y%m%d")
    rand = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"RES-{today}-{rand}"


def _add_minutes_to_time(t: time, minutes: int) -> time:
    """Add minutes to a time object, returning a new time."""
    dt = datetime.combine(date.today(), t) + timedelta(minutes=minutes)
    return dt.time()


async def check_table_conflict(
    db: AsyncSession,
    company_id: UUID,
    table_id: UUID,
    reservation_date: date,
    start_time: time,
    duration_minutes: int,
    exclude_reservation_id: Optional[UUID] = None,
) -> Optional[Reservation]:
    """
    Check if a table has a conflicting reservation at the given date/time.
    Returns the conflicting reservation if found, None otherwise.

    Two reservations conflict if their time ranges overlap:
      existing_start < new_end AND new_start < existing_end
    """
    new_end_time = _add_minutes_to_time(start_time, duration_minutes)

    # Active statuses that actually occupy a table
    active_statuses = ["pending", "confirmed", "checked_in", "seated"]

    query = select(Reservation).where(
        Reservation.company_id == company_id,
        Reservation.table_id == table_id,
        Reservation.date == reservation_date,
        Reservation.status.in_(active_statuses),
    )

    if exclude_reservation_id:
        query = query.where(Reservation.id != exclude_reservation_id)

    result = await db.execute(query)
    existing_reservations = result.scalars().all()

    for existing in existing_reservations:
        existing_end = _add_minutes_to_time(existing.start_time, existing.duration_minutes)
        # Overlap check: existing_start < new_end AND new_start < existing_end
        if existing.start_time < new_end_time and start_time < existing_end:
            return existing

    return None


# ==================== Reservations ====================

@router.get("", response_model=PaginatedResponse[ReservationResponse])
async def list_reservations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    reservation_date: Optional[date] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    table_id: Optional[UUID] = None,
    source: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List reservations with filters."""
    query = select(Reservation).where(Reservation.company_id == current_user.company_id)

    if reservation_date:
        query = query.where(Reservation.date == reservation_date)
    if start_date:
        query = query.where(Reservation.date >= start_date)
    if end_date:
        query = query.where(Reservation.date <= end_date)
    if status_filter:
        query = query.where(Reservation.status == status_filter)
    if table_id:
        query = query.where(Reservation.table_id == table_id)
    if source:
        query = query.where(Reservation.source == source)
    if search:
        from sqlalchemy import or_
        query = query.where(or_(
            Reservation.customer_name.ilike(f"%{search}%"),
            Reservation.customer_phone.ilike(f"%{search}%"),
            Reservation.reservation_number.ilike(f"%{search}%"),
        ))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    query = query.options(
        selectinload(Reservation.table),
        selectinload(Reservation.creator),
    ).order_by(Reservation.date.desc(), Reservation.start_time)
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    reservations = result.scalars().all()

    response_items = []
    for r in reservations:
        d = ReservationResponse.model_validate(r).model_dump()
        d["table_number"] = r.table.table_number if r.table else None
        d["section_name"] = None  # Could join deeper if needed
        d["created_by_name"] = f"{r.creator.first_name} {r.creator.last_name}" if r.creator else None
        response_items.append(ReservationResponse(**d))

    return PaginatedResponse(
        items=response_items, total=total, page=page, page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


@router.get("/today", response_model=list[ReservationBriefResponse])
async def get_today_reservations(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get today's reservations (quick view)."""
    today = date.today()
    result = await db.execute(
        select(Reservation).where(
            Reservation.company_id == current_user.company_id,
            Reservation.date == today,
            Reservation.status.notin_(["cancelled", "no_show"]),
        ).options(selectinload(Reservation.table))
        .order_by(Reservation.start_time)
    )
    reservations = result.scalars().all()
    return [
        ReservationBriefResponse(
            id=r.id, reservation_number=r.reservation_number,
            customer_name=r.customer_name, party_size=r.party_size,
            date=r.date, start_time=r.start_time, status=r.status,
            table_number=r.table.table_number if r.table else None,
        )
        for r in reservations
    ]


@router.post("", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
async def create_reservation(
    data: ReservationCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("reservations.write")),
):
    """Create a new reservation."""
    # Verify table if provided
    if data.table_id:
        table_q = await db.execute(
            select(Table).where(Table.id == data.table_id, Table.company_id == current_user.company_id)
        )
        table = table_q.scalar_one_or_none()
        if not table:
            raise HTTPException(status_code=404, detail="Table not found")
        if not table.is_reservable:
            raise HTTPException(status_code=400, detail="This table is not reservable")

        # Check for time conflict on this table
        start_time_obj = data.start_time if isinstance(data.start_time, time) else datetime.strptime(data.start_time, "%H:%M").time()
        conflict = await check_table_conflict(
            db, current_user.company_id, data.table_id,
            data.date, start_time_obj, data.duration_minutes or 90,
        )
        if conflict:
            conflict_end = _add_minutes_to_time(conflict.start_time, conflict.duration_minutes)
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Table {table.table_number} is already reserved on {data.date} "
                    f"from {conflict.start_time.strftime('%H:%M')} to {conflict_end.strftime('%H:%M')} "
                    f"({conflict.customer_name}, {conflict.reservation_number}). "
                    f"Please choose a different table or time."
                ),
            )

    reservation_number = generate_reservation_number()
    # Ensure unique
    while True:
        existing = await db.execute(
            select(Reservation).where(
                Reservation.company_id == current_user.company_id,
                Reservation.reservation_number == reservation_number,
            )
        )
        if not existing.scalar_one_or_none():
            break
        reservation_number = generate_reservation_number()

    # ── Auto-link or create Customer ──────────────────────────────
    customer_id = None
    customer = None

    # 1) Try to find existing customer by phone (primary match)
    if data.customer_phone:
        cust_q = await db.execute(
            select(Customer).where(
                Customer.company_id == current_user.company_id,
                Customer.phone == data.customer_phone,
                Customer.is_active == True,
            )
        )
        customer = cust_q.scalar_one_or_none()

    # 2) If not found by phone, try email
    if not customer and data.customer_email:
        cust_q = await db.execute(
            select(Customer).where(
                Customer.company_id == current_user.company_id,
                Customer.email == data.customer_email,
                Customer.is_active == True,
            )
        )
        customer = cust_q.scalar_one_or_none()

    # 3) If still not found, create a new customer automatically
    if not customer:
        # Split customer_name into first/last
        name_parts = data.customer_name.strip().split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else None

        customer = Customer(
            company_id=current_user.company_id,
            first_name=first_name,
            last_name=last_name,
            email=data.customer_email,
            phone=data.customer_phone,
            source="reservation",
            source_details=f"Auto-created from reservation",
            created_by=current_user.id,
        )
        db.add(customer)
        await db.flush()

        # Audit the auto-created customer
        audit_cust = AuditService(db, current_user.company_id, current_user.id)
        await audit_cust.log_create(
            "customer", customer.id,
            {"first_name": first_name, "last_name": last_name, "phone": data.customer_phone, "email": data.customer_email},
            entity_name=data.customer_name, request=request,
        )

    customer_id = customer.id

    # Update customer visit count (increment for new reservation)
    # This will be properly updated when reservation status changes to 'completed'

    # ── Build reservation ──────────────────────────────────────
    reservation_data = data.model_dump()
    reservation_data["company_id"] = current_user.company_id
    reservation_data["reservation_number"] = reservation_number
    reservation_data["created_by"] = current_user.id
    reservation_data["customer_id"] = customer_id

    reservation = Reservation(**reservation_data)
    db.add(reservation)
    await db.flush()

    # Create initial status history
    history = ReservationStatusHistory(
        reservation_id=reservation.id,
        old_status=None,
        new_status="pending",
        changed_by=current_user.id,
        change_source="staff",
    )
    db.add(history)
    await db.flush()
    await db.refresh(reservation)

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_create("reservation", reservation.id,
                            {"number": reservation_number, "customer": data.customer_name, "date": str(data.date)},
                            entity_name=f"Reservation {reservation_number}", request=request)

    d = ReservationResponse.model_validate(reservation).model_dump()
    d["table_number"] = None
    d["section_name"] = None
    d["created_by_name"] = f"{current_user.first_name} {current_user.last_name}"

    # Fetch table number if set
    if data.table_id:
        table_result = await db.execute(select(Table).where(Table.id == data.table_id))
        t = table_result.scalar_one_or_none()
        if t:
            d["table_number"] = t.table_number

    return ReservationResponse(**d)


@router.get("/{reservation_id}", response_model=ReservationResponse)
async def get_reservation(
    reservation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(Reservation).where(
            Reservation.id == reservation_id, Reservation.company_id == current_user.company_id
        ).options(selectinload(Reservation.table), selectinload(Reservation.creator))
    )
    reservation = result.scalar_one_or_none()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    d = ReservationResponse.model_validate(reservation).model_dump()
    d["table_number"] = reservation.table.table_number if reservation.table else None
    d["created_by_name"] = f"{reservation.creator.first_name} {reservation.creator.last_name}" if reservation.creator else None
    return ReservationResponse(**d)


@router.put("/{reservation_id}", response_model=ReservationResponse)
async def update_reservation(
    reservation_id: UUID, data: ReservationUpdate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("reservations.write")),
):
    repo = BaseRepository(Reservation, db, current_user.company_id)
    reservation = await repo.get_by_id(reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    if reservation.status in ["completed", "cancelled", "no_show"]:
        raise HTTPException(status_code=400, detail="Cannot modify a completed/cancelled reservation")

    # Check for table conflict if table or time is being changed
    update_data = data.model_dump(exclude_unset=True)
    check_table = update_data.get("table_id", reservation.table_id)
    check_date = update_data.get("date", reservation.date)
    check_time = update_data.get("start_time", reservation.start_time)
    check_duration = update_data.get("duration_minutes", reservation.duration_minutes)

    if check_table and ("table_id" in update_data or "date" in update_data or "start_time" in update_data or "duration_minutes" in update_data):
        if isinstance(check_time, str):
            check_time = datetime.strptime(check_time, "%H:%M").time()
        conflict = await check_table_conflict(
            db, current_user.company_id, check_table,
            check_date, check_time, check_duration or 90,
            exclude_reservation_id=reservation_id,
        )
        if conflict:
            conflict_end = _add_minutes_to_time(conflict.start_time, conflict.duration_minutes)
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Table is already reserved on {check_date} "
                    f"from {conflict.start_time.strftime('%H:%M')} to {conflict_end.strftime('%H:%M')} "
                    f"({conflict.customer_name}, {conflict.reservation_number}). "
                    f"Please choose a different table or time."
                ),
            )

    old_values = serialize_for_audit(reservation, ["customer_name", "party_size", "date", "start_time", "table_id"])
    update_data["updated_by"] = current_user.id
    reservation = await repo.update(reservation_id, update_data)

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_update("reservation", reservation_id, old_values, update_data,
                            entity_name=f"Reservation {reservation.reservation_number}", request=request)
    return ReservationResponse.model_validate(reservation)


@router.patch("/{reservation_id}/status", response_model=ReservationResponse)
async def update_reservation_status(
    reservation_id: UUID, data: ReservationStatusUpdate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("reservations.write")),
):
    """Update reservation status with history tracking."""
    repo = BaseRepository(Reservation, db, current_user.company_id)
    reservation = await repo.get_by_id(reservation_id)
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")

    old_status = reservation.status
    now = datetime.now(timezone.utc)

    update_data = {"status": data.status, "updated_by": current_user.id}

    # Set appropriate timestamps
    if data.status == "confirmed":
        update_data["confirmed_at"] = now
    elif data.status == "checked_in":
        update_data["checked_in_at"] = now
    elif data.status == "seated":
        update_data["seated_at"] = now
    elif data.status == "completed":
        update_data["completed_at"] = now
    elif data.status == "cancelled":
        update_data["cancelled_at"] = now
        update_data["cancellation_reason"] = data.cancellation_reason
    elif data.status == "no_show":
        update_data["no_show_at"] = now

    reservation = await repo.update(reservation_id, update_data)

    # Create status history
    history = ReservationStatusHistory(
        reservation_id=reservation_id,
        old_status=old_status,
        new_status=data.status,
        changed_by=current_user.id,
        change_source="staff",
        notes=data.notes,
    )
    db.add(history)
    await db.flush()

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_status_change("reservation", reservation_id, old_status, data.status,
                                   entity_name=f"Reservation {reservation.reservation_number}", request=request)

    return ReservationResponse.model_validate(reservation)


@router.get("/{reservation_id}/history")
async def get_reservation_history(
    reservation_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get status change history for a reservation."""
    # Verify reservation belongs to company
    repo = BaseRepository(Reservation, db, current_user.company_id)
    if not await repo.get_by_id(reservation_id):
        raise HTTPException(status_code=404, detail="Reservation not found")

    result = await db.execute(
        select(ReservationStatusHistory)
        .where(ReservationStatusHistory.reservation_id == reservation_id)
        .options(selectinload(ReservationStatusHistory.changer))
        .order_by(ReservationStatusHistory.changed_at)
    )
    history = result.scalars().all()
    return [
        {
            "id": str(h.id),
            "old_status": h.old_status,
            "new_status": h.new_status,
            "changed_by": f"{h.changer.first_name} {h.changer.last_name}" if h.changer else "System",
            "change_source": h.change_source,
            "notes": h.notes,
            "changed_at": h.changed_at.isoformat(),
        }
        for h in history
    ]


# ==================== Waitlist ====================

@router.get("/waitlist/active", response_model=list[WaitlistResponse])
async def get_active_waitlist(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get current active waitlist."""
    result = await db.execute(
        select(Waitlist).where(
            Waitlist.company_id == current_user.company_id,
            Waitlist.status.in_(["waiting", "notified"]),
        ).order_by(Waitlist.queued_at)
    )
    entries = result.scalars().all()
    response = []
    for i, entry in enumerate(entries):
        d = WaitlistResponse.model_validate(entry).model_dump()
        d["position"] = i + 1
        response.append(WaitlistResponse(**d))
    return response


@router.post("/waitlist", response_model=WaitlistResponse, status_code=status.HTTP_201_CREATED)
async def add_to_waitlist(
    data: WaitlistCreate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("reservations.write")),
):
    entry = Waitlist(
        company_id=current_user.company_id,
        created_by=current_user.id,
        **data.model_dump(),
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return WaitlistResponse.model_validate(entry)


@router.patch("/waitlist/{waitlist_id}/status", response_model=WaitlistResponse)
async def update_waitlist_status(
    waitlist_id: UUID, data: WaitlistStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("reservations.write")),
):
    result = await db.execute(
        select(Waitlist).where(
            Waitlist.id == waitlist_id, Waitlist.company_id == current_user.company_id
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")

    now = datetime.now(timezone.utc)
    entry.status = data.status
    if data.status == "notified":
        entry.notified_at = now
    elif data.status == "seated":
        entry.seated_at = now
        entry.table_id = data.table_id

    await db.flush()
    await db.refresh(entry)
    return WaitlistResponse.model_validate(entry)
