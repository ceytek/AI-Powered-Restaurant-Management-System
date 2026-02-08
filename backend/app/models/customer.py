"""
Customer models: Profiles, Notes, Preferences, Visit tracking.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Integer, Numeric, Date,
    UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ========================== Customers ==========================

class Customer(Base):
    """Customer profiles with preferences and visit history summary."""
    __tablename__ = "customers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    secondary_phone = Column(String(50), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    anniversary_date = Column(Date, nullable=True)
    gender = Column(String(10), nullable=True)  # male, female, other, prefer_not_to_say
    preferred_language = Column(String(10), default="en", nullable=False)
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    country = Column(String(100), nullable=True)

    # Preferences
    dietary_preferences = Column(JSONB, nullable=True)  # ["vegetarian", "no_pork"]
    allergies = Column(JSONB, nullable=True)  # ["nuts", "shellfish"]
    favorite_items = Column(JSONB, nullable=True)  # List of menu item IDs
    seating_preference = Column(String(50), nullable=True)  # "window", "outdoor", "quiet_corner"
    preferred_table_id = Column(UUID(as_uuid=True), ForeignKey("tables.id", ondelete="SET NULL"), nullable=True)

    # Classification
    vip_status = Column(Boolean, default=False, nullable=False)
    loyalty_points = Column(Integer, default=0, nullable=False)
    customer_tier = Column(String(20), default="regular", nullable=False)
    # regular, silver, gold, platinum, vip
    tags = Column(JSONB, nullable=True)  # ["regular", "wine_lover", "corporate"]

    # Visit statistics (denormalized for quick dashboard display)
    total_visits = Column(Integer, default=0, nullable=False)
    total_spent = Column(Numeric(12, 2), default=0, nullable=False)
    average_spend = Column(Numeric(10, 2), default=0, nullable=False)
    total_no_shows = Column(Integer, default=0, nullable=False)
    total_cancellations = Column(Integer, default=0, nullable=False)
    last_visit_date = Column(DateTime(timezone=True), nullable=True)
    first_visit_date = Column(DateTime(timezone=True), nullable=True)

    # Source
    source = Column(String(30), default="manual", nullable=False)
    # manual, phone, website, ai_agent, import, walk_in
    source_details = Column(String(200), nullable=True)

    # Communication preferences
    marketing_consent = Column(Boolean, default=False, nullable=False)
    sms_consent = Column(Boolean, default=False, nullable=False)
    email_consent = Column(Boolean, default=False, nullable=False)

    # General
    notes = Column(Text, nullable=True)
    is_blacklisted = Column(Boolean, default=False, nullable=False)
    blacklist_reason = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    customer_notes = relationship("CustomerNote", back_populates="customer", cascade="all, delete-orphan")
    preferred_table = relationship("Table")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])

    __table_args__ = (
        Index("ix_customers_company", "company_id"),
        Index("ix_customers_phone", "company_id", "phone"),
        Index("ix_customers_email", "company_id", "email"),
        Index("ix_customers_name", "company_id", "last_name", "first_name"),
        Index("ix_customers_vip", "company_id", "vip_status"),
        Index("ix_customers_tier", "company_id", "customer_tier"),
    )


# ========================== Customer Notes ==========================

class CustomerNote(Base):
    """Staff notes about customers (interactions, preferences, complaints)."""
    __tablename__ = "customer_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False)
    note_type = Column(String(20), default="general", nullable=False)
    # general, preference, complaint, compliment, allergy, interaction
    note = Column(Text, nullable=False)
    is_pinned = Column(Boolean, default=False, nullable=False)  # Important note
    is_private = Column(Boolean, default=False, nullable=False)  # Only visible to managers
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    customer = relationship("Customer", back_populates="customer_notes")
    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        Index("ix_customer_notes_customer", "customer_id"),
        Index("ix_customer_notes_type", "customer_id", "note_type"),
    )
