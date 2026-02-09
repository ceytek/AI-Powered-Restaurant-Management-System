"""Table & Section management API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional
from uuid import UUID
import math

from app.core.database import get_db
from app.middleware.auth import get_current_user, require_permissions, CurrentUser
from app.models.restaurant import TableSection, Table, OperatingHours, SpecialHours
from app.schemas.restaurant import (
    TableSectionCreate, TableSectionUpdate, TableSectionResponse,
    TableCreate, TableUpdate, TableStatusUpdate, TableResponse, TableBriefResponse,
    OperatingHoursCreate, OperatingHoursResponse, OperatingHoursBulkUpdate,
    SpecialHoursCreate, SpecialHoursResponse,
)
from app.schemas.common import PaginatedResponse, MessageResponse
from app.repositories.base import BaseRepository
from app.services.audit_service import AuditService, serialize_for_audit

router = APIRouter()


# ==================== Table Sections ====================

@router.get("/sections", response_model=PaginatedResponse[TableSectionResponse])
async def list_sections(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List all table sections."""
    repo = BaseRepository(TableSection, db, current_user.company_id)
    items, total = await repo.get_all(
        search=search,
        search_fields=["name", "description"],
        is_active_filter=is_active,
        offset=(page - 1) * page_size,
        limit=page_size,
    )

    # Add table count for each section
    response_items = []
    for section in items:
        count_q = select(func.count()).select_from(Table).where(
            Table.section_id == section.id, Table.is_active == True
        )
        count_result = await db.execute(count_q)
        item_dict = TableSectionResponse.model_validate(section).model_dump()
        item_dict["table_count"] = count_result.scalar()
        response_items.append(TableSectionResponse(**item_dict))

    return PaginatedResponse(
        items=response_items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/sections", response_model=TableSectionResponse, status_code=status.HTTP_201_CREATED)
async def create_section(
    data: TableSectionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("tables.write")),
):
    """Create a new table section."""
    repo = BaseRepository(TableSection, db, current_user.company_id)

    if await repo.exists(name=data.name):
        raise HTTPException(status_code=400, detail="Section with this name already exists")

    section = await repo.create({**data.model_dump(), "created_by": current_user.id})

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_create("table_section", section.id, data.model_dump(), entity_name=section.name, request=request)

    return TableSectionResponse.model_validate(section)


