"""
Audit and Notification models: Audit logs, System notifications.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ========================== Audit Log ==========================

class AuditLog(Base):
    """
    Comprehensive audit trail for all entity changes.
    Tracks who did what, when, and stores before/after values.
    """
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # What was changed
    entity_type = Column(String(50), nullable=False)
    # "table", "menu_item", "reservation", "order", "inventory_item", "staff", "customer", etc.
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    entity_name = Column(String(200), nullable=True)  # Human-readable: "Table T5", "Margherita Pizza"

    # What action
    action = Column(String(30), nullable=False)
    # create, update, delete, status_change, login, logout, export, import, bulk_update
    action_detail = Column(String(200), nullable=True)  # "Changed status from available to occupied"

    # Before/After values (JSONB for flexible storage)
    old_values = Column(JSONB, nullable=True)  # {"status": "available", "capacity": 4}
    new_values = Column(JSONB, nullable=True)  # {"status": "occupied", "capacity": 6}
    changed_fields = Column(JSONB, nullable=True)  # ["status", "capacity"] - quick reference

    # Context
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    request_method = Column(String(10), nullable=True)  # GET, POST, PUT, DELETE
    request_path = Column(String(500), nullable=True)  # /api/v1/tables/123
    source = Column(String(20), nullable=True)  # "web", "api", "ai_agent", "system", "import"

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    user = relationship("User")

    __table_args__ = (
        Index("ix_audit_logs_company", "company_id"),
        Index("ix_audit_logs_entity", "company_id", "entity_type", "entity_id"),
        Index("ix_audit_logs_user", "user_id"),
        Index("ix_audit_logs_action", "company_id", "action"),
        Index("ix_audit_logs_date", "company_id", "created_at"),
        Index("ix_audit_logs_entity_type", "company_id", "entity_type"),
    )


# ========================== Notifications ==========================

class Notification(Base):
    """System notifications for users (low stock alerts, reservation reminders, etc.)."""
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    # NULL = broadcast to all users in company

    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(30), nullable=False)
    # info, warning, error, success, alert
    category = Column(String(30), nullable=False)
    # reservation, order, inventory, staff, customer, system, ai_agent
    priority = Column(String(10), default="normal", nullable=False)
    # low, normal, high, urgent

    # Link to related entity
    reference_type = Column(String(50), nullable=True)  # "reservation", "order", etc.
    reference_id = Column(UUID(as_uuid=True), nullable=True)
    action_url = Column(String(500), nullable=True)  # Deep link: "/reservations/abc-123"

    # Status
    is_read = Column(Boolean, default=False, nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    is_dismissed = Column(Boolean, default=False, nullable=False)
    dismissed_at = Column(DateTime(timezone=True), nullable=True)

    # Delivery
    is_email_sent = Column(Boolean, default=False, nullable=False)
    email_sent_at = Column(DateTime(timezone=True), nullable=True)
    is_push_sent = Column(Boolean, default=False, nullable=False)
    push_sent_at = Column(DateTime(timezone=True), nullable=True)

    expires_at = Column(DateTime(timezone=True), nullable=True)  # Auto-dismiss after
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    user = relationship("User")

    __table_args__ = (
        Index("ix_notifications_company", "company_id"),
        Index("ix_notifications_user", "user_id"),
        Index("ix_notifications_unread", "user_id", "is_read"),
        Index("ix_notifications_category", "company_id", "category"),
        Index("ix_notifications_date", "company_id", "created_at"),
    )
