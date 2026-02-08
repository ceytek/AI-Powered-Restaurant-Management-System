from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import get_current_user, CurrentUser
from app.schemas.auth import (
    LoginRequest, RegisterCompanyRequest, RefreshTokenRequest,
    LoginResponse, TokenResponse, UserResponse, MessageResponse
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=LoginResponse, status_code=201)
async def register_company(
    data: RegisterCompanyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a new company with admin user."""
    return await auth_service.register_company(db, data)


@router.post("/login", response_model=LoginResponse)
async def login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login with company code, email, and password."""
    return await auth_service.login(db, data)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token."""
    return await auth_service.refresh_access_token(db, data.refresh_token)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Logout - revoke all refresh tokens."""
    await auth_service.logout(db, current_user.id)
    return MessageResponse(message="Successfully logged out")


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: CurrentUser = Depends(get_current_user),
):
    """Get current user information."""
    return UserResponse(
        id=current_user.id,
        company_id=current_user.company_id,
        email=current_user.email,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        phone=current_user.user.phone,
        is_active=current_user.is_active,
        last_login_at=current_user.user.last_login_at,
        created_at=current_user.user.created_at,
        roles=current_user.roles,
        permissions=current_user.permissions,
    )