@router.get("/sections/{section_id}", response_model=TableSectionResponse)
async def get_section(
    section_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get a specific table section."""
    repo = BaseRepository(TableSection, db, current_user.company_id)
    section = await repo.get_by_id(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    return TableSectionResponse.model_validate(section)


@router.put("/sections/{section_id}", response_model=TableSectionResponse)
async def update_section(
    section_id: UUID,
    data: TableSectionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("tables.write")),
):
    """Update a table section."""
    repo = BaseRepository(TableSection, db, current_user.company_id)
    section = await repo.get_by_id(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    old_values = serialize_for_audit(section, ["name", "description", "floor", "is_active"])
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_by"] = current_user.id

    section = await repo.update(section_id, update_data)

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_update("table_section", section_id, old_values, update_data, entity_name=section.name, request=request)

    return TableSectionResponse.model_validate(section)


@router.delete("/sections/{section_id}", response_model=MessageResponse)
async def delete_section(
    section_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("tables.delete")),
):
    """Soft delete a table section."""
    repo = BaseRepository(TableSection, db, current_user.company_id)
    section = await repo.get_by_id(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_delete("table_section", section_id, entity_name=section.name, request=request)

    await repo.soft_delete(section_id)
    return MessageResponse(message="Section deactivated successfully")


# ==================== Tables ====================

@router.get("", response_model=PaginatedResponse[TableResponse])
async def list_tables(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    section_id: Optional[UUID] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List all tables with optional filters."""
    filters = {}
    if section_id:
        filters["section_id"] = section_id
    if status_filter:
        filters["status"] = status_filter

    repo = BaseRepository(Table, db, current_user.company_id)
    items, total = await repo.get_all(
        filters=filters,
        search=search,
        search_fields=["table_number", "name"],
        is_active_filter=is_active,
        offset=(page - 1) * page_size,
        limit=page_size,
        order_by="table_number",
        options=[selectinload(Table.section)],
    )

    response_items = []
    for table in items:
        item_dict = TableResponse.model_validate(table).model_dump()
        item_dict["section_name"] = table.section.name if table.section else None
        response_items.append(TableResponse(**item_dict))

    return PaginatedResponse(
        items=response_items, total=total, page=page, page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


@router.get("/brief", response_model=list[TableBriefResponse])
async def list_tables_brief(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get minimal table list for dropdowns."""
    filters = {}
    if status_filter:
        filters["status"] = status_filter

    repo = BaseRepository(Table, db, current_user.company_id)
    items, _ = await repo.get_all(
        filters=filters,
        is_active_filter=True,
        limit=200,
        options=[selectinload(Table.section)],
    )
    result = []
    for t in items:
        result.append(TableBriefResponse(
            id=t.id, table_number=t.table_number, name=t.name,
            capacity_max=t.capacity_max, status=t.status,
            section_name=t.section.name if t.section else None,
        ))
    return result


@router.post("", response_model=TableResponse, status_code=status.HTTP_201_CREATED)
async def create_table(
    data: TableCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("tables.write")),
):
    """Create a new table."""
    repo = BaseRepository(Table, db, current_user.company_id)

    if await repo.exists(table_number=data.table_number):
        raise HTTPException(status_code=400, detail="Table number already exists")

    table = await repo.create({**data.model_dump(), "created_by": current_user.id})

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_create("table", table.id, data.model_dump(), entity_name=f"Table {table.table_number}", request=request)

    return TableResponse.model_validate(table)


@router.get("/{table_id}", response_model=TableResponse)
async def get_table(
    table_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get a specific table."""
    repo = BaseRepository(Table, db, current_user.company_id)
    table = await repo.get_by_id(table_id, options=[selectinload(Table.section)])
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    item_dict = TableResponse.model_validate(table).model_dump()
    item_dict["section_name"] = table.section.name if table.section else None
    return TableResponse(**item_dict)


@router.put("/{table_id}", response_model=TableResponse)
async def update_table(
    table_id: UUID,
    data: TableUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("tables.write")),
):
    """Update a table."""
    repo = BaseRepository(Table, db, current_user.company_id)
    table = await repo.get_by_id(table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    old_values = serialize_for_audit(table, ["table_number", "name", "status", "capacity_max", "section_id", "is_active"])
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_by"] = current_user.id

    table = await repo.update(table_id, update_data)

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_update("table", table_id, old_values, update_data, entity_name=f"Table {table.table_number}", request=request)

    return TableResponse.model_validate(table)


@router.patch("/{table_id}/status", response_model=TableResponse)
async def update_table_status(
    table_id: UUID,
    data: TableStatusUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("tables.write")),
):
    """Quick status update for a table."""
    repo = BaseRepository(Table, db, current_user.company_id)
    table = await repo.get_by_id(table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    old_status = table.status
    table = await repo.update(table_id, {"status": data.status, "updated_by": current_user.id})

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_status_change("table", table_id, old_status, data.status,
                                   entity_name=f"Table {table.table_number}", request=request)

    return TableResponse.model_validate(table)


@router.delete("/{table_id}", response_model=MessageResponse)
async def delete_table(
    table_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("tables.delete")),
):
    """Soft delete a table."""
    repo = BaseRepository(Table, db, current_user.company_id)
    table = await repo.get_by_id(table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_delete("table", table_id, entity_name=f"Table {table.table_number}", request=request)

    await repo.soft_delete(table_id)
    return MessageResponse(message="Table deactivated successfully")


# ==================== Operating Hours ====================

@router.get("/settings/operating-hours", response_model=list[OperatingHoursResponse])
async def get_operating_hours(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get operating hours for all days."""
    result = await db.execute(
        select(OperatingHours)
        .where(OperatingHours.company_id == current_user.company_id)
        .order_by(OperatingHours.day_of_week)
    )
    return [OperatingHoursResponse.model_validate(h) for h in result.scalars().all()]


@router.put("/settings/operating-hours", response_model=list[OperatingHoursResponse])
async def update_operating_hours(
    data: OperatingHoursBulkUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("tables.write")),
):
    """Update operating hours for all days (bulk update)."""
    # Delete existing
    existing = await db.execute(
        select(OperatingHours).where(OperatingHours.company_id == current_user.company_id)
    )
    for item in existing.scalars().all():
        await db.delete(item)

    # Create new
    new_hours = []
    for h in data.hours:
        oh = OperatingHours(company_id=current_user.company_id, **h.model_dump())
        db.add(oh)
        new_hours.append(oh)

    await db.flush()

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log("operating_hours", current_user.company_id, "bulk_update",
                     new_values={"days_updated": len(data.hours)}, request=request)

    return [OperatingHoursResponse.model_validate(h) for h in new_hours]


# ==================== Special Hours ====================

@router.get("/settings/special-hours", response_model=list[SpecialHoursResponse])
async def list_special_hours(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get all special hours (holidays, events)."""
    result = await db.execute(
        select(SpecialHours)
        .where(SpecialHours.company_id == current_user.company_id)
        .order_by(SpecialHours.date)
    )
    return [SpecialHoursResponse.model_validate(h) for h in result.scalars().all()]


@router.post("/settings/special-hours", response_model=SpecialHoursResponse, status_code=status.HTTP_201_CREATED)
async def create_special_hours(
    data: SpecialHoursCreate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("tables.write")),
):
    """Create special hours for a date."""
    sh = SpecialHours(company_id=current_user.company_id, created_by=current_user.id, **data.model_dump())
    db.add(sh)
    await db.flush()
    await db.refresh(sh)
    return SpecialHoursResponse.model_validate(sh)


@router.delete("/settings/special-hours/{special_hours_id}", response_model=MessageResponse)
async def delete_special_hours(
    special_hours_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("tables.write")),
):
    """Delete special hours."""
    result = await db.execute(
        select(SpecialHours).where(
            SpecialHours.id == special_hours_id,
            SpecialHours.company_id == current_user.company_id,
        )
    )
    sh = result.scalar_one_or_none()
    if not sh:
        raise HTTPException(status_code=404, detail="Special hours not found")
    await db.delete(sh)
    return MessageResponse(message="Special hours deleted")
