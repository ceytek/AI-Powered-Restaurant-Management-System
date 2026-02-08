from datetime import datetime, timedelta, timezone
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.models.core import (
    Company, User, Role, Permission, RolePermission, UserRole, RefreshToken
)
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token
)
from app.core.config import settings
from app.schemas.auth import (
    LoginRequest, RegisterCompanyRequest, LoginResponse,
    TokenResponse, UserResponse, CompanyResponse
)


# Default permissions to create for every company
DEFAULT_PERMISSIONS = [
    ("dashboard", "read", "View dashboard"),
    ("tables", "read", "View tables"),
    ("tables", "write", "Create/edit tables"),
    ("tables", "delete", "Delete tables"),
    ("menu", "read", "View menu"),
    ("menu", "write", "Create/edit menu items"),
    ("menu", "delete", "Delete menu items"),
    ("reservations", "read", "View reservations"),
    ("reservations", "write", "Create/edit reservations"),
    ("reservations", "delete", "Cancel reservations"),
    ("inventory", "read", "View inventory"),
    ("inventory", "write", "Manage inventory"),
    ("inventory", "delete", "Delete inventory items"),
    ("staff", "read", "View staff"),
    ("staff", "write", "Manage staff"),
    ("staff", "delete", "Remove staff"),
    ("customers", "read", "View customers"),
    ("customers", "write", "Manage customers"),
    ("customers", "delete", "Delete customers"),
    ("settings", "read", "View settings"),
    ("settings", "write", "Manage settings"),
    ("analytics", "read", "View analytics"),
    ("admin", "all", "Full admin access"),
]

# Default roles and their permissions
DEFAULT_ROLES = {
    "owner": {
        "description": "Restaurant owner with full access",
        "permissions": ["admin.all"],
    },
    "manager": {
        "description": "Restaurant manager",
        "permissions": [
            "dashboard.read", "tables.read", "tables.write", "tables.delete",
            "menu.read", "menu.write", "menu.delete",
            "reservations.read", "reservations.write", "reservations.delete",
            "inventory.read", "inventory.write",
            "staff.read", "staff.write",
            "customers.read", "customers.write",
            "settings.read", "analytics.read",
        ],
    },
    "host": {
        "description": "Front desk / Host",
        "permissions": [
            "dashboard.read", "tables.read", "tables.write",
            "reservations.read", "reservations.write", "reservations.delete",
            "customers.read", "customers.write",
            "menu.read",
        ],
    },
    "waiter": {
        "description": "Waiter / Server",
        "permissions": [
            "dashboard.read", "tables.read",
            "reservations.read", "menu.read",
            "customers.read",
        ],
    },
    "chef": {
        "description": "Kitchen chef",
        "permissions": [
            "dashboard.read", "menu.read", "menu.write",
            "inventory.read", "inventory.write",
        ],
    },
}


