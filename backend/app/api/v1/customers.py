"""Customer management API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional
from uuid import UUID
import math

from app.core.database import get_db
from app.middleware.auth import get_current_user, require_permissions, CurrentUser
from app.models.customer import Customer, CustomerNote
from app.schemas.customer import (
    CustomerCreate, CustomerUpdate, CustomerResponse, CustomerBriefResponse,
    CustomerNoteCreate, CustomerNoteResponse,
)
from app.schemas.common import PaginatedResponse, MessageResponse
from app.repositories.base import BaseRepository
from app.services.audit_service import AuditService, serialize_for_audit

router = APIRouter()


# ==================== Customers ====================

@router.get("", response_model=PaginatedResponse[CustomerResponse])
async def list_customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    vip: Optional[bool] = None,
    tier: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List customers with filters."""
    query = select(Customer).where(Customer.company_id == current_user.company_id)

    if vip is not None:
        query = query.where(Customer.vip_status == vip)
    if tier:
        query = query.where(Customer.customer_tier == tier)
    if is_active is not None:
        query = query.where(Customer.is_active == is_active)
    if search:
        from sqlalchemy import or_
        query = query.where(or_(
            Customer.first_name.ilike(f"%{search}%"),
            Customer.last_name.ilike(f"%{search}%"),
            Customer.email.ilike(f"%{search}%"),
            Customer.phone.ilike(f"%{search}%"),
        ))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    query = query.order_by(Customer.last_name, Customer.first_name)
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    customers = result.scalars().all()

    response_items = []
    for c in customers:
        d = CustomerResponse.model_validate(c).model_dump()
        d["full_name"] = f"{c.first_name} {c.last_name}" if c.last_name else c.first_name
        response_items.append(CustomerResponse(**d))

    return PaginatedResponse(
        items=response_items, total=total, page=page, page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


@router.get("/search", response_model=list[CustomerBriefResponse])
async def search_customers(
    q: str = Query(..., min_length=2),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Quick customer search for autocomplete."""
    from sqlalchemy import or_
    result = await db.execute(
        select(Customer).where(
            Customer.company_id == current_user.company_id,
            Customer.is_active == True,
            or_(
                Customer.first_name.ilike(f"%{q}%"),
                Customer.last_name.ilike(f"%{q}%"),
                Customer.phone.ilike(f"%{q}%"),
                Customer.email.ilike(f"%{q}%"),
            ),
        ).limit(10)
    )
    return [CustomerBriefResponse.model_validate(c) for c in result.scalars().all()]


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer(
    data: CustomerCreate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("customers.write")),
):
    repo = BaseRepository(Customer, db, current_user.company_id)
    customer = await repo.create({**data.model_dump(), "created_by": current_user.id})
    audit = AuditService(db, current_user.company_id, current_user.id)
    full_name = f"{data.first_name} {data.last_name}" if data.last_name else data.first_name
    await audit.log_create("customer", customer.id,
                            {"name": full_name, "phone": data.phone},
                            entity_name=full_name, request=request)

    d = CustomerResponse.model_validate(customer).model_dump()
    d["full_name"] = full_name
    return CustomerResponse(**d)


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    repo = BaseRepository(Customer, db, current_user.company_id)
    customer = await repo.get_by_id(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    d = CustomerResponse.model_validate(customer).model_dump()
    d["full_name"] = f"{customer.first_name} {customer.last_name}" if customer.last_name else customer.first_name
    return CustomerResponse(**d)


@router.put("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: UUID, data: CustomerUpdate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("customers.write")),
):
    repo = BaseRepository(Customer, db, current_user.company_id)
    customer = await repo.get_by_id(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    old_values = serialize_for_audit(customer, ["first_name", "last_name", "email", "phone", "vip_status"])
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_by"] = current_user.id
    customer = await repo.update(customer_id, update_data)

    audit = AuditService(db, current_user.company_id, current_user.id)
    full_name = f"{customer.first_name} {customer.last_name}" if customer.last_name else customer.first_name
    await audit.log_update("customer", customer_id, old_values, update_data, entity_name=full_name, request=request)

    d = CustomerResponse.model_validate(customer).model_dump()
    d["full_name"] = full_name
    return CustomerResponse(**d)


@router.delete("/{customer_id}", response_model=MessageResponse)
async def delete_customer(
    customer_id: UUID, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("customers.delete")),
):
    repo = BaseRepository(Customer, db, current_user.company_id)
    customer = await repo.get_by_id(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    full_name = f"{customer.first_name} {customer.last_name}" if customer.last_name else customer.first_name
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_delete("customer", customer_id, entity_name=full_name, request=request)
    await repo.soft_delete(customer_id)
    return MessageResponse(message="Customer deactivated")


# ==================== Customer Notes ====================

@router.get("/{customer_id}/notes", response_model=list[CustomerNoteResponse])
async def list_notes(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    # Verify customer belongs to company
    repo = BaseRepository(Customer, db, current_user.company_id)
    if not await repo.get_by_id(customer_id):
        raise HTTPException(status_code=404, detail="Customer not found")

    result = await db.execute(
        select(CustomerNote)
        .where(CustomerNote.customer_id == customer_id)
        .options(selectinload(CustomerNote.creator))
        .order_by(CustomerNote.is_pinned.desc(), CustomerNote.created_at.desc())
    )
    notes = result.scalars().all()
    response = []
    for n in notes:
        d = CustomerNoteResponse.model_validate(n).model_dump()
        d["created_by_name"] = f"{n.creator.first_name} {n.creator.last_name}" if n.creator else None
        response.append(CustomerNoteResponse(**d))
    return response


@router.post("/{customer_id}/notes", response_model=CustomerNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    customer_id: UUID, data: CustomerNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("customers.write")),
):
    repo = BaseRepository(Customer, db, current_user.company_id)
    if not await repo.get_by_id(customer_id):
        raise HTTPException(status_code=404, detail="Customer not found")

    note = CustomerNote(
        customer_id=customer_id,
        created_by=current_user.id,
        **data.model_dump(),
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    return CustomerNoteResponse.model_validate(note)


@router.delete("/{customer_id}/notes/{note_id}", response_model=MessageResponse)
async def delete_note(
    customer_id: UUID, note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("customers.write")),
):
    result = await db.execute(
        select(CustomerNote).where(
            CustomerNote.id == note_id, CustomerNote.customer_id == customer_id
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.delete(note)
    return MessageResponse(message="Note deleted")
