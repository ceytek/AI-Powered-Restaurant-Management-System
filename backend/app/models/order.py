"""
Order models: Orders, Items, Modifiers, Payments.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Integer, Numeric,
    UniqueConstraint, Index, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ========================== Orders ==========================

class Order(Base):
    """Restaurant orders (dine-in, takeaway, delivery)."""
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    order_number = Column(String(30), nullable=False)  # "ORD-20260208-001"
    table_id = Column(UUID(as_uuid=True), ForeignKey("tables.id", ondelete="SET NULL"), nullable=True)
    reservation_id = Column(UUID(as_uuid=True), ForeignKey("reservations.id", ondelete="SET NULL"), nullable=True)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)

    # Order type & status
    order_type = Column(String(20), default="dine_in", nullable=False)
    # dine_in, takeaway, delivery
    status = Column(String(20), default="pending", nullable=False)
    # pending, confirmed, preparing, ready, served, completed, cancelled
    priority = Column(String(10), default="normal", nullable=False)
    # low, normal, high, rush

    # Amounts
    subtotal = Column(Numeric(12, 2), default=0, nullable=False)
    tax_rate = Column(Numeric(5, 2), default=0, nullable=False)
    tax_amount = Column(Numeric(12, 2), default=0, nullable=False)
    discount_amount = Column(Numeric(12, 2), default=0, nullable=False)
    discount_reason = Column(String(200), nullable=True)
    service_charge = Column(Numeric(12, 2), default=0, nullable=False)
    tip_amount = Column(Numeric(10, 2), default=0, nullable=False)
    total_amount = Column(Numeric(12, 2), default=0, nullable=False)
    currency = Column(String(3), default="USD", nullable=False)

    # Payment
    payment_status = Column(String(20), default="pending", nullable=False)
    # pending, paid, partially_paid, refunded, void
    payment_method = Column(String(30), nullable=True)
    # cash, credit_card, debit_card, online, voucher, split
    payment_reference = Column(String(100), nullable=True)  # Transaction ID

    # Delivery info (if applicable)
    delivery_address = Column(Text, nullable=True)
    delivery_phone = Column(String(50), nullable=True)
    delivery_notes = Column(Text, nullable=True)
    estimated_delivery_time = Column(DateTime(timezone=True), nullable=True)

    # Guest info
    guest_count = Column(Integer, nullable=True)

    # Notes & tracking
    notes = Column(Text, nullable=True)
    kitchen_notes = Column(Text, nullable=True)
    cancel_reason = Column(Text, nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    preparation_started_at = Column(DateTime(timezone=True), nullable=True)
    ready_at = Column(DateTime(timezone=True), nullable=True)
    served_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)

    # Audit
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    table = relationship("Table")
    reservation = relationship("Reservation")
    customer = relationship("Customer")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])

    __table_args__ = (
        UniqueConstraint("company_id", "order_number", name="uq_order_number"),
        Index("ix_orders_company", "company_id"),
        Index("ix_orders_status", "company_id", "status"),
        Index("ix_orders_date", "company_id", "created_at"),
        Index("ix_orders_table", "table_id"),
        Index("ix_orders_customer", "customer_id"),
        Index("ix_orders_payment", "company_id", "payment_status"),
    )


# ========================== Order Items ==========================

class OrderItem(Base):
    """Individual items within an order."""
    __tablename__ = "order_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True)
    variant_id = Column(UUID(as_uuid=True), ForeignKey("menu_item_variants.id", ondelete="SET NULL"), nullable=True)

    # Denormalized for order history (menu items may change)
    item_name = Column(String(200), nullable=False)
    variant_name = Column(String(100), nullable=True)

    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Numeric(10, 2), nullable=False)
    modifier_total = Column(Numeric(10, 2), default=0, nullable=False)
    discount_amount = Column(Numeric(10, 2), default=0, nullable=False)
    total_price = Column(Numeric(12, 2), nullable=False)

    status = Column(String(20), default="pending", nullable=False)
    # pending, sent_to_kitchen, preparing, ready, served, cancelled
    special_instructions = Column(Text, nullable=True)  # "No onions", "Extra sauce"
    kitchen_notes = Column(Text, nullable=True)
    is_complimentary = Column(Boolean, default=False, nullable=False)  # Free item

    # Timing
    sent_to_kitchen_at = Column(DateTime(timezone=True), nullable=True)
    preparation_started_at = Column(DateTime(timezone=True), nullable=True)
    ready_at = Column(DateTime(timezone=True), nullable=True)
    served_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)

    sort_order = Column(Integer, default=0, nullable=False)  # Course ordering
    course = Column(String(20), nullable=True)  # "appetizer", "main", "dessert", "drink"

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    order = relationship("Order", back_populates="items")
    menu_item = relationship("MenuItem")
    variant = relationship("MenuItemVariant")
    modifiers = relationship("OrderItemModifier", back_populates="order_item", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_order_items_order", "order_id"),
        Index("ix_order_items_status", "order_id", "status"),
        CheckConstraint("quantity > 0", name="ck_order_item_quantity_positive"),
    )


# ========================== Order Item Modifiers ==========================

class OrderItemModifier(Base):
    """Modifications/additions to an order item (extra cheese, no onion, etc.)."""
    __tablename__ = "order_item_modifiers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_item_id = Column(UUID(as_uuid=True), ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)  # "Extra Cheese", "No Onion"
    modifier_type = Column(String(20), default="add", nullable=False)  # add, remove, substitute
    price_modifier = Column(Numeric(10, 2), default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    order_item = relationship("OrderItem", back_populates="modifiers")

    __table_args__ = (
        Index("ix_order_item_modifiers_item", "order_item_id"),
    )
