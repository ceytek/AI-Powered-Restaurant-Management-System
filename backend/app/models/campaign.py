"""
Campaign / Promotion models.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Integer, Numeric,
    Index, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ========================== Campaigns ==========================

class Campaign(Base):
    """Promotions, discounts, and special offers."""
    __tablename__ = "campaigns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    short_description = Column(String(300), nullable=True)  # For AI agent

    # Discount configuration
    discount_type = Column(String(30), nullable=False)
    # percentage, fixed_amount, buy_x_get_y, free_item, bundle
    discount_value = Column(Numeric(10, 2), nullable=True)  # Percentage or fixed amount
    maximum_discount = Column(Numeric(10, 2), nullable=True)  # Cap for percentage discounts
    minimum_order_amount = Column(Numeric(10, 2), nullable=True)  # Min spend to qualify
    minimum_party_size = Column(Integer, nullable=True)  # Min guests to qualify

    # Promo code
    promo_code = Column(String(50), nullable=True)
    is_code_required = Column(Boolean, default=False, nullable=False)

    # Applicability
    applicable_days = Column(JSONB, nullable=True)  # [0,1,2,3,4,5,6] - days of week
    applicable_hours_start = Column(String(5), nullable=True)  # "17:00"
    applicable_hours_end = Column(String(5), nullable=True)  # "22:00"
    applicable_order_types = Column(JSONB, nullable=True)  # ["dine_in", "takeaway"]
    applicable_categories = Column(JSONB, nullable=True)  # Menu category IDs
    applicable_items = Column(JSONB, nullable=True)  # Specific menu item IDs
    excluded_items = Column(JSONB, nullable=True)  # Items excluded from campaign

    # Customer targeting
    target_customer_tiers = Column(JSONB, nullable=True)  # ["gold", "platinum"]
    target_new_customers = Column(Boolean, default=False, nullable=False)
    target_returning_customers = Column(Boolean, default=False, nullable=False)

    # Limits
    max_total_uses = Column(Integer, nullable=True)
    max_uses_per_customer = Column(Integer, nullable=True)
    current_total_uses = Column(Integer, default=0, nullable=False)

    # Schedule
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=True)  # NULL = no end date

    # Status
    is_active = Column(Boolean, default=True, nullable=False)
    is_featured = Column(Boolean, default=False, nullable=False)  # Show on website/app
    image_url = Column(String(500), nullable=True)
    terms_conditions = Column(Text, nullable=True)

    # Audit
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    usages = relationship("CampaignUsage", back_populates="campaign", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])

    __table_args__ = (
        Index("ix_campaigns_company", "company_id"),
        Index("ix_campaigns_active", "company_id", "is_active"),
        Index("ix_campaigns_dates", "company_id", "start_date", "end_date"),
        Index("ix_campaigns_promo_code", "company_id", "promo_code"),
    )


class CampaignUsage(Base):
    """Track each usage of a campaign/promo code."""
    __tablename__ = "campaign_usages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    discount_applied = Column(Numeric(10, 2), nullable=False)
    used_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    campaign = relationship("Campaign", back_populates="usages")
    order = relationship("Order")
    customer = relationship("Customer")

    __table_args__ = (
        Index("ix_campaign_usages_campaign", "campaign_id"),
        Index("ix_campaign_usages_customer", "customer_id"),
    )
