"""Inventory management API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional
from uuid import UUID
import math

from app.core.database import get_db
from app.middleware.auth import get_current_user, require_permissions, CurrentUser
from app.models.inventory import (
    InventoryCategory, UnitOfMeasure, InventoryItem, StockMovement,
    Supplier, SupplierItem,
)
from app.schemas.inventory import (
    InventoryCategoryCreate, InventoryCategoryUpdate, InventoryCategoryResponse,
    UnitOfMeasureCreate, UnitOfMeasureResponse,
    InventoryItemCreate, InventoryItemUpdate, InventoryItemResponse,
    StockMovementCreate, StockMovementResponse,
    SupplierCreate, SupplierUpdate, SupplierResponse,
)
from app.schemas.common import PaginatedResponse, MessageResponse
from app.repositories.base import BaseRepository
from app.services.audit_service import AuditService, serialize_for_audit

router = APIRouter()


# ==================== Inventory Categories ====================

@router.get("/categories", response_model=list[InventoryCategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    repo = BaseRepository(InventoryCategory, db, current_user.company_id)
    items, _ = await repo.get_all(is_active_filter=True, limit=200)
    response = []
    for cat in items:
        count_q = select(func.count()).select_from(InventoryItem).where(
            InventoryItem.category_id == cat.id, InventoryItem.is_active == True
        )
        count = (await db.execute(count_q)).scalar()
        d = InventoryCategoryResponse.model_validate(cat).model_dump()
        d["item_count"] = count
        response.append(InventoryCategoryResponse(**d))
    return response


@router.post("/categories", response_model=InventoryCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    data: InventoryCategoryCreate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("inventory.write")),
):
    repo = BaseRepository(InventoryCategory, db, current_user.company_id)
    category = await repo.create(data.model_dump())
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_create("inventory_category", category.id, data.model_dump(), entity_name=category.name, request=request)
    return InventoryCategoryResponse.model_validate(category)


@router.put("/categories/{category_id}", response_model=InventoryCategoryResponse)
async def update_category(
    category_id: UUID, data: InventoryCategoryUpdate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("inventory.write")),
):
    repo = BaseRepository(InventoryCategory, db, current_user.company_id)
    cat = await repo.get_by_id(category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    old_values = serialize_for_audit(cat, ["name", "is_active"])
    cat = await repo.update(category_id, data.model_dump(exclude_unset=True))
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_update("inventory_category", category_id, old_values, data.model_dump(exclude_unset=True), entity_name=cat.name, request=request)
    return InventoryCategoryResponse.model_validate(cat)


# ==================== Units of Measure ====================

@router.get("/units", response_model=list[UnitOfMeasureResponse])
async def list_units(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(UnitOfMeasure).where(
            (UnitOfMeasure.company_id == current_user.company_id) | (UnitOfMeasure.company_id.is_(None))
        ).where(UnitOfMeasure.is_active == True).order_by(UnitOfMeasure.name)
    )
    return [UnitOfMeasureResponse.model_validate(u) for u in result.scalars().all()]


@router.post("/units", response_model=UnitOfMeasureResponse, status_code=status.HTTP_201_CREATED)
async def create_unit(
    data: UnitOfMeasureCreate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("inventory.write")),
):
    unit = UnitOfMeasure(company_id=current_user.company_id, **data.model_dump())
    db.add(unit)
    await db.flush()
    await db.refresh(unit)
    return UnitOfMeasureResponse.model_validate(unit)


# ==================== Inventory Items ====================

@router.get("/items", response_model=PaginatedResponse[InventoryItemResponse])
async def list_items(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    category_id: Optional[UUID] = None,
    low_stock: Optional[bool] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List inventory items with filters."""
    query = select(InventoryItem).where(InventoryItem.company_id == current_user.company_id)

    if category_id:
        query = query.where(InventoryItem.category_id == category_id)
    if is_active is not None:
        query = query.where(InventoryItem.is_active == is_active)
    if low_stock:
        query = query.where(InventoryItem.current_stock <= InventoryItem.minimum_stock)
    if search:
        from sqlalchemy import or_
        query = query.where(or_(
            InventoryItem.name.ilike(f"%{search}%"),
            InventoryItem.sku.ilike(f"%{search}%"),
        ))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    query = query.options(
        selectinload(InventoryItem.category),
        selectinload(InventoryItem.unit),
    ).order_by(InventoryItem.name)
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    items = result.scalars().all()

    response_items = []
    for item in items:
        d = InventoryItemResponse.model_validate(item).model_dump()
        d["category_name"] = item.category.name if item.category else None
        d["unit_name"] = item.unit.name if item.unit else None
        d["unit_abbreviation"] = item.unit.abbreviation if item.unit else None
        d["is_low_stock"] = item.current_stock <= item.minimum_stock if item.minimum_stock else False
        response_items.append(InventoryItemResponse(**d))

    return PaginatedResponse(
        items=response_items, total=total, page=page, page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/items", response_model=InventoryItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(
    data: InventoryItemCreate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("inventory.write")),
):
    repo = BaseRepository(InventoryItem, db, current_user.company_id)
    item = await repo.create({**data.model_dump(), "created_by": current_user.id})

    # Create initial stock movement if stock > 0
    if data.current_stock > 0:
        movement = StockMovement(
            company_id=current_user.company_id,
            inventory_item_id=item.id,
            movement_type="initial",
            quantity=data.current_stock,
            unit_cost=data.unit_cost,
            total_cost=float(data.current_stock) * float(data.unit_cost),
            stock_before=0,
            stock_after=data.current_stock,
            notes="Initial stock",
            performed_by=current_user.id,
        )
        db.add(movement)
        await db.flush()

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_create("inventory_item", item.id, {"name": item.name, "sku": item.sku},
                            entity_name=item.name, request=request)
    return InventoryItemResponse.model_validate(item)


