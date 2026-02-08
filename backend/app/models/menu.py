"""
Menu models: Categories, Items, Allergens, Variants, Ingredients, Price History.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Integer, Numeric,
    UniqueConstraint, Index, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ========================== Menu Categories ==========================

class MenuCategory(Base):
    """Menu categories and subcategories (e.g., Appetizers, Main Course, Drinks > Cocktails)."""
    __tablename__ = "menu_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("menu_categories.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    parent = relationship("MenuCategory", remote_side=[id], backref="children")
    items = relationship("MenuItem", back_populates="category", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])

    __table_args__ = (
        UniqueConstraint("company_id", "parent_id", "name", name="uq_menu_category_name"),
        Index("ix_menu_categories_company", "company_id"),
    )


# ========================== Allergens ==========================

class Allergen(Base):
    """Standard allergen definitions (can be global or per-company)."""
    __tablename__ = "allergens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True)  # NULL = global
    name = Column(String(100), nullable=False)  # "Gluten", "Dairy", "Tree Nuts", etc.
    code = Column(String(20), nullable=True)  # Standard code e.g., "GLU", "DAI"
    icon = Column(String(100), nullable=True)  # Icon name or URL
    description = Column(Text, nullable=True)
    severity_level = Column(Integer, default=1, nullable=False)  # 1=low, 2=medium, 3=high
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    menu_item_allergens = relationship("MenuItemAllergen", back_populates="allergen", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_allergens_company", "company_id"),
    )


# ========================== Menu Items ==========================

class MenuItem(Base):
    """Individual menu items with detailed information."""
    __tablename__ = "menu_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    category_id = Column(UUID(as_uuid=True), ForeignKey("menu_categories.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    short_description = Column(String(300), nullable=True)  # For AI agent quick summary
    price = Column(Numeric(10, 2), nullable=False)
    cost_price = Column(Numeric(10, 2), nullable=True)  # For profit margin calculation
    currency = Column(String(3), default="USD", nullable=False)
    image_url = Column(String(500), nullable=True)
    thumbnail_url = Column(String(500), nullable=True)

    # Dietary info
    calories = Column(Integer, nullable=True)
    preparation_time = Column(Integer, nullable=True)  # In minutes
    is_vegetarian = Column(Boolean, default=False, nullable=False)
    is_vegan = Column(Boolean, default=False, nullable=False)
    is_gluten_free = Column(Boolean, default=False, nullable=False)
    is_halal = Column(Boolean, default=False, nullable=False)
    is_kosher = Column(Boolean, default=False, nullable=False)
    is_spicy = Column(Boolean, default=False, nullable=False)
    spice_level = Column(Integer, default=0, nullable=False)  # 0-5

    # Status & visibility
    is_available = Column(Boolean, default=True, nullable=False)
    is_featured = Column(Boolean, default=False, nullable=False)  # Chef's recommendation
    is_new = Column(Boolean, default=False, nullable=False)
    is_seasonal = Column(Boolean, default=False, nullable=False)
    available_from = Column(DateTime(timezone=True), nullable=True)  # Seasonal availability
    available_until = Column(DateTime(timezone=True), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)

    # AI / Vector search
    embedding = Column(Vector(1536), nullable=True)  # OpenAI embedding for semantic search
    search_keywords = Column(Text, nullable=True)  # Additional keywords for search

    # Audit
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    category = relationship("MenuCategory", back_populates="items")
    allergens = relationship("MenuItemAllergen", back_populates="menu_item", cascade="all, delete-orphan")
    variants = relationship("MenuItemVariant", back_populates="menu_item", cascade="all, delete-orphan")
    ingredients = relationship("MenuItemIngredient", back_populates="menu_item", cascade="all, delete-orphan")
    tags = relationship("MenuItemTag", back_populates="menu_item", cascade="all, delete-orphan")
    price_history = relationship("PriceHistory", back_populates="menu_item", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])

    __table_args__ = (
        Index("ix_menu_items_company", "company_id"),
        Index("ix_menu_items_category", "category_id"),
        Index("ix_menu_items_available", "company_id", "is_available"),
        Index("ix_menu_items_featured", "company_id", "is_featured"),
        CheckConstraint("price >= 0", name="ck_menu_item_price_positive"),
        CheckConstraint("spice_level >= 0 AND spice_level <= 5", name="ck_spice_level_range"),
    )


# ========================== Menu Item Allergens ==========================

class MenuItemAllergen(Base):
    """Many-to-many: Menu items and their allergens."""
    __tablename__ = "menu_item_allergens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False)
    allergen_id = Column(UUID(as_uuid=True), ForeignKey("allergens.id", ondelete="CASCADE"), nullable=False)
    notes = Column(String(200), nullable=True)  # "Contains traces of..."

    # Relationships
    menu_item = relationship("MenuItem", back_populates="allergens")
    allergen = relationship("Allergen", back_populates="menu_item_allergens")

    __table_args__ = (
        UniqueConstraint("menu_item_id", "allergen_id", name="uq_menu_item_allergen"),
    )


# ========================== Menu Item Variants ==========================

class MenuItemVariant(Base):
    """Size/portion variants (Small, Medium, Large, etc.)."""
    __tablename__ = "menu_item_variants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)  # "Small", "Regular", "Large", "Family"
    price_modifier = Column(Numeric(10, 2), default=0, nullable=False)  # +3.00, -1.50
    is_default = Column(Boolean, default=False, nullable=False)
    is_available = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    menu_item = relationship("MenuItem", back_populates="variants")

    __table_args__ = (
        Index("ix_menu_item_variants_item", "menu_item_id"),
    )


# ========================== Menu Item Ingredients ==========================

class MenuItemIngredient(Base):
    """Ingredients of a menu item (optionally linked to inventory)."""
    __tablename__ = "menu_item_ingredients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False)
    inventory_item_id = Column(UUID(as_uuid=True), ForeignKey("inventory_items.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(100), nullable=False)  # Ingredient name (even if linked to inventory)
    quantity = Column(Numeric(10, 3), nullable=True)  # Amount needed per serving
    unit = Column(String(20), nullable=True)  # "g", "ml", "pcs"
    is_optional = Column(Boolean, default=False, nullable=False)  # Can be removed
    is_visible = Column(Boolean, default=True, nullable=False)  # Show to customer
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    menu_item = relationship("MenuItem", back_populates="ingredients")

    __table_args__ = (
        Index("ix_menu_item_ingredients_item", "menu_item_id"),
    )


# ========================== Menu Item Tags ==========================

class MenuItemTag(Base):
    """Tags for menu items (popular, new, chef's choice, seasonal)."""
    __tablename__ = "menu_item_tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False)
    tag = Column(String(50), nullable=False)  # "popular", "new", "chef_choice", "seasonal"
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    menu_item = relationship("MenuItem", back_populates="tags")

    __table_args__ = (
        UniqueConstraint("menu_item_id", "tag", name="uq_menu_item_tag"),
        Index("ix_menu_item_tags_item", "menu_item_id"),
    )


# ========================== Price History ==========================

class PriceHistory(Base):
    """Track all menu item price changes for auditing."""
    __tablename__ = "price_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False)
    old_price = Column(Numeric(10, 2), nullable=False)
    new_price = Column(Numeric(10, 2), nullable=False)
    old_cost_price = Column(Numeric(10, 2), nullable=True)
    new_cost_price = Column(Numeric(10, 2), nullable=True)
    reason = Column(Text, nullable=True)
    changed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    changed_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    menu_item = relationship("MenuItem", back_populates="price_history")
    changer = relationship("User", foreign_keys=[changed_by])

    __table_args__ = (
        Index("ix_price_history_item", "menu_item_id"),
        Index("ix_price_history_date", "menu_item_id", "changed_at"),
    )
