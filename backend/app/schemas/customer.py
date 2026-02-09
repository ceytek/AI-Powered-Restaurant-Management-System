"""Schemas for Customer management."""
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime, date
from decimal import Decimal


# ==================== Customers ====================

class CustomerCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = None
    phone: Optional[str] = Field(None, max_length=50)
    secondary_phone: Optional[str] = Field(None, max_length=50)
    date_of_birth: Optional[date] = None
    anniversary_date: Optional[date] = None
    gender: Optional[str] = Field(None, pattern=r"^(male|female|other|prefer_not_to_say)$")
    preferred_language: str = Field("en", max_length=10)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    dietary_preferences: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    seating_preference: Optional[str] = Field(None, max_length=50)
    vip_status: bool = False
    tags: Optional[List[str]] = None
    source: str = Field("manual", pattern=r"^(manual|phone|website|ai_agent|import|walk_in)$")
    marketing_consent: bool = False
    sms_consent: bool = False
    email_consent: bool = False
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = None
    phone: Optional[str] = Field(None, max_length=50)
    secondary_phone: Optional[str] = Field(None, max_length=50)
    date_of_birth: Optional[date] = None
    anniversary_date: Optional[date] = None
    gender: Optional[str] = Field(None, pattern=r"^(male|female|other|prefer_not_to_say)$")
    preferred_language: Optional[str] = Field(None, max_length=10)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    dietary_preferences: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    seating_preference: Optional[str] = Field(None, max_length=50)
    preferred_table_id: Optional[UUID] = None
    vip_status: Optional[bool] = None
    customer_tier: Optional[str] = Field(None, pattern=r"^(regular|silver|gold|platinum|vip)$")
    tags: Optional[List[str]] = None
    marketing_consent: Optional[bool] = None
    sms_consent: Optional[bool] = None
    email_consent: Optional[bool] = None
    notes: Optional[str] = None
    is_blacklisted: Optional[bool] = None
    blacklist_reason: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerResponse(BaseModel):
    id: UUID
    first_name: str
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    secondary_phone: Optional[str] = None
    date_of_birth: Optional[date] = None
    anniversary_date: Optional[date] = None
    gender: Optional[str] = None
    preferred_language: str
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    dietary_preferences: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    seating_preference: Optional[str] = None
    vip_status: bool
    loyalty_points: int
    customer_tier: str
    tags: Optional[List[str]] = None
    total_visits: int
    total_spent: Decimal
    average_spend: Decimal
    total_no_shows: int
    total_cancellations: int
    last_visit_date: Optional[datetime] = None
    first_visit_date: Optional[datetime] = None
    source: str
    marketing_consent: bool
    is_blacklisted: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CustomerBriefResponse(BaseModel):
    """Minimal customer info for dropdowns and search."""
    id: UUID
    first_name: str
    last_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    vip_status: bool
    total_visits: int

    class Config:
        from_attributes = True


# ==================== Customer Notes ====================

class CustomerNoteCreate(BaseModel):
    note_type: str = Field("general", pattern=r"^(general|preference|complaint|compliment|allergy|interaction)$")
    note: str = Field(..., min_length=1)
    is_pinned: bool = False
    is_private: bool = False


class CustomerNoteResponse(BaseModel):
    id: UUID
    customer_id: UUID
    note_type: str
    note: str
    is_pinned: bool
    is_private: bool
    created_by_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
