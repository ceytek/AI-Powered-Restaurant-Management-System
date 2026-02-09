"""Schemas for Staff management."""
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime, date, time
from decimal import Decimal


# ==================== Staff Positions ====================

class StaffPositionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    department: str = Field(..., pattern=r"^(kitchen|service|management|bar|cleaning|other)$")
    description: Optional[str] = None
    base_hourly_rate: Optional[Decimal] = Field(None, ge=0)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: int = 0


class StaffPositionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    department: Optional[str] = Field(None, pattern=r"^(kitchen|service|management|bar|cleaning|other)$")
    description: Optional[str] = None
    base_hourly_rate: Optional[Decimal] = Field(None, ge=0)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class StaffPositionResponse(BaseModel):
    id: UUID
    name: str
    department: str
    description: Optional[str] = None
    base_hourly_rate: Optional[Decimal] = None
    color: Optional[str] = None
    sort_order: int
    is_active: bool
    staff_count: Optional[int] = 0
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Staff Profiles ====================

class StaffProfileCreate(BaseModel):
    user_id: UUID
    position_id: Optional[UUID] = None
    employee_number: Optional[str] = Field(None, max_length=20)
    hire_date: Optional[date] = None
    birth_date: Optional[date] = None
    national_id: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    emergency_contact_name: Optional[str] = Field(None, max_length=200)
    emergency_contact_phone: Optional[str] = Field(None, max_length=50)
    emergency_contact_relation: Optional[str] = Field(None, max_length=50)
    hourly_rate: Optional[Decimal] = Field(None, ge=0)
    contract_type: str = Field("full_time", pattern=r"^(full_time|part_time|seasonal|intern|contractor)$")
    max_weekly_hours: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None


class StaffProfileUpdate(BaseModel):
    position_id: Optional[UUID] = None
    employee_number: Optional[str] = Field(None, max_length=20)
    hire_date: Optional[date] = None
    termination_date: Optional[date] = None
    birth_date: Optional[date] = None
    national_id: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    emergency_contact_name: Optional[str] = Field(None, max_length=200)
    emergency_contact_phone: Optional[str] = Field(None, max_length=50)
    emergency_contact_relation: Optional[str] = Field(None, max_length=50)
    hourly_rate: Optional[Decimal] = Field(None, ge=0)
    contract_type: Optional[str] = Field(None, pattern=r"^(full_time|part_time|seasonal|intern|contractor)$")
    max_weekly_hours: Optional[int] = Field(None, ge=0)
    bank_name: Optional[str] = Field(None, max_length=100)
    bank_account: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = None
    profile_image_url: Optional[str] = None
    employment_status: Optional[str] = Field(None, pattern=r"^(active|on_leave|suspended|terminated)$")


class StaffProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    position_id: Optional[UUID] = None
    position_name: Optional[str] = None
    department: Optional[str] = None
    employee_number: Optional[str] = None
    hire_date: Optional[date] = None
    birth_date: Optional[date] = None
    address: Optional[str] = None
    city: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    hourly_rate: Optional[Decimal] = None
    contract_type: str
    max_weekly_hours: Optional[int] = None
    profile_image_url: Optional[str] = None
    employment_status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ==================== Shifts ====================

class ShiftCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    start_time: time
    end_time: time
    break_duration: int = Field(0, ge=0)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class ShiftUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    break_duration: Optional[int] = Field(None, ge=0)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    is_active: Optional[bool] = None


class ShiftResponse(BaseModel):
    id: UUID
    name: str
    start_time: time
    end_time: time
    break_duration: int
    color: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


# ==================== Staff Schedules ====================

class StaffScheduleCreate(BaseModel):
    staff_id: UUID
    shift_id: Optional[UUID] = None
    date: date
    custom_start_time: Optional[time] = None
    custom_end_time: Optional[time] = None
    section_id: Optional[UUID] = None
    notes: Optional[str] = None


class StaffScheduleUpdate(BaseModel):
    shift_id: Optional[UUID] = None
    custom_start_time: Optional[time] = None
    custom_end_time: Optional[time] = None
    status: Optional[str] = Field(
        None, pattern=r"^(scheduled|confirmed|completed|absent|sick|vacation|day_off|swap_requested)$"
    )
    section_id: Optional[UUID] = None
    notes: Optional[str] = None


class StaffScheduleResponse(BaseModel):
    id: UUID
    staff_id: UUID
    staff_name: Optional[str] = None
    shift_id: Optional[UUID] = None
    shift_name: Optional[str] = None
    date: date
    custom_start_time: Optional[time] = None
    custom_end_time: Optional[time] = None
    status: str
    section_id: Optional[UUID] = None
    section_name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
