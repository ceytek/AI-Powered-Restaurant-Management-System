"""Staff management API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional
from uuid import UUID
from datetime import date
import math

from app.core.database import get_db
from app.middleware.auth import get_current_user, require_permissions, CurrentUser
from app.models.staff import StaffPosition, StaffProfile, Shift, StaffSchedule, StaffAttendance
from app.models.core import User
from app.schemas.staff import (
    StaffPositionCreate, StaffPositionUpdate, StaffPositionResponse,
    StaffProfileCreate, StaffProfileUpdate, StaffProfileResponse,
    ShiftCreate, ShiftUpdate, ShiftResponse,
    StaffScheduleCreate, StaffScheduleUpdate, StaffScheduleResponse,
)
from app.schemas.common import PaginatedResponse, MessageResponse
from app.repositories.base import BaseRepository
from app.services.audit_service import AuditService, serialize_for_audit

router = APIRouter()


# ==================== Staff Positions ====================

@router.get("/positions", response_model=list[StaffPositionResponse])
async def list_positions(
    department: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    filters = {}
    if department:
        filters["department"] = department
    repo = BaseRepository(StaffPosition, db, current_user.company_id)
    items, _ = await repo.get_all(filters=filters, is_active_filter=True, limit=100)

    response = []
    for pos in items:
        count_q = select(func.count()).select_from(StaffProfile).where(
            StaffProfile.position_id == pos.id, StaffProfile.employment_status == "active"
        )
        count = (await db.execute(count_q)).scalar()
        d = StaffPositionResponse.model_validate(pos).model_dump()
        d["staff_count"] = count
        response.append(StaffPositionResponse(**d))
    return response


@router.post("/positions", response_model=StaffPositionResponse, status_code=status.HTTP_201_CREATED)
async def create_position(
    data: StaffPositionCreate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("staff.write")),
):
    repo = BaseRepository(StaffPosition, db, current_user.company_id)
    if await repo.exists(name=data.name):
        raise HTTPException(status_code=400, detail="Position already exists")
    pos = await repo.create(data.model_dump())
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_create("staff_position", pos.id, data.model_dump(), entity_name=pos.name, request=request)
    return StaffPositionResponse.model_validate(pos)


@router.put("/positions/{position_id}", response_model=StaffPositionResponse)
async def update_position(
    position_id: UUID, data: StaffPositionUpdate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("staff.write")),
):
    repo = BaseRepository(StaffPosition, db, current_user.company_id)
    pos = await repo.get_by_id(position_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    old_values = serialize_for_audit(pos, ["name", "department", "base_hourly_rate"])
    pos = await repo.update(position_id, data.model_dump(exclude_unset=True))
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_update("staff_position", position_id, old_values, data.model_dump(exclude_unset=True), entity_name=pos.name, request=request)
    return StaffPositionResponse.model_validate(pos)


# ==================== Staff Profiles ====================

@router.get("/profiles", response_model=PaginatedResponse[StaffProfileResponse])
async def list_profiles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    position_id: Optional[UUID] = None,
    department: Optional[str] = None,
    employment_status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    query = select(StaffProfile).where(StaffProfile.company_id == current_user.company_id)

    if position_id:
        query = query.where(StaffProfile.position_id == position_id)
    if employment_status:
        query = query.where(StaffProfile.employment_status == employment_status)
    if department:
        query = query.join(StaffPosition).where(StaffPosition.department == department)

    if search:
        from sqlalchemy import or_
        query = query.join(User, StaffProfile.user_id == User.id).where(or_(
            User.first_name.ilike(f"%{search}%"),
            User.last_name.ilike(f"%{search}%"),
            User.email.ilike(f"%{search}%"),
            StaffProfile.employee_number.ilike(f"%{search}%"),
        ))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    query = query.options(
        selectinload(StaffProfile.user),
        selectinload(StaffProfile.position),
    ).order_by(StaffProfile.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    profiles = result.scalars().all()

    response_items = []
    for p in profiles:
        d = StaffProfileResponse.model_validate(p).model_dump()
        d["user_name"] = f"{p.user.first_name} {p.user.last_name}" if p.user else None
        d["user_email"] = p.user.email if p.user else None
        d["position_name"] = p.position.name if p.position else None
        d["department"] = p.position.department if p.position else None
        response_items.append(StaffProfileResponse(**d))

    return PaginatedResponse(
        items=response_items, total=total, page=page, page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/profiles", response_model=StaffProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    data: StaffProfileCreate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("staff.write")),
):
    # Check user belongs to same company
    user_q = await db.execute(
        select(User).where(User.id == data.user_id, User.company_id == current_user.company_id)
    )
    user = user_q.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found in your company")

    # Check no existing profile
    existing = await db.execute(
        select(StaffProfile).where(StaffProfile.user_id == data.user_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Staff profile already exists for this user")

    repo = BaseRepository(StaffProfile, db, current_user.company_id)
    profile = await repo.create({**data.model_dump(), "created_by": current_user.id})

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_create("staff_profile", profile.id,
                            {"user_id": str(data.user_id), "employee_number": data.employee_number},
                            entity_name=f"{user.first_name} {user.last_name}", request=request)

    # Re-fetch with relations
    profile = await repo.get_by_id(profile.id, options=[
        selectinload(StaffProfile.user), selectinload(StaffProfile.position),
    ])
    d = StaffProfileResponse.model_validate(profile).model_dump()
    d["user_name"] = f"{user.first_name} {user.last_name}"
    d["user_email"] = user.email
    d["position_name"] = profile.position.name if profile.position else None
    d["department"] = profile.position.department if profile.position else None
    return StaffProfileResponse(**d)


@router.get("/profiles/{profile_id}", response_model=StaffProfileResponse)
async def get_profile(
    profile_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    repo = BaseRepository(StaffProfile, db, current_user.company_id)
    profile = await repo.get_by_id(profile_id, options=[
        selectinload(StaffProfile.user),
        selectinload(StaffProfile.position),
    ])
    if not profile:
        raise HTTPException(status_code=404, detail="Staff profile not found")
    d = StaffProfileResponse.model_validate(profile).model_dump()
    d["user_name"] = f"{profile.user.first_name} {profile.user.last_name}" if profile.user else None
    d["user_email"] = profile.user.email if profile.user else None
    d["position_name"] = profile.position.name if profile.position else None
    d["department"] = profile.position.department if profile.position else None
    return StaffProfileResponse(**d)


@router.put("/profiles/{profile_id}", response_model=StaffProfileResponse)
async def update_profile(
    profile_id: UUID, data: StaffProfileUpdate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("staff.write")),
):
    repo = BaseRepository(StaffProfile, db, current_user.company_id)
    profile = await repo.get_by_id(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Staff profile not found")
    old_values = serialize_for_audit(profile, ["position_id", "employment_status", "hourly_rate"])
    profile = await repo.update(profile_id, data.model_dump(exclude_unset=True))
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_update("staff_profile", profile_id, old_values, data.model_dump(exclude_unset=True), request=request)
    return StaffProfileResponse.model_validate(profile)


# ==================== Shifts ====================

@router.get("/shifts", response_model=list[ShiftResponse])
async def list_shifts(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    repo = BaseRepository(Shift, db, current_user.company_id)
    items, _ = await repo.get_all(is_active_filter=True, limit=50, order_by="start_time")
    return [ShiftResponse.model_validate(s) for s in items]


@router.post("/shifts", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
async def create_shift(
    data: ShiftCreate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("staff.write")),
):
    repo = BaseRepository(Shift, db, current_user.company_id)
    if await repo.exists(name=data.name):
        raise HTTPException(status_code=400, detail="Shift name already exists")
    shift = await repo.create(data.model_dump())
    return ShiftResponse.model_validate(shift)


@router.put("/shifts/{shift_id}", response_model=ShiftResponse)
async def update_shift(
    shift_id: UUID, data: ShiftUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("staff.write")),
):
    repo = BaseRepository(Shift, db, current_user.company_id)
    shift = await repo.get_by_id(shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    shift = await repo.update(shift_id, data.model_dump(exclude_unset=True))
    return ShiftResponse.model_validate(shift)


# ==================== Staff Schedules ====================

@router.get("/schedules", response_model=list[StaffScheduleResponse])
async def list_schedules(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    staff_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List staff schedules for a date range."""
    query = select(StaffSchedule).where(StaffSchedule.company_id == current_user.company_id)

    if start_date:
        query = query.where(StaffSchedule.date >= start_date)
    if end_date:
        query = query.where(StaffSchedule.date <= end_date)
    if staff_id:
        query = query.where(StaffSchedule.staff_id == staff_id)

    query = query.options(
        selectinload(StaffSchedule.staff).selectinload(StaffProfile.user),
        selectinload(StaffSchedule.shift),
        selectinload(StaffSchedule.section),
    ).order_by(StaffSchedule.date, StaffSchedule.staff_id)

    result = await db.execute(query)
    schedules = result.scalars().all()

    response = []
    for s in schedules:
        d = StaffScheduleResponse.model_validate(s).model_dump()
        d["staff_name"] = f"{s.staff.user.first_name} {s.staff.user.last_name}" if s.staff and s.staff.user else None
        d["shift_name"] = s.shift.name if s.shift else None
        d["section_name"] = s.section.name if s.section else None
        response.append(StaffScheduleResponse(**d))
    return response


