"""Menu management API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from typing import Optional
from uuid import UUID
import math

from app.core.database import get_db
from app.middleware.auth import get_current_user, require_permissions, CurrentUser
from app.models.menu import (
    MenuCategory, MenuItem, Allergen, MenuItemAllergen,
    MenuItemVariant, MenuItemIngredient, MenuItemTag, PriceHistory,
)
from app.schemas.menu import (
    MenuCategoryCreate, MenuCategoryUpdate, MenuCategoryResponse,
    AllergenCreate, AllergenResponse,
    MenuItemCreate, MenuItemUpdate, MenuItemResponse, MenuItemBriefResponse,
    MenuItemVariantSchema, MenuItemIngredientSchema,
)
from app.schemas.common import PaginatedResponse, MessageResponse
from app.repositories.base import BaseRepository
from app.services.audit_service import AuditService, serialize_for_audit

router = APIRouter()


# ==================== Menu Categories ====================

@router.get("/categories", response_model=list[MenuCategoryResponse])
async def list_categories(
    parent_id: Optional[UUID] = None,
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List menu categories (tree structure)."""
    query = select(MenuCategory).where(MenuCategory.company_id == current_user.company_id)
    if parent_id:
        query = query.where(MenuCategory.parent_id == parent_id)
    else:
        query = query.where(MenuCategory.parent_id.is_(None))
    if not include_inactive:
        query = query.where(MenuCategory.is_active == True)
    query = query.order_by(MenuCategory.sort_order, MenuCategory.name)

    result = await db.execute(query)
    categories = result.scalars().all()

    response = []
    for cat in categories:
        # Count items in this category
        count_q = select(func.count()).select_from(MenuItem).where(
            MenuItem.category_id == cat.id, MenuItem.is_available == True
        )
        count_r = await db.execute(count_q)

        # Load children explicitly (avoid lazy-load MissingGreenlet)
        child_q = select(MenuCategory).where(
            MenuCategory.parent_id == cat.id, MenuCategory.company_id == current_user.company_id
        )
        if not include_inactive:
            child_q = child_q.where(MenuCategory.is_active == True)
        child_r = await db.execute(child_q.order_by(MenuCategory.sort_order))
        children = []
        for child in child_r.scalars().all():
            children.append(MenuCategoryResponse(
                id=child.id, parent_id=child.parent_id, name=child.name,
                description=child.description, image_url=child.image_url,
                sort_order=child.sort_order, is_active=child.is_active,
                item_count=0, children=[], created_at=child.created_at,
            ))

        response.append(MenuCategoryResponse(
            id=cat.id, parent_id=cat.parent_id, name=cat.name,
            description=cat.description, image_url=cat.image_url,
            sort_order=cat.sort_order, is_active=cat.is_active,
            item_count=count_r.scalar() or 0, children=children,
            created_at=cat.created_at,
        ))

    return response


@router.post("/categories", response_model=MenuCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    data: MenuCategoryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("menu.write")),
):
    repo = BaseRepository(MenuCategory, db, current_user.company_id)
    category = await repo.create({**data.model_dump(), "created_by": current_user.id})
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_create("menu_category", category.id, data.model_dump(), entity_name=category.name, request=request)
    d = {
        "id": category.id, "parent_id": category.parent_id, "name": category.name,
        "description": category.description, "image_url": category.image_url,
        "sort_order": category.sort_order, "is_active": category.is_active,
        "item_count": 0, "children": [], "created_at": category.created_at,
    }
    return MenuCategoryResponse(**d)


@router.put("/categories/{category_id}", response_model=MenuCategoryResponse)
async def update_category(
    category_id: UUID, data: MenuCategoryUpdate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("menu.write")),
):
    repo = BaseRepository(MenuCategory, db, current_user.company_id)
    cat = await repo.get_by_id(category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    old_values = serialize_for_audit(cat, ["name", "description", "sort_order", "is_active"])
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_by"] = current_user.id
    cat = await repo.update(category_id, update_data)
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_update("menu_category", category_id, old_values, update_data, entity_name=cat.name, request=request)
    d = {
        "id": cat.id, "parent_id": cat.parent_id, "name": cat.name,
        "description": cat.description, "image_url": cat.image_url,
        "sort_order": cat.sort_order, "is_active": cat.is_active,
        "item_count": 0, "children": [], "created_at": cat.created_at,
    }
    return MenuCategoryResponse(**d)


@router.delete("/categories/{category_id}", response_model=MessageResponse)
async def delete_category(
    category_id: UUID, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("menu.delete")),
):
    repo = BaseRepository(MenuCategory, db, current_user.company_id)
    cat = await repo.get_by_id(category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_delete("menu_category", category_id, entity_name=cat.name, request=request)
    await repo.soft_delete(category_id)
    return MessageResponse(message="Category deactivated")


# ==================== Allergens ====================

@router.get("/allergens", response_model=list[AllergenResponse])
async def list_allergens(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(Allergen).where(
            (Allergen.company_id == current_user.company_id) | (Allergen.company_id.is_(None))
        ).where(Allergen.is_active == True).order_by(Allergen.name)
    )
    return [AllergenResponse.model_validate(a) for a in result.scalars().all()]


@router.post("/allergens", response_model=AllergenResponse, status_code=status.HTTP_201_CREATED)
async def create_allergen(
    data: AllergenCreate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("menu.write")),
):
    allergen = Allergen(company_id=current_user.company_id, **data.model_dump())
    db.add(allergen)
    await db.flush()
    await db.refresh(allergen)
    return AllergenResponse.model_validate(allergen)


