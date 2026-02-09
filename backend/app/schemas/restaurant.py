"""Schemas for Table Sections and Tables management."""
from pydantic import BaseModel, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime, time, date


# ==================== Table Sections ====================

class TableSectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    floor: int = Field(1, ge=-5, le=100)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: int = 0
    is_smoking: bool = False
    is_outdoor: bool = False


class TableSectionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    floor: Optional[int] = Field(None, ge=-5, le=100)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: Optional[int] = None
    is_smoking: Optional[bool] = None
    is_outdoor: Optional[bool] = None
    is_active: Optional[bool] = None


class TableSectionResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    floor: int
    color: Optional[str] = None
    sort_order: int
    is_smoking: bool
    is_outdoor: bool
    is_active: bool
    table_count: Optional[int] = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== Tables ====================

class TableCreate(BaseModel):
    section_id: Optional[UUID] = None
    table_number: str = Field(..., min_length=1, max_length=20)
    name: Optional[str] = Field(None, max_length=100)
    capacity_min: int = Field(1, ge=1)
    capacity_max: int = Field(..., ge=1)
    shape: str = Field("rectangle", pattern=r"^(round|square|rectangle|oval)$")
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    rotation: Optional[float] = 0
    is_reservable: bool = True


class TableUpdate(BaseModel):
    section_id: Optional[UUID] = None
    table_number: Optional[str] = Field(None, min_length=1, max_length=20)
    name: Optional[str] = Field(None, max_length=100)
    capacity_min: Optional[int] = Field(None, ge=1)
    capacity_max: Optional[int] = Field(None, ge=1)
    shape: Optional[str] = Field(None, pattern=r"^(round|square|rectangle|oval)$")
    status: Optional[str] = Field(None, pattern=r"^(available|occupied|reserved|maintenance|cleaning)$")
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    rotation: Optional[float] = None
    is_reservable: Optional[bool] = None
    is_active: Optional[bool] = None


class TableStatusUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(available|occupied|reserved|maintenance|cleaning)$")


class TableResponse(BaseModel):
    id: UUID
    section_id: Optional[UUID] = None
    section_name: Optional[str] = None
    table_number: str
    name: Optional[str] = None
    capacity_min: int
    capacity_max: int
    shape: str
    status: str
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    rotation: Optional[float] = None
    qr_code: Optional[str] = None
    is_reservable: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TableBriefResponse(BaseModel):
    """Minimal table info for dropdowns and lists."""
    id: UUID
    table_number: str
    name: Optional[str] = None
    capacity_max: int
    status: str
    section_name: Optional[str] = None

    class Config:
        from_attributes = True


# ==================== Operating Hours ====================

class OperatingHoursCreate(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    open_time: Optional[time] = None
    close_time: Optional[time] = None
    is_closed: bool = False
    last_reservation_time: Optional[time] = None


class OperatingHoursUpdate(BaseModel):
    open_time: Optional[time] = None
    close_time: Optional[time] = None
    is_closed: Optional[bool] = None
    last_reservation_time: Optional[time] = None


class OperatingHoursResponse(BaseModel):
    id: UUID
    day_of_week: int
    open_time: Optional[time] = None
    close_time: Optional[time] = None
    is_closed: bool
    last_reservation_time: Optional[time] = None

    class Config:
        from_attributes = True


class OperatingHoursBulkUpdate(BaseModel):
    """Update all 7 days at once."""
    hours: List[OperatingHoursCreate]


# ==================== Special Hours ====================

class SpecialHoursCreate(BaseModel):
    date: date
    name: str = Field(..., min_length=1, max_length=100)
    open_time: Optional[time] = None
    close_time: Optional[time] = None
    is_closed: bool = False
    notes: Optional[str] = None


class SpecialHoursResponse(BaseModel):
    id: UUID
    date: date
    name: str
    open_time: Optional[time] = None
    close_time: Optional[time] = None
    is_closed: bool
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
