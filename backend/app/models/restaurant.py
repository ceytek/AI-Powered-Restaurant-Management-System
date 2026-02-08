"""
Restaurant physical space models: Sections, Tables, Combinations, Operating Hours.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Integer, Float,
    Date, Time, UniqueConstraint, Index, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ========================== Table Sections ==========================

class TableSection(Base):
    """Restaurant sections/zones (e.g., Main Hall, Terrace, VIP Room, Bar Area)."""
    __tablename__ = "table_sections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    floor = Column(Integer, default=1, nullable=False)
    color = Column(String(7), nullable=True)  # Hex color for floor plan
    sort_order = Column(Integer, default=0, nullable=False)
    is_smoking = Column(Boolean, default=False, nullable=False)
    is_outdoor = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    tables = relationship("Table", back_populates="section", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_section_name_per_company"),
        Index("ix_table_sections_company", "company_id"),
    )


# ========================== Tables ==========================

class Table(Base):
    """Individual restaurant tables."""
    __tablename__ = "tables"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    section_id = Column(UUID(as_uuid=True), ForeignKey("table_sections.id", ondelete="SET NULL"), nullable=True)
    table_number = Column(String(20), nullable=False)  # "T1", "VIP-1", "B3"
    name = Column(String(100), nullable=True)  # Optional display name "Window Table"
    capacity_min = Column(Integer, default=1, nullable=False)
    capacity_max = Column(Integer, nullable=False)
    shape = Column(String(20), default="rectangle", nullable=False)  # round, square, rectangle, oval
    status = Column(String(20), default="available", nullable=False)  # available, occupied, reserved, maintenance, cleaning
    position_x = Column(Float, nullable=True)  # For visual floor plan editor
    position_y = Column(Float, nullable=True)
    width = Column(Float, nullable=True)  # For floor plan rendering
    height = Column(Float, nullable=True)
    rotation = Column(Float, default=0, nullable=True)  # Degrees
    qr_code = Column(String(255), nullable=True, unique=True)  # QR code identifier
    is_reservable = Column(Boolean, default=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    section = relationship("TableSection", back_populates="tables")
    combination_items = relationship("TableCombinationItem", back_populates="table", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])

    __table_args__ = (
        UniqueConstraint("company_id", "table_number", name="uq_table_number_per_company"),
        Index("ix_tables_company", "company_id"),
        Index("ix_tables_status", "company_id", "status"),
        Index("ix_tables_section", "section_id"),
        CheckConstraint("capacity_min > 0", name="ck_table_min_capacity"),
        CheckConstraint("capacity_max >= capacity_min", name="ck_table_max_gte_min"),
    )


# ========================== Table Combinations ==========================

class TableCombination(Base):
    """When tables are merged/combined for larger parties."""
    __tablename__ = "table_combinations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=True)  # "Combo A", "Party Setup 1"
    combined_capacity = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    items = relationship("TableCombinationItem", back_populates="combination", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        Index("ix_table_combinations_company", "company_id"),
    )


class TableCombinationItem(Base):
    """Individual tables that make up a combination."""
    __tablename__ = "table_combination_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    combination_id = Column(UUID(as_uuid=True), ForeignKey("table_combinations.id", ondelete="CASCADE"), nullable=False)
    table_id = Column(UUID(as_uuid=True), ForeignKey("tables.id", ondelete="CASCADE"), nullable=False)

    # Relationships
    combination = relationship("TableCombination", back_populates="items")
    table = relationship("Table", back_populates="combination_items")

    __table_args__ = (
        UniqueConstraint("combination_id", "table_id", name="uq_combination_table"),
    )


# ========================== Operating Hours ==========================

class OperatingHours(Base):
    """Regular weekly operating hours for the restaurant."""
    __tablename__ = "operating_hours"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0=Monday, 6=Sunday
    open_time = Column(Time, nullable=True)
    close_time = Column(Time, nullable=True)
    is_closed = Column(Boolean, default=False, nullable=False)
    last_reservation_time = Column(Time, nullable=True)  # Last reservation acceptance time
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")

    __table_args__ = (
        UniqueConstraint("company_id", "day_of_week", name="uq_operating_hours_day"),
        Index("ix_operating_hours_company", "company_id"),
        CheckConstraint("day_of_week >= 0 AND day_of_week <= 6", name="ck_valid_day_of_week"),
    )


class SpecialHours(Base):
    """Special operating hours for holidays, events, etc."""
    __tablename__ = "special_hours"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    name = Column(String(100), nullable=False)  # "Christmas", "Valentine's Day"
    open_time = Column(Time, nullable=True)
    close_time = Column(Time, nullable=True)
    is_closed = Column(Boolean, default=False, nullable=False)
    notes = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        UniqueConstraint("company_id", "date", name="uq_special_hours_date"),
        Index("ix_special_hours_company", "company_id"),
        Index("ix_special_hours_date", "company_id", "date"),
    )
