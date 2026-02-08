"""
Staff models: Positions, Profiles, Shifts, Schedules, Attendance.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Integer, Numeric, Date, Time,
    UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ========================== Staff Positions ==========================

class StaffPosition(Base):
    """Job positions/titles (Head Chef, Waiter, Host, Bartender, etc.)."""
    __tablename__ = "staff_positions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    department = Column(String(50), nullable=False)  # kitchen, service, management, bar, cleaning
    description = Column(Text, nullable=True)
    base_hourly_rate = Column(Numeric(8, 2), nullable=True)
    color = Column(String(7), nullable=True)  # For schedule display
    sort_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    profiles = relationship("StaffProfile", back_populates="position")

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_staff_position_name"),
        Index("ix_staff_positions_company", "company_id"),
    )


# ========================== Staff Profiles ==========================

class StaffProfile(Base):
    """Extended staff information linked to User account."""
    __tablename__ = "staff_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    position_id = Column(UUID(as_uuid=True), ForeignKey("staff_positions.id", ondelete="SET NULL"), nullable=True)
    employee_number = Column(String(20), nullable=True)
    hire_date = Column(Date, nullable=True)
    termination_date = Column(Date, nullable=True)
    birth_date = Column(Date, nullable=True)
    national_id = Column(String(50), nullable=True)  # ID/SSN number
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    emergency_contact_name = Column(String(200), nullable=True)
    emergency_contact_phone = Column(String(50), nullable=True)
    emergency_contact_relation = Column(String(50), nullable=True)
    hourly_rate = Column(Numeric(8, 2), nullable=True)  # Override position rate
    contract_type = Column(String(30), default="full_time", nullable=False)
    # full_time, part_time, seasonal, intern, contractor
    max_weekly_hours = Column(Integer, nullable=True)
    bank_name = Column(String(100), nullable=True)
    bank_account = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    profile_image_url = Column(String(500), nullable=True)
    employment_status = Column(String(20), default="active", nullable=False)
    # active, on_leave, suspended, terminated
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    company = relationship("Company")
    position = relationship("StaffPosition", back_populates="profiles")
    schedules = relationship("StaffSchedule", back_populates="staff", cascade="all, delete-orphan")
    attendance_records = relationship("StaffAttendance", back_populates="staff", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        UniqueConstraint("company_id", "employee_number", name="uq_employee_number_per_company"),
        Index("ix_staff_profiles_company", "company_id"),
        Index("ix_staff_profiles_position", "position_id"),
        Index("ix_staff_profiles_status", "company_id", "employment_status"),
    )


# ========================== Shifts ==========================

class Shift(Base):
    """Shift template definitions (Morning, Afternoon, Evening, Night)."""
    __tablename__ = "shifts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(50), nullable=False)  # "Morning", "Afternoon", "Evening"
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    break_duration = Column(Integer, default=0, nullable=False)  # Minutes
    color = Column(String(7), nullable=True)  # For calendar display
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    schedules = relationship("StaffSchedule", back_populates="shift")

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_shift_name_per_company"),
        Index("ix_shifts_company", "company_id"),
    )


# ========================== Staff Schedule ==========================

class StaffSchedule(Base):
    """Staff work schedule entries."""
    __tablename__ = "staff_schedules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    staff_id = Column(UUID(as_uuid=True), ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False)
    shift_id = Column(UUID(as_uuid=True), ForeignKey("shifts.id", ondelete="SET NULL"), nullable=True)
    date = Column(Date, nullable=False)
    custom_start_time = Column(Time, nullable=True)  # Override shift time
    custom_end_time = Column(Time, nullable=True)
    status = Column(String(20), default="scheduled", nullable=False)
    # scheduled, confirmed, completed, absent, sick, vacation, day_off, swap_requested
    actual_start = Column(DateTime(timezone=True), nullable=True)
    actual_end = Column(DateTime(timezone=True), nullable=True)
    section_id = Column(UUID(as_uuid=True), ForeignKey("table_sections.id", ondelete="SET NULL"), nullable=True)
    # Which section this staff is assigned to
    notes = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    staff = relationship("StaffProfile", back_populates="schedules")
    shift = relationship("Shift", back_populates="schedules")
    section = relationship("TableSection")
    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        UniqueConstraint("staff_id", "date", "shift_id", name="uq_staff_schedule"),
        Index("ix_staff_schedules_company", "company_id"),
        Index("ix_staff_schedules_staff", "staff_id"),
        Index("ix_staff_schedules_date", "company_id", "date"),
        Index("ix_staff_schedules_status", "company_id", "status"),
    )


# ========================== Staff Attendance ==========================

class StaffAttendance(Base):
    """Clock in/out records for attendance tracking."""
    __tablename__ = "staff_attendance"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    staff_id = Column(UUID(as_uuid=True), ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False)
    schedule_id = Column(UUID(as_uuid=True), ForeignKey("staff_schedules.id", ondelete="SET NULL"), nullable=True)
    clock_in = Column(DateTime(timezone=True), nullable=False)
    clock_out = Column(DateTime(timezone=True), nullable=True)
    break_start = Column(DateTime(timezone=True), nullable=True)
    break_end = Column(DateTime(timezone=True), nullable=True)
    total_break_minutes = Column(Integer, default=0, nullable=False)
    total_work_minutes = Column(Integer, nullable=True)  # Calculated on clock out
    overtime_minutes = Column(Integer, default=0, nullable=False)
    status = Column(String(20), default="clocked_in", nullable=False)
    # clocked_in, on_break, clocked_out, auto_closed
    notes = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)  # Where they clocked in from
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Relationships
    company = relationship("Company")
    staff = relationship("StaffProfile", back_populates="attendance_records")
    schedule = relationship("StaffSchedule")

    __table_args__ = (
        Index("ix_staff_attendance_company", "company_id"),
        Index("ix_staff_attendance_staff", "staff_id"),
        Index("ix_staff_attendance_date", "company_id", "clock_in"),
    )
