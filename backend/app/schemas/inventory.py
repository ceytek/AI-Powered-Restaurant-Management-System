"""Schemas for Inventory management."""
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime, date
from decimal import Decimal


# ==================== Inventory Categories ====================

class InventoryCategoryCreate(BaseModel):
    parent_id: Optional[UUID] = None
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    sort_order: int = 0


class InventoryCategoryUpdate(BaseModel):
    parent_id: Optional[UUID] = None
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class InventoryCategoryResponse(BaseModel):
    id: UUID
    parent_id: Optional[UUID] = None
    name: str
    description: Optional[str] = None
    sort_order: int
    is_active: bool
    item_count: Optional[int] = 0
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Units of Measure ====================

class UnitOfMeasureCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    abbreviation: str = Field(..., min_length=1, max_length=10)
    unit_type: str = Field(..., pattern=r"^(weight|volume|count|length)$")
    base_unit: Optional[str] = Field(None, max_length=10)
    conversion_factor: Decimal = Field(1, ge=0)


class UnitOfMeasureResponse(BaseModel):
    id: UUID
    name: str
    abbreviation: str
    unit_type: str
    base_unit: Optional[str] = None
    conversion_factor: Decimal
    is_active: bool

    class Config:
        from_attributes = True


# ==================== Inventory Items ====================

class InventoryItemCreate(BaseModel):
    category_id: Optional[UUID] = None
    unit_id: Optional[UUID] = None
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    sku: Optional[str] = Field(None, max_length=50)
    barcode: Optional[str] = Field(None, max_length=100)
    current_stock: Decimal = Field(0, ge=0)
    minimum_stock: Decimal = Field(0, ge=0)
    maximum_stock: Optional[Decimal] = Field(None, ge=0)
    reorder_point: Optional[Decimal] = Field(None, ge=0)
    reorder_quantity: Optional[Decimal] = Field(None, ge=0)
    unit_cost: Decimal = Field(0, ge=0)
    storage_location: Optional[str] = Field(None, max_length=100)
    storage_temperature: Optional[str] = Field(None, max_length=50)
    expiry_tracking: bool = False
    image_url: Optional[str] = None


class InventoryItemUpdate(BaseModel):
    category_id: Optional[UUID] = None
    unit_id: Optional[UUID] = None
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    sku: Optional[str] = Field(None, max_length=50)
    barcode: Optional[str] = Field(None, max_length=100)
    minimum_stock: Optional[Decimal] = Field(None, ge=0)
    maximum_stock: Optional[Decimal] = Field(None, ge=0)
    reorder_point: Optional[Decimal] = Field(None, ge=0)
    reorder_quantity: Optional[Decimal] = Field(None, ge=0)
    unit_cost: Optional[Decimal] = Field(None, ge=0)
    storage_location: Optional[str] = Field(None, max_length=100)
    storage_temperature: Optional[str] = Field(None, max_length=50)
    expiry_tracking: Optional[bool] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None


class InventoryItemResponse(BaseModel):
    id: UUID
    category_id: Optional[UUID] = None
    category_name: Optional[str] = None
    unit_id: Optional[UUID] = None
    unit_name: Optional[str] = None
    unit_abbreviation: Optional[str] = None
    name: str
    description: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    current_stock: Decimal
    minimum_stock: Decimal
    maximum_stock: Optional[Decimal] = None
    reorder_point: Optional[Decimal] = None
    reorder_quantity: Optional[Decimal] = None
    unit_cost: Decimal
    storage_location: Optional[str] = None
    storage_temperature: Optional[str] = None
    expiry_tracking: bool
    image_url: Optional[str] = None
    is_low_stock: Optional[bool] = False
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== Stock Movements ====================

class StockMovementCreate(BaseModel):
    inventory_item_id: UUID
    movement_type: str = Field(
        ..., pattern=r"^(purchase|usage|waste|adjustment|return|transfer|initial)$"
    )
    quantity: Decimal  # Positive = in, Negative = out
    unit_cost: Optional[Decimal] = Field(None, ge=0)
    reference_type: Optional[str] = Field(None, max_length=50)
    reference_id: Optional[UUID] = None
    batch_number: Optional[str] = Field(None, max_length=50)
    expiry_date: Optional[date] = None
    notes: Optional[str] = None


class StockMovementResponse(BaseModel):
    id: UUID
    inventory_item_id: UUID
    inventory_item_name: Optional[str] = None
    movement_type: str
    quantity: Decimal
    unit_cost: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    stock_before: Optional[Decimal] = None
    stock_after: Optional[Decimal] = None
    reference_type: Optional[str] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    notes: Optional[str] = None
    performed_by_name: Optional[str] = None
    performed_at: datetime

    class Config:
        from_attributes = True


# ==================== Suppliers ====================

class SupplierCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    contact_name: Optional[str] = Field(None, max_length=200)
    email: Optional[str] = None
    phone: Optional[str] = Field(None, max_length=50)
    mobile: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    tax_id: Optional[str] = Field(None, max_length=50)
    payment_terms: Optional[str] = Field(None, max_length=100)
    delivery_days: Optional[str] = Field(None, max_length=100)
    minimum_order: Optional[Decimal] = Field(None, ge=0)
    notes: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    contact_name: Optional[str] = Field(None, max_length=200)
    email: Optional[str] = None
    phone: Optional[str] = Field(None, max_length=50)
    mobile: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    tax_id: Optional[str] = Field(None, max_length=50)
    payment_terms: Optional[str] = Field(None, max_length=100)
    delivery_days: Optional[str] = Field(None, max_length=100)
    minimum_order: Optional[Decimal] = Field(None, ge=0)
    rating: Optional[int] = Field(None, ge=1, le=5)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class SupplierResponse(BaseModel):
    id: UUID
    name: str
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    tax_id: Optional[str] = None
    payment_terms: Optional[str] = None
    delivery_days: Optional[str] = None
    minimum_order: Optional[Decimal] = None
    rating: Optional[int] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