@router.post("/schedules", response_model=StaffScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    data: StaffScheduleCreate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("staff.write")),
):
    repo = BaseRepository(StaffSchedule, db, current_user.company_id)
    schedule = await repo.create({**data.model_dump(), "created_by": current_user.id})

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_create("staff_schedule", schedule.id,
                            {"staff_id": str(data.staff_id), "date": str(data.date)}, request=request)
    return StaffScheduleResponse.model_validate(schedule)


@router.put("/schedules/{schedule_id}", response_model=StaffScheduleResponse)
async def update_schedule(
    schedule_id: UUID, data: StaffScheduleUpdate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("staff.write")),
):
    repo = BaseRepository(StaffSchedule, db, current_user.company_id)
    schedule = await repo.get_by_id(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    old_status = schedule.status
    schedule = await repo.update(schedule_id, data.model_dump(exclude_unset=True))

    if data.status and data.status != old_status:
        audit = AuditService(db, current_user.company_id, current_user.id)
        await audit.log_status_change("staff_schedule", schedule_id, old_status, data.status, request=request)

    return StaffScheduleResponse.model_validate(schedule)


@router.delete("/schedules/{schedule_id}", response_model=MessageResponse)
async def delete_schedule(
    schedule_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("staff.write")),
):
    repo = BaseRepository(StaffSchedule, db, current_user.company_id)
    if not await repo.delete(schedule_id):
        raise HTTPException(status_code=404, detail="Schedule not found")
    return MessageResponse(message="Schedule deleted")
