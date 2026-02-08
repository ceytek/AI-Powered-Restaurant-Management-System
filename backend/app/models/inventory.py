"""
Inventory models: Categories, Items, Stock Movements, Suppliers, Purchase Orders.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Integer, Numeric, Date,
    UniqueConstraint, Index, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ========================== Inventory Categories ==========================

class InventoryCategory(Base):
    """Categories for inventory items (Produce, Meat, Beverages, Cleaning, etc.)."""
    __tablename__ = "inventory_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("inventory_categories.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    parent = relationship("InventoryCategory", remote_side=[id], backref="children")
    items = relationship("InventoryItem", back_populates="category")

    __table_args__ = (
        UniqueConstraint("company_id", "parent_id", "name", name="uq_inventory_category_name"),
        Index("ix_inventory_categories_company", "company_id"),
    )


# ========================== Unit of Measure ==========================

class UnitOfMeasure(Base):
    """Units of measurement for inventory items."""
    __tablename__ = "units_of_measure"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True)  # NULL = global
    name = Column(String(50), nullable=False)  # "Kilogram", "Liter", "Piece"
    abbreviation = Column(String(10), nullable=False)  # "kg", "L", "pcs"
    unit_type = Column(String(20), nullable=False)  # weight, volume, count, length
    base_unit = Column(String(10), nullable=True)  # Base conversion unit
    conversion_factor = Column(Numeric(15, 6), default=1, nullable=False)  # Factor to base unit
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (
        Index("ix_units_of_measure_company", "company_id"),
    )


# ========================== Inventory Items ==========================

class InventoryItem(Base):
    """Inventory/stock items with tracking information."""
    __tablename__ = "inventory_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    category_id = Column(UUID(as_uuid=True), ForeignKey("inventory_categories.id", ondelete="SET NULL"), nullable=True)
    unit_id = Column(UUID(as_uuid=True), ForeignKey("units_of_measure.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    sku = Column(String(50), nullable=True)  # Stock Keeping Unit
    barcode = Column(String(100), nullable=True)
    current_stock = Column(Numeric(12, 3), default=0, nullable=False)
    minimum_stock = Column(Numeric(12, 3), default=0, nullable=False)  # Low stock alert threshold
    maximum_stock = Column(Numeric(12, 3), nullable=True)  # Storage capacity
    reorder_point = Column(Numeric(12, 3), nullable=True)  # When to reorder
    reorder_quantity = Column(Numeric(12, 3), nullable=True)  # How much to reorder
    unit_cost = Column(Numeric(10, 2), default=0, nullable=False)  # Average cost per unit
    storage_location = Column(String(100), nullable=True)  # "Walk-in cooler", "Pantry A"
    storage_temperature = Column(String(50), nullable=True)  # "2-4°C", "Room temp"
    expiry_tracking = Column(Boolean, default=False, nullable=False)  # Track expiry dates
    image_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    category = relationship("InventoryCategory", back_populates="items")
    unit = relationship("UnitOfMeasure")
    stock_movements = relationship("StockMovement", back_populates="inventory_item", cascade="all, delete-orphan")
    supplier_items = relationship("SupplierItem", back_populates="inventory_item", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])

    __table_args__ = (
        UniqueConstraint("company_id", "sku", name="uq_inventory_sku_per_company"),
        Index("ix_inventory_items_company", "company_id"),
        Index("ix_inventory_items_category", "category_id"),
        Index("ix_inventory_items_low_stock", "company_id", "current_stock", "minimum_stock"),
    )


# ========================== Stock Movements ==========================

class StockMovement(Base):
    """Track all stock changes: purchases, usage, waste, adjustments."""
    __tablename__ = "stock_movements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False)
    movement_type = Column(String(30), nullable=False)  # purchase, usage, waste, adjustment, return, transfer, initial
    quantity = Column(Numeric(12, 3), nullable=False)  # Positive = in, Negative = out
    unit_cost = Column(Numeric(10, 2), nullable=True)  # Cost at time of movement
    total_cost = Column(Numeric(12, 2), nullable=True)
    stock_before = Column(Numeric(12, 3), nullable=True)  # Stock level before movement
    stock_after = Column(Numeric(12, 3), nullable=True)  # Stock level after movement
    reference_type = Column(String(50), nullable=True)  # "purchase_order", "order", "manual"
    reference_id = Column(UUID(as_uuid=True), nullable=True)  # Link to PO, order, etc.
    batch_number = Column(String(50), nullable=True)  # Batch tracking
    expiry_date = Column(Date, nullable=True)  # For items with expiry tracking
    notes = Column(Text, nullable=True)
    performed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    performed_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    inventory_item = relationship("InventoryItem", back_populates="stock_movements")
    performer = relationship("User", foreign_keys=[performed_by])

    __table_args__ = (
        Index("ix_stock_movements_company", "company_id"),
        Index("ix_stock_movements_item", "inventory_item_id"),
        Index("ix_stock_movements_date", "company_id", "performed_at"),
        Index("ix_stock_movements_type", "company_id", "movement_type"),
        Index("ix_stock_movements_reference", "reference_type", "reference_id"),
    )


# ========================== Suppliers ==========================

class Supplier(Base):
    """Supplier/vendor information."""
    __tablename__ = "suppliers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    contact_name = Column(String(200), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    mobile = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    country = Column(String(100), nullable=True)
    tax_id = Column(String(50), nullable=True)
    payment_terms = Column(String(100), nullable=True)  # "Net 30", "COD"
    delivery_days = Column(String(100), nullable=True)  # "Mon, Wed, Fri"
    minimum_order = Column(Numeric(10, 2), nullable=True)
    rating = Column(Integer, nullable=True)  # 1-5
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    supplier_items = relationship("SupplierItem", back_populates="supplier", cascade="all, delete-orphan")
    purchase_orders = relationship("PurchaseOrder", back_populates="supplier")
    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        Index("ix_suppliers_company", "company_id"),
    )


class SupplierItem(Base):
    """Which supplier provides which inventory items (with pricing)."""
    __tablename__ = "supplier_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False)
    supplier_sku = Column(String(50), nullable=True)  # Supplier's own SKU
    unit_cost = Column(Numeric(10, 2), nullable=True)
    minimum_quantity = Column(Numeric(12, 3), nullable=True)
    lead_time_days = Column(Integer, nullable=True)  # Delivery time
    is_preferred = Column(Boolean, default=False, nullable=False)  # Preferred supplier for this item
    last_ordered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    supplier = relationship("Supplier", back_populates="supplier_items")
    inventory_item = relationship("InventoryItem", back_populates="supplier_items")

    __table_args__ = (
        UniqueConstraint("supplier_id", "inventory_item_id", name="uq_supplier_inventory_item"),
        Index("ix_supplier_items_supplier", "supplier_id"),
        Index("ix_supplier_items_item", "inventory_item_id"),
    )


# ========================== Purchase Orders ==========================

class PurchaseOrder(Base):
    """Purchase orders to suppliers."""
    __tablename__ = "purchase_orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    supplier_id = Column(UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False)
    order_number = Column(String(50), nullable=False)
    status = Column(String(30), default="draft", nullable=False)
    # draft, pending_approval, approved, ordered, partially_received, received, cancelled
    order_date = Column(DateTime(timezone=True), nullable=True)
    expected_delivery = Column(DateTime(timezone=True), nullable=True)
    actual_delivery = Column(DateTime(timezone=True), nullable=True)
    subtotal = Column(Numeric(12, 2), default=0, nullable=False)
    tax_amount = Column(Numeric(12, 2), default=0, nullable=False)
    shipping_cost = Column(Numeric(10, 2), default=0, nullable=False)
    total_amount = Column(Numeric(12, 2), default=0, nullable=False)
    notes = Column(Text, nullable=True)
    internal_notes = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    received_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    received_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    supplier = relationship("Supplier", back_populates="purchase_orders")
    items = relationship("PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])
    approver = relationship("User", foreign_keys=[approved_by])
    receiver = relationship("User", foreign_keys=[received_by])

    __table_args__ = (
        UniqueConstraint("company_id", "order_number", name="uq_po_number_per_company"),
        Index("ix_purchase_orders_company", "company_id"),
        Index("ix_purchase_orders_supplier", "supplier_id"),
        Index("ix_purchase_orders_status", "company_id", "status"),
        Index("ix_purchase_orders_date", "company_id", "order_date"),
    )


class PurchaseOrderItem(Base):
    """Line items in a purchase order."""
    __tablename__ = "purchase_order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purchase_order_id = Column(UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id", ondelete="RESTRICT"), nullable=False)
    quantity_ordered = Column(Numeric(12, 3), nullable=False)
    quantity_received = Column(Numeric(12, 3), default=0, nullable=False)
    unit_cost = Column(Numeric(10, 2), nullable=False)
    total_cost = Column(Numeric(12, 2), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    purchase_order = relationship("PurchaseOrder", back_populates="items")
    inventory_item = relationship("InventoryItem")

    __table_args__ = (
        Index("ix_po_items_order", "purchase_order_id"),
        CheckConstraint("quantity_ordered > 0", name="ck_po_quantity_positive"),
    )