async def register_company(db: AsyncSession, data: RegisterCompanyRequest) -> LoginResponse:
    """Register a new company with admin user and default roles/permissions."""

    # Check if company code already exists
    existing = await db.execute(
        select(Company).where(Company.code == data.company_code.upper())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Company code already exists",
        )

    # Check if email already exists for any company (optional - or per company)
    existing_user = await db.execute(
        select(User).where(User.email == data.admin_email)
    )
    if existing_user.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # 1. Create company
    company = Company(
        code=data.company_code.upper(),
        name=data.company_name,
        phone=data.company_phone,
        address=data.company_address,
        email=data.admin_email,
    )
    db.add(company)
    await db.flush()

    # 2. Create all permissions (global - shared across companies)
    # Check if permissions already exist
    existing_perms = await db.execute(select(Permission))
    existing_perms_list = existing_perms.scalars().all()

    perm_map = {}
    if not existing_perms_list:
        for resource, action, description in DEFAULT_PERMISSIONS:
            perm = Permission(resource=resource, action=action, description=description)
            db.add(perm)
            await db.flush()
            perm_map[f"{resource}.{action}"] = perm.id
    else:
        for p in existing_perms_list:
            perm_map[f"{p.resource}.{p.action}"] = p.id

    # 3. Create default roles for this company
    role_map = {}
    for role_name, role_config in DEFAULT_ROLES.items():
        role = Role(
            company_id=company.id,
            name=role_name,
            description=role_config["description"],
            is_system=True,
        )
        db.add(role)
        await db.flush()
        role_map[role_name] = role.id

        # Assign permissions to role
        for perm_key in role_config["permissions"]:
            if perm_key in perm_map:
                role_perm = RolePermission(
                    role_id=role.id,
                    permission_id=perm_map[perm_key],
                )
                db.add(role_perm)

    # 4. Create admin user
    admin_user = User(
        company_id=company.id,
        email=data.admin_email,
        password_hash=hash_password(data.admin_password),
        first_name=data.admin_first_name,
        last_name=data.admin_last_name,
    )
    db.add(admin_user)
    await db.flush()

    # 5. Assign owner role to admin
    user_role = UserRole(
        user_id=admin_user.id,
        role_id=role_map["owner"],
    )
    db.add(user_role)
    await db.flush()

    # 6. Generate tokens
    token_data = {
        "sub": str(admin_user.id),
        "company_id": str(company.id),
        "email": admin_user.email,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Save refresh token
    rt = RefreshToken(
        user_id=admin_user.id,
        token=refresh_token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(rt)

    return LoginResponse(
        user=UserResponse(
            id=admin_user.id,
            company_id=company.id,
            email=admin_user.email,
            first_name=admin_user.first_name,
            last_name=admin_user.last_name,
            phone=admin_user.phone,
            is_active=admin_user.is_active,
            last_login_at=admin_user.last_login_at,
            created_at=admin_user.created_at,
            roles=["owner"],
            permissions=["admin.all"],
        ),
        company=CompanyResponse(
            id=company.id,
            code=company.code,
            name=company.name,
            logo_url=company.logo_url,
            address=company.address,
            phone=company.phone,
            email=company.email,
            is_active=company.is_active,
            created_at=company.created_at,
        ),
        tokens=TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
        ),
    )


async def login(db: AsyncSession, data: LoginRequest) -> LoginResponse:
    """Authenticate user with company code, email, and password."""

    # Find company
    result = await db.execute(
        select(Company).where(
            and_(Company.code == data.company_code.upper(), Company.is_active == True)
        )
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid company code, email, or password",
        )

    # Find user in this company
    result = await db.execute(
        select(User)
        .options(
            selectinload(User.user_roles)
            .selectinload(UserRole.role)
            .selectinload(Role.role_permissions)
            .selectinload(RolePermission.permission)
        )
        .where(and_(User.email == data.email, User.company_id == company.id, User.is_active == True))
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid company code, email, or password",
        )

    # Extract roles and permissions
    roles = []
    permissions = set()
    for user_role in user.user_roles:
        roles.append(user_role.role.name)
        for role_perm in user_role.role.role_permissions:
            perm = role_perm.permission
            permissions.add(f"{perm.resource}.{perm.action}")

    # Update last login
    user.last_login_at = datetime.now(timezone.utc)

    # Generate tokens
    token_data = {
        "sub": str(user.id),
        "company_id": str(company.id),
        "email": user.email,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Revoke old refresh tokens & save new one
    old_tokens = await db.execute(
        select(RefreshToken).where(
            and_(RefreshToken.user_id == user.id, RefreshToken.is_revoked == False)
        )
    )
    for old_token in old_tokens.scalars().all():
        old_token.is_revoked = True

    rt = RefreshToken(
        user_id=user.id,
        token=refresh_token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(rt)

    return LoginResponse(
        user=UserResponse(
            id=user.id,
            company_id=company.id,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            phone=user.phone,
            is_active=user.is_active,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
            roles=roles,
            permissions=list(permissions),
        ),
        company=CompanyResponse(
            id=company.id,
            code=company.code,
            name=company.name,
            logo_url=company.logo_url,
            address=company.address,
            phone=company.phone,
            email=company.email,
            is_active=company.is_active,
            created_at=company.created_at,
        ),
        tokens=TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
        ),
    )


async def refresh_access_token(db: AsyncSession, refresh_token_str: str) -> TokenResponse:
    """Refresh access token using a valid refresh token."""

    # Decode refresh token
    payload = decode_token(refresh_token_str)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    # Check if token exists and is not revoked
    result = await db.execute(
        select(RefreshToken).where(
            and_(
                RefreshToken.token == refresh_token_str,
                RefreshToken.is_revoked == False,
            )
        )
    )
    stored_token = result.scalar_one_or_none()

    if not stored_token or stored_token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired or revoked",
        )

    # Revoke old refresh token
    stored_token.is_revoked = True

    # Generate new tokens
    token_data = {
        "sub": payload["sub"],
        "company_id": payload["company_id"],
        "email": payload["email"],
    }
    new_access_token = create_access_token(token_data)
    new_refresh_token = create_refresh_token(token_data)

    # Save new refresh token
    new_rt = RefreshToken(
        user_id=UUID(payload["sub"]),
        token=new_refresh_token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(new_rt)

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
    )


async def logout(db: AsyncSession, user_id: UUID) -> None:
    """Revoke all refresh tokens for a user (logout)."""
    result = await db.execute(
        select(RefreshToken).where(
            and_(RefreshToken.user_id == user_id, RefreshToken.is_revoked == False)
        )
    )
    for token in result.scalars().all():
        token.is_revoked = True
