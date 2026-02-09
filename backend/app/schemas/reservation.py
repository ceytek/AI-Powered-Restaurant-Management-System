"""Schemas for Reservation management."""
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime, date, time


# ==================== Reservations ====================

class ReservationCreate(BaseModel):
    customer_id: Optional[UUID] = None
    table_id: Optional[UUID] = None
    customer_name: str = Field(..., min_length=1, max_length=200)
    customer_phone: Optional[str] = Field(None, max_length=50)
    customer_email: Optional[str] = None
    party_size: int = Field(..., ge=1)
    date: date
    start_time: time
    end_time: Optional[time] = None
    duration_minutes: int = Field(90, ge=15)
    source: str = Field("manual", pattern=r"^(manual|phone|website|mobile_app|ai_agent|walk_in|third_party)$")
    source_details: Optional[str] = Field(None, max_length=200)
    special_requests: Optional[str] = None
    internal_notes: Optional[str] = None
    tags: Optional[List[str]] = None
    dietary_notes: Optional[str] = None


class ReservationUpdate(BaseModel):
    table_id: Optional[UUID] = None
    customer_name: Optional[str] = Field(None, min_length=1, max_length=200)
    customer_phone: Optional[str] = Field(None, max_length=50)
    customer_email: Optional[str] = None
    party_size: Optional[int] = Field(None, ge=1)
    date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    duration_minutes: Optional[int] = Field(None, ge=15)
    special_requests: Optional[str] = None
    internal_notes: Optional[str] = None
    tags: Optional[List[str]] = None
    dietary_notes: Optional[str] = None


class ReservationStatusUpdate(BaseModel):
    status: str = Field(
        ...,
        pattern=r"^(pending|confirmed|reminder_sent|checked_in|seated|completed|cancelled|no_show)$"
    )
    notes: Optional[str] = None
    cancellation_reason: Optional[str] = None


class ReservationResponse(BaseModel):
    id: UUID
    reservation_number: str
    customer_id: Optional[UUID] = None
    table_id: Optional[UUID] = None
    table_number: Optional[str] = None
    section_name: Optional[str] = None
    customer_name: str
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    party_size: int
    date: date
    start_time: time
    end_time: Optional[time] = None
    duration_minutes: int
    status: str
    source: str
    source_details: Optional[str] = None
    special_requests: Optional[str] = None
    internal_notes: Optional[str] = None
    tags: Optional[List[str]] = None
    dietary_notes: Optional[str] = None
    confirmation_sent: bool
    reminder_sent: bool
    confirmed_at: Optional[datetime] = None
    seated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReservationBriefResponse(BaseModel):
    """Minimal reservation for calendar/list views."""
    id: UUID
    reservation_number: str
    customer_name: str
    party_size: int
    date: date
    start_time: time
    status: str
    table_number: Optional[str] = None

    class Config:
        from_attributes = True


# ==================== Waitlist ====================

class WaitlistCreate(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=200)
    customer_phone: Optional[str] = Field(None, max_length=50)
    customer_email: Optional[str] = None
    party_size: int = Field(..., ge=1)
    estimated_wait_minutes: Optional[int] = Field(None, ge=0)
    preferred_section: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None


class WaitlistStatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(waiting|notified|seated|left|cancelled)$")
    table_id: Optional[UUID] = None


class WaitlistResponse(BaseModel):
    id: UUID
    customer_name: str
    customer_phone: Optional[str] = None
    party_size: int
    estimated_wait_minutes: Optional[int] = None
    preferred_section: Optional[str] = None
    status: str
    position: Optional[int] = None
    notes: Optional[str] = None
    queued_at: datetime
    notified_at: Optional[datetime] = None
    seated_at: Optional[datetime] = None
    table_id: Optional[UUID] = None

    class Config:
        from_attributes = True