# ==================== Menu Items ====================

@router.get("/items", response_model=PaginatedResponse[MenuItemResponse])
async def list_items(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    category_id: Optional[UUID] = None,
    is_available: Optional[bool] = None,
    is_featured: Optional[bool] = None,
    is_vegetarian: Optional[bool] = None,
    is_vegan: Optional[bool] = None,
    is_gluten_free: Optional[bool] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """List menu items with filters."""
    query = select(MenuItem).where(MenuItem.company_id == current_user.company_id)

    if category_id:
        query = query.where(MenuItem.category_id == category_id)
    if is_available is not None:
        query = query.where(MenuItem.is_available == is_available)
    if is_featured is not None:
        query = query.where(MenuItem.is_featured == is_featured)
    if is_vegetarian:
        query = query.where(MenuItem.is_vegetarian == True)
    if is_vegan:
        query = query.where(MenuItem.is_vegan == True)
    if is_gluten_free:
        query = query.where(MenuItem.is_gluten_free == True)
    if min_price is not None:
        query = query.where(MenuItem.price >= min_price)
    if max_price is not None:
        query = query.where(MenuItem.price <= max_price)
    if search:
        from sqlalchemy import or_
        query = query.where(or_(
            MenuItem.name.ilike(f"%{search}%"),
            MenuItem.description.ilike(f"%{search}%"),
            MenuItem.search_keywords.ilike(f"%{search}%"),
        ))

    # Count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    # Fetch with relations
    query = query.options(
        selectinload(MenuItem.category),
        selectinload(MenuItem.allergens).selectinload(MenuItemAllergen.allergen),
        selectinload(MenuItem.variants),
        selectinload(MenuItem.tags),
    ).order_by(MenuItem.sort_order, MenuItem.name)
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    items = result.scalars().all()

    response_items = []
    for item in items:
        resp = MenuItemResponse(
            **{k: v for k, v in MenuItemResponse.model_validate(item).model_dump().items()
               if k not in ["category_name", "allergens", "tags"]},
            category_name=item.category.name if item.category else None,
            allergens=[AllergenResponse.model_validate(mia.allergen) for mia in item.allergens],
            tags=[t.tag for t in item.tags],
        )
        response_items.append(resp)

    return PaginatedResponse(
        items=response_items, total=total, page=page, page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/items", response_model=MenuItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(
    data: MenuItemCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("menu.write")),
):
    """Create a new menu item."""
    # Extract related data
    allergen_ids = data.allergen_ids or []
    tag_names = data.tags or []
    item_data = data.model_dump(exclude={"allergen_ids", "tags"})
    item_data["company_id"] = current_user.company_id
    item_data["created_by"] = current_user.id

    item = MenuItem(**item_data)
    db.add(item)
    await db.flush()

    # Add allergens
    for a_id in allergen_ids:
        db.add(MenuItemAllergen(menu_item_id=item.id, allergen_id=a_id))

    # Add tags
    for tag in tag_names:
        db.add(MenuItemTag(menu_item_id=item.id, tag=tag))

    await db.flush()
    await db.refresh(item)

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_create("menu_item", item.id, {"name": item.name, "price": float(item.price)},
                            entity_name=item.name, request=request)

    # Build response manually to avoid lazy loading issues
    d = {k: getattr(item, k) for k in MenuItemResponse.model_fields.keys()
         if k not in ["category_name", "allergens", "variants", "tags"] and hasattr(item, k)}
    d["category_name"] = None
    d["allergens"] = []
    d["variants"] = []
    d["tags"] = tag_names
    return MenuItemResponse(**d)


