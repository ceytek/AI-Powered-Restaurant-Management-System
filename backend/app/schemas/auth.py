from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from uuid import UUID
from datetime import datetime


# ==================== Request Schemas ====================

class LoginRequest(BaseModel):
    company_code: str = Field(..., min_length=1, max_length=50, description="Company code")
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., min_length=6, description="User password")


class RegisterCompanyRequest(BaseModel):
    company_code: str = Field(..., min_length=3, max_length=50, description="Unique company code")
    company_name: str = Field(..., min_length=2, max_length=255, description="Company name")
    admin_email: EmailStr = Field(..., description="Admin user email")
    admin_password: str = Field(..., min_length=6, description="Admin user password")
    admin_first_name: str = Field(..., min_length=1, max_length=100, description="Admin first name")
    admin_last_name: str = Field(..., min_length=1, max_length=100, description="Admin last name")
    company_phone: Optional[str] = Field(None, max_length=50, description="Company phone")
    company_address: Optional[str] = Field(None, description="Company address")


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., description="Refresh token")


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=6)


# ==================== Response Schemas ====================

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class PermissionResponse(BaseModel):
    id: UUID
    resource: str
    action: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class RoleResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    is_system: bool

    class Config:
        from_attributes = True


class UserResponse(BaseModel):
    id: UUID
    company_id: UUID
    email: str
    first_name: str
    last_name: str
    phone: Optional[str] = None
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime
    roles: List[str] = []
    permissions: List[str] = []

    class Config:
        from_attributes = True


class CompanyResponse(BaseModel):
    id: UUID
    code: str
    name: str
    logo_url: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    user: UserResponse
    company: CompanyResponse
    tokens: TokenResponse


class MessageResponse(BaseModel):
    message: str
    success: bool = True
