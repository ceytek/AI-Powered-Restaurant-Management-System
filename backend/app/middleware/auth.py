from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from uuid import UUID

from app.core.database import get_db
from app.core.security import decode_token
from app.models.core import User, UserRole, Role, RolePermission, Permission

security = HTTPBearer()


class CurrentUser:
    """Represents the currently authenticated user with their context."""

    def __init__(self, user: User, company_id: UUID, roles: List[str], permissions: List[str]):
        self.id = user.id
        self.email = user.email
        self.first_name = user.first_name
        self.last_name = user.last_name
        self.company_id = company_id
        self.roles = roles
        self.permissions = permissions
        self.is_active = user.is_active
        self.user = user

    def has_permission(self, resource: str, action: str) -> bool:
        """Check if user has a specific permission."""
        permission_key = f"{resource}.{action}"
        return permission_key in self.permissions or "admin.all" in self.permissions

    def has_role(self, role_name: str) -> bool:
        """Check if user has a specific role."""
        return role_name in self.roles


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> CurrentUser:
    """Dependency to get the current authenticated user."""
    token = credentials.credentials
    payload = decode_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    company_id = payload.get("company_id")

    if not user_id or not company_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Fetch user with roles and permissions
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.user_roles)
            .selectinload(UserRole.role)
            .selectinload(Role.role_permissions)
            .selectinload(RolePermission.permission)
        )
        .where(User.id == user_id, User.company_id == company_id)
    )
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Extract roles and permissions
    roles = []
    permissions = set()
    for user_role in user.user_roles:
        roles.append(user_role.role.name)
        for role_perm in user_role.role.role_permissions:
            perm = role_perm.permission
            permissions.add(f"{perm.resource}.{perm.action}")

    return CurrentUser(
        user=user,
        company_id=UUID(company_id) if isinstance(company_id, str) else company_id,
        roles=roles,
        permissions=list(permissions),
    )


def require_permissions(*required_permissions: str):
    """Dependency factory for requiring specific permissions."""

    async def permission_checker(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        # Admin has all permissions
        if "admin.all" in current_user.permissions:
            return current_user

        for perm in required_permissions:
            if perm not in current_user.permissions:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied. Required: {perm}",
                )
        return current_user

    return permission_checker


def require_roles(*required_roles: str):
    """Dependency factory for requiring specific roles."""

    async def role_checker(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if not any(role in current_user.roles for role in required_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role required: {', '.join(required_roles)}",
            )
        return current_user

    return role_checker
