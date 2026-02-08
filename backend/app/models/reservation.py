"""
Reservation models: Reservations, Status History, Waitlist.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Integer, Date, Time,
    UniqueConstraint, Index, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ========================== Reservations ==========================

class Reservation(Base):
    """Restaurant reservations with full tracking."""
    __tablename__ = "reservations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    reservation_number = Column(String(20), nullable=False)  # Human-readable ref: "RES-20260208-001"
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    table_id = Column(UUID(as_uuid=True), ForeignKey("tables.id", ondelete="SET NULL"), nullable=True)

    # Customer info (denormalized for quick access, even without customer profile)
    customer_name = Column(String(200), nullable=False)
    customer_phone = Column(String(50), nullable=True)
    customer_email = Column(String(255), nullable=True)

    # Reservation details
    party_size = Column(Integer, nullable=False)
    date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=True)  # Estimated end time
    duration_minutes = Column(Integer, default=90, nullable=False)  # Default dining duration

    # Status
    status = Column(String(20), default="pending", nullable=False)
    # pending, confirmed, reminder_sent, checked_in, seated, completed, cancelled, no_show

    # Source tracking
    source = Column(String(20), default="manual", nullable=False)
    # manual, phone, website, mobile_app, ai_agent, walk_in, third_party
    source_details = Column(String(200), nullable=True)  # "OpenTable", "Google", etc.

    # Additional info
    special_requests = Column(Text, nullable=True)  # "Birthday cake", "High chair needed"
    internal_notes = Column(Text, nullable=True)  # Staff-only notes
    tags = Column(JSONB, nullable=True)  # ["birthday", "vip", "anniversary"]
    dietary_notes = Column(Text, nullable=True)  # "Nut allergy at table"

    # Pre-order
    pre_order_items = Column(JSONB, nullable=True)  # Pre-selected menu items

    # Confirmation tracking
    confirmation_sent = Column(Boolean, default=False, nullable=False)
    confirmation_sent_at = Column(DateTime(timezone=True), nullable=True)
    reminder_sent = Column(Boolean, default=False, nullable=False)
    reminder_sent_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    checked_in_at = Column(DateTime(timezone=True), nullable=True)
    seated_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancellation_reason = Column(Text, nullable=True)
    no_show_at = Column(DateTime(timezone=True), nullable=True)

    # Audit
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    customer = relationship("Customer")
    table = relationship("Table")
    status_history = relationship("ReservationStatusHistory", back_populates="reservation", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])

    __table_args__ = (
        UniqueConstraint("company_id", "reservation_number", name="uq_reservation_number"),
        Index("ix_reservations_company", "company_id"),
        Index("ix_reservations_date", "company_id", "date"),
        Index("ix_reservations_status", "company_id", "status"),
        Index("ix_reservations_customer", "customer_id"),
        Index("ix_reservations_table_date", "table_id", "date"),
        Index("ix_reservations_phone", "company_id", "customer_phone"),
        CheckConstraint("party_size > 0", name="ck_party_size_positive"),
    )


# ========================== Reservation Status History ==========================

class ReservationStatusHistory(Base):
    """Track all status changes of a reservation."""
    __tablename__ = "reservation_status_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reservation_id = Column(UUID(as_uuid=True), ForeignKey("reservations.id", ondelete="CASCADE"), nullable=False)
    old_status = Column(String(20), nullable=True)  # NULL for creation
    new_status = Column(String(20), nullable=False)
    changed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    change_source = Column(String(20), nullable=True)  # "staff", "customer", "ai_agent", "system"
    notes = Column(Text, nullable=True)
    changed_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    reservation = relationship("Reservation", back_populates="status_history")
    changer = relationship("User", foreign_keys=[changed_by])

    __table_args__ = (
        Index("ix_reservation_history_reservation", "reservation_id"),
        Index("ix_reservation_history_date", "reservation_id", "changed_at"),
    )


# ========================== Waitlist ==========================

class Waitlist(Base):
    """Waitlist entries when no tables are available."""
    __tablename__ = "waitlist"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    customer_name = Column(String(200), nullable=False)
    customer_phone = Column(String(50), nullable=True)
    customer_email = Column(String(255), nullable=True)
    party_size = Column(Integer, nullable=False)
    estimated_wait_minutes = Column(Integer, nullable=True)
    preferred_section = Column(String(100), nullable=True)
    status = Column(String(20), default="waiting", nullable=False)
    # waiting, notified, seated, left, cancelled
    position = Column(Integer, nullable=True)  # Queue position
    notes = Column(Text, nullable=True)
    queued_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    notified_at = Column(DateTime(timezone=True), nullable=True)
    seated_at = Column(DateTime(timezone=True), nullable=True)
    table_id = Column(UUID(as_uuid=True), ForeignKey("tables.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    table = relationship("Table")
    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        Index("ix_waitlist_company", "company_id"),
        Index("ix_waitlist_status", "company_id", "status"),
        Index("ix_waitlist_date", "company_id", "queued_at"),
        CheckConstraint("party_size > 0", name="ck_waitlist_party_size_positive"),
    )