@router.get("/items/{item_id}", response_model=InventoryItemResponse)
async def get_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    repo = BaseRepository(InventoryItem, db, current_user.company_id)
    item = await repo.get_by_id(item_id, options=[
        selectinload(InventoryItem.category),
        selectinload(InventoryItem.unit),
    ])
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    d = InventoryItemResponse.model_validate(item).model_dump()
    d["category_name"] = item.category.name if item.category else None
    d["unit_name"] = item.unit.name if item.unit else None
    d["unit_abbreviation"] = item.unit.abbreviation if item.unit else None
    d["is_low_stock"] = item.current_stock <= item.minimum_stock if item.minimum_stock else False
    return InventoryItemResponse(**d)


@router.put("/items/{item_id}", response_model=InventoryItemResponse)
async def update_item(
    item_id: UUID, data: InventoryItemUpdate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("inventory.write")),
):
    repo = BaseRepository(InventoryItem, db, current_user.company_id)
    item = await repo.get_by_id(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    old_values = serialize_for_audit(item, ["name", "sku", "current_stock", "minimum_stock", "unit_cost", "is_active"])
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_by"] = current_user.id
    item = await repo.update(item_id, update_data)
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_update("inventory_item", item_id, old_values, update_data, entity_name=item.name, request=request)
    return InventoryItemResponse.model_validate(item)


@router.delete("/items/{item_id}", response_model=MessageResponse)
async def delete_item(
    item_id: UUID, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("inventory.delete")),
):
    repo = BaseRepository(InventoryItem, db, current_user.company_id)
    item = await repo.get_by_id(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_delete("inventory_item", item_id, entity_name=item.name, request=request)
    await repo.soft_delete(item_id)
    return MessageResponse(message="Inventory item deactivated")


# ==================== Stock Movements ====================

@router.post("/stock-movements", response_model=StockMovementResponse, status_code=status.HTTP_201_CREATED)
async def create_stock_movement(
    data: StockMovementCreate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("inventory.write")),
):
    """Record a stock movement (purchase, usage, waste, adjustment, etc.)."""
    repo = BaseRepository(InventoryItem, db, current_user.company_id)
    item = await repo.get_by_id(data.inventory_item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    stock_before = float(item.current_stock)
    stock_after = stock_before + float(data.quantity)

    if stock_after < 0:
        raise HTTPException(status_code=400, detail=f"Insufficient stock. Current: {stock_before}, Requested: {data.quantity}")

    # Update item stock
    item.current_stock = stock_after
    if data.unit_cost and data.movement_type == "purchase":
        item.unit_cost = data.unit_cost

    # Create movement record
    movement = StockMovement(
        company_id=current_user.company_id,
        inventory_item_id=data.inventory_item_id,
        movement_type=data.movement_type,
        quantity=data.quantity,
        unit_cost=data.unit_cost,
        total_cost=abs(float(data.quantity)) * float(data.unit_cost) if data.unit_cost else None,
        stock_before=stock_before,
        stock_after=stock_after,
        reference_type=data.reference_type,
        reference_id=data.reference_id,
        batch_number=data.batch_number,
        expiry_date=data.expiry_date,
        notes=data.notes,
        performed_by=current_user.id,
    )
    db.add(movement)
    await db.flush()
    await db.refresh(movement)

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log("inventory_item", item.id, "stock_movement",
                     old_values={"stock": stock_before},
                     new_values={"stock": stock_after, "movement_type": data.movement_type, "quantity": float(data.quantity)},
                     entity_name=item.name, request=request)

    return StockMovementResponse.model_validate(movement)


@router.get("/stock-movements", response_model=PaginatedResponse[StockMovementResponse])
async def list_stock_movements(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    inventory_item_id: Optional[UUID] = None,
    movement_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List stock movements with filters."""
    query = select(StockMovement).where(StockMovement.company_id == current_user.company_id)
    if inventory_item_id:
        query = query.where(StockMovement.inventory_item_id == inventory_item_id)
    if movement_type:
        query = query.where(StockMovement.movement_type == movement_type)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    query = query.options(
        selectinload(StockMovement.inventory_item),
        selectinload(StockMovement.performer),
    ).order_by(StockMovement.performed_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    movements = result.scalars().all()

    response_items = []
    for m in movements:
        d = StockMovementResponse.model_validate(m).model_dump()
        d["inventory_item_name"] = m.inventory_item.name if m.inventory_item else None
        d["performed_by_name"] = f"{m.performer.first_name} {m.performer.last_name}" if m.performer else None
        response_items.append(StockMovementResponse(**d))

    return PaginatedResponse(
        items=response_items, total=total, page=page, page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


# ==================== Suppliers ====================

@router.get("/suppliers", response_model=PaginatedResponse[SupplierResponse])
async def list_suppliers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    repo = BaseRepository(Supplier, db, current_user.company_id)
    items, total = await repo.get_all(
        search=search, search_fields=["name", "contact_name", "email"],
        is_active_filter=is_active,
        offset=(page - 1) * page_size, limit=page_size,
    )
    return PaginatedResponse(
        items=[SupplierResponse.model_validate(s) for s in items],
        total=total, page=page, page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/suppliers", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    data: SupplierCreate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("inventory.write")),
):
    repo = BaseRepository(Supplier, db, current_user.company_id)
    supplier = await repo.create({**data.model_dump(), "created_by": current_user.id})
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_create("supplier", supplier.id, {"name": supplier.name}, entity_name=supplier.name, request=request)
    return SupplierResponse.model_validate(supplier)


@router.get("/suppliers/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(
    supplier_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    repo = BaseRepository(Supplier, db, current_user.company_id)
    supplier = await repo.get_by_id(supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return SupplierResponse.model_validate(supplier)


@router.put("/suppliers/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: UUID, data: SupplierUpdate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("inventory.write")),
):
    repo = BaseRepository(Supplier, db, current_user.company_id)
    supplier = await repo.get_by_id(supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    old_values = serialize_for_audit(supplier, ["name", "email", "phone", "is_active"])
    supplier = await repo.update(supplier_id, data.model_dump(exclude_unset=True))
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_update("supplier", supplier_id, old_values, data.model_dump(exclude_unset=True), entity_name=supplier.name, request=request)
    return SupplierResponse.model_validate(supplier)


@router.delete("/suppliers/{supplier_id}", response_model=MessageResponse)
async def delete_supplier(
    supplier_id: UUID, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("inventory.delete")),
):
    repo = BaseRepository(Supplier, db, current_user.company_id)
    supplier = await repo.get_by_id(supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_delete("supplier", supplier_id, entity_name=supplier.name, request=request)
    await repo.soft_delete(supplier_id)
    return MessageResponse(message="Supplier deactivated")
