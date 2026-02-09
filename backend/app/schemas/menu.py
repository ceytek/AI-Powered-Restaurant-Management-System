"""Schemas for Menu management."""
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from decimal import Decimal


# ==================== Menu Categories ====================

class MenuCategoryCreate(BaseModel):
    parent_id: Optional[UUID] = None
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    image_url: Optional[str] = None
    sort_order: int = 0


class MenuCategoryUpdate(BaseModel):
    parent_id: Optional[UUID] = None
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    image_url: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class MenuCategoryResponse(BaseModel):
    id: UUID
    parent_id: Optional[UUID] = None
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    sort_order: int
    is_active: bool
    item_count: Optional[int] = 0
    children: Optional[List["MenuCategoryResponse"]] = []
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Allergens ====================

class AllergenCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: Optional[str] = Field(None, max_length=20)
    icon: Optional[str] = None
    description: Optional[str] = None
    severity_level: int = Field(1, ge=1, le=3)


class AllergenResponse(BaseModel):
    id: UUID
    name: str
    code: Optional[str] = None
    icon: Optional[str] = None
    description: Optional[str] = None
    severity_level: int
    is_active: bool

    class Config:
        from_attributes = True


# ==================== Menu Items ====================

class MenuItemCreate(BaseModel):
    category_id: Optional[UUID] = None
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    short_description: Optional[str] = Field(None, max_length=300)
    price: Decimal = Field(..., ge=0, decimal_places=2)
    cost_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    currency: str = Field("USD", max_length=3)
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    calories: Optional[int] = Field(None, ge=0)
    preparation_time: Optional[int] = Field(None, ge=0)
    is_vegetarian: bool = False
    is_vegan: bool = False
    is_gluten_free: bool = False
    is_halal: bool = False
    is_kosher: bool = False
    is_spicy: bool = False
    spice_level: int = Field(0, ge=0, le=5)
    is_available: bool = True
    is_featured: bool = False
    is_new: bool = False
    is_seasonal: bool = False
    sort_order: int = 0
    search_keywords: Optional[str] = None
    allergen_ids: Optional[List[UUID]] = []
    tags: Optional[List[str]] = []


class MenuItemUpdate(BaseModel):
    category_id: Optional[UUID] = None
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    short_description: Optional[str] = Field(None, max_length=300)
    price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    cost_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    calories: Optional[int] = Field(None, ge=0)
    preparation_time: Optional[int] = Field(None, ge=0)
    is_vegetarian: Optional[bool] = None
    is_vegan: Optional[bool] = None
    is_gluten_free: Optional[bool] = None
    is_halal: Optional[bool] = None
    is_kosher: Optional[bool] = None
    is_spicy: Optional[bool] = None
    spice_level: Optional[int] = Field(None, ge=0, le=5)
    is_available: Optional[bool] = None
    is_featured: Optional[bool] = None
    is_new: Optional[bool] = None
    is_seasonal: Optional[bool] = None
    sort_order: Optional[int] = None
    search_keywords: Optional[str] = None
    allergen_ids: Optional[List[UUID]] = None
    tags: Optional[List[str]] = None


class MenuItemVariantSchema(BaseModel):
    id: Optional[UUID] = None
    name: str = Field(..., min_length=1, max_length=100)
    price_modifier: Decimal = Field(0, decimal_places=2)
    is_default: bool = False
    is_available: bool = True
    sort_order: int = 0


class MenuItemIngredientSchema(BaseModel):
    id: Optional[UUID] = None
    inventory_item_id: Optional[UUID] = None
    name: str = Field(..., min_length=1, max_length=100)
    quantity: Optional[Decimal] = None
    unit: Optional[str] = Field(None, max_length=20)
    is_optional: bool = False
    is_visible: bool = True


class MenuItemResponse(BaseModel):
    id: UUID
    category_id: Optional[UUID] = None
    category_name: Optional[str] = None
    name: str
    description: Optional[str] = None
    short_description: Optional[str] = None
    price: Decimal
    cost_price: Optional[Decimal] = None
    currency: str
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    calories: Optional[int] = None
    preparation_time: Optional[int] = None
    is_vegetarian: bool
    is_vegan: bool
    is_gluten_free: bool
    is_halal: bool
    is_kosher: bool
    is_spicy: bool
    spice_level: int
    is_available: bool
    is_featured: bool
    is_new: bool
    is_seasonal: bool
    sort_order: int
    allergens: List[AllergenResponse] = []
    variants: List[MenuItemVariantSchema] = []
    tags: List[str] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MenuItemBriefResponse(BaseModel):
    """Minimal menu item for lists."""
    id: UUID
    name: str
    price: Decimal
    category_name: Optional[str] = None
    is_available: bool
    is_featured: bool
    image_url: Optional[str] = None

    class Config:
        from_attributes = True