@router.get("/items/{item_id}", response_model=MenuItemResponse)
async def get_item(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get a specific menu item with all details."""
    result = await db.execute(
        select(MenuItem).where(
            MenuItem.id == item_id, MenuItem.company_id == current_user.company_id
        ).options(
            selectinload(MenuItem.category),
            selectinload(MenuItem.allergens).selectinload(MenuItemAllergen.allergen),
            selectinload(MenuItem.variants),
            selectinload(MenuItem.tags),
            selectinload(MenuItem.ingredients),
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    resp = MenuItemResponse(
        **{k: v for k, v in MenuItemResponse.model_validate(item).model_dump().items()
           if k not in ["category_name", "allergens", "tags"]},
        category_name=item.category.name if item.category else None,
        allergens=[AllergenResponse.model_validate(mia.allergen) for mia in item.allergens],
        tags=[t.tag for t in item.tags],
    )
    return resp


@router.put("/items/{item_id}", response_model=MenuItemResponse)
async def update_item(
    item_id: UUID, data: MenuItemUpdate, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("menu.write")),
):
    """Update a menu item."""
    result = await db.execute(
        select(MenuItem).where(MenuItem.id == item_id, MenuItem.company_id == current_user.company_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    old_price = item.price
    old_cost_price = item.cost_price
    old_values = serialize_for_audit(item, ["name", "price", "is_available", "category_id"])

    update_data = data.model_dump(exclude_unset=True, exclude={"allergen_ids", "tags"})
    update_data["updated_by"] = current_user.id

    for key, value in update_data.items():
        if hasattr(item, key) and value is not None:
            setattr(item, key, value)

    # Update allergens if provided
    if data.allergen_ids is not None:
        await db.execute(delete(MenuItemAllergen).where(MenuItemAllergen.menu_item_id == item_id))
        for a_id in data.allergen_ids:
            db.add(MenuItemAllergen(menu_item_id=item_id, allergen_id=a_id))

    # Update tags if provided
    if data.tags is not None:
        await db.execute(delete(MenuItemTag).where(MenuItemTag.menu_item_id == item_id))
        for tag in data.tags:
            db.add(MenuItemTag(menu_item_id=item_id, tag=tag))

    # Track price changes
    if data.price is not None and data.price != old_price:
        price_entry = PriceHistory(
            menu_item_id=item_id, old_price=old_price, new_price=data.price,
            old_cost_price=old_cost_price,
            new_cost_price=data.cost_price if data.cost_price is not None else old_cost_price,
            changed_by=current_user.id,
        )
        db.add(price_entry)

    await db.flush()
    await db.refresh(item)

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_update("menu_item", item_id, old_values, update_data, entity_name=item.name, request=request)

    # Re-fetch with relations to build proper response
    result2 = await db.execute(
        select(MenuItem).where(MenuItem.id == item_id).options(
            selectinload(MenuItem.category),
            selectinload(MenuItem.allergens).selectinload(MenuItemAllergen.allergen),
            selectinload(MenuItem.variants),
            selectinload(MenuItem.tags),
        )
    )
    item = result2.scalar_one()
    resp = MenuItemResponse(
        **{k: v for k, v in MenuItemResponse.model_validate(item).model_dump().items()
           if k not in ["category_name", "allergens", "tags"]},
        category_name=item.category.name if item.category else None,
        allergens=[AllergenResponse.model_validate(mia.allergen) for mia in item.allergens],
        tags=[t.tag for t in item.tags],
    )
    return resp


@router.delete("/items/{item_id}", response_model=MessageResponse)
async def delete_item(
    item_id: UUID, request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("menu.delete")),
):
    repo = BaseRepository(MenuItem, db, current_user.company_id)
    item = await repo.get_by_id(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    audit = AuditService(db, current_user.company_id, current_user.id)
    await audit.log_delete("menu_item", item_id, entity_name=item.name, request=request)

    item.is_available = False
    await db.flush()
    return MessageResponse(message="Menu item deactivated")


# ==================== Variants ====================

@router.get("/items/{item_id}/variants", response_model=list[MenuItemVariantSchema])
async def list_variants(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(MenuItemVariant).where(MenuItemVariant.menu_item_id == item_id)
        .order_by(MenuItemVariant.sort_order)
    )
    return [MenuItemVariantSchema.model_validate(v) for v in result.scalars().all()]


@router.post("/items/{item_id}/variants", response_model=MenuItemVariantSchema, status_code=status.HTTP_201_CREATED)
async def create_variant(
    item_id: UUID, data: MenuItemVariantSchema,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("menu.write")),
):
    # Verify item belongs to company
    repo = BaseRepository(MenuItem, db, current_user.company_id)
    if not await repo.get_by_id(item_id):
        raise HTTPException(status_code=404, detail="Menu item not found")

    variant = MenuItemVariant(menu_item_id=item_id, **data.model_dump(exclude={"id"}))
    db.add(variant)
    await db.flush()
    await db.refresh(variant)
    return MenuItemVariantSchema.model_validate(variant)


# ==================== Ingredients ====================

@router.get("/items/{item_id}/ingredients", response_model=list[MenuItemIngredientSchema])
async def list_ingredients(
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    result = await db.execute(
        select(MenuItemIngredient).where(MenuItemIngredient.menu_item_id == item_id)
    )
    return [MenuItemIngredientSchema.model_validate(i) for i in result.scalars().all()]


@router.post("/items/{item_id}/ingredients", response_model=MenuItemIngredientSchema, status_code=status.HTTP_201_CREATED)
async def create_ingredient(
    item_id: UUID, data: MenuItemIngredientSchema,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = Depends(require_permissions("menu.write")),
):
    repo = BaseRepository(MenuItem, db, current_user.company_id)
    if not await repo.get_by_id(item_id):
        raise HTTPException(status_code=404, detail="Menu item not found")

    ingredient = MenuItemIngredient(menu_item_id=item_id, **data.model_dump(exclude={"id"}))
    db.add(ingredient)
    await db.flush()
    await db.refresh(ingredient)
    return MenuItemIngredientSchema.model_validate(ingredient)
