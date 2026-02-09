"""
Audit logging service - tracks all entity changes.
"""
from uuid import UUID
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Request

from app.models.audit import AuditLog


class AuditService:
    """Service to create audit log entries for all entity changes."""

    def __init__(self, db: AsyncSession, company_id: UUID, user_id: Optional[UUID] = None):
        self.db = db
        self.company_id = company_id
        self.user_id = user_id

    async def log(
        self,
        entity_type: str,
        entity_id: UUID,
        action: str,
        old_values: Optional[Dict[str, Any]] = None,
        new_values: Optional[Dict[str, Any]] = None,
        entity_name: Optional[str] = None,
        action_detail: Optional[str] = None,
        changed_fields: Optional[list] = None,
        source: str = "web",
        request: Optional[Request] = None,
    ):
        """Create an audit log entry."""
        ip_address = None
        user_agent = None
        request_method = None
        request_path = None

        if request:
            ip_address = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent", "")[:500]
            request_method = request.method
            request_path = str(request.url.path)[:500]

        # Make values JSON-safe
        if old_values:
            old_values = {k: _make_json_safe(v) for k, v in old_values.items()}
        if new_values:
            new_values = {k: _make_json_safe(v) for k, v in new_values.items()}

        # Auto-detect changed fields if not provided
        if changed_fields is None and old_values and new_values:
            changed_fields = [
                k for k in new_values
                if k in old_values and old_values[k] != new_values[k]
            ]

        audit_entry = AuditLog(
            company_id=self.company_id,
            user_id=self.user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            action=action,
            action_detail=action_detail,
            old_values=old_values,
            new_values=new_values,
            changed_fields=changed_fields,
            ip_address=ip_address,
            user_agent=user_agent,
            request_method=request_method,
            request_path=request_path,
            source=source,
        )
        self.db.add(audit_entry)
        await self.db.flush()
        return audit_entry

    async def log_create(
        self, entity_type: str, entity_id: UUID, new_values: dict,
        entity_name: str = None, request: Request = None,
    ):
        return await self.log(
            entity_type=entity_type, entity_id=entity_id, action="create",
            new_values=new_values, entity_name=entity_name, request=request,
        )

    async def log_update(
        self, entity_type: str, entity_id: UUID,
        old_values: dict, new_values: dict,
        entity_name: str = None, request: Request = None,
    ):
        return await self.log(
            entity_type=entity_type, entity_id=entity_id, action="update",
            old_values=old_values, new_values=new_values,
            entity_name=entity_name, request=request,
        )

    async def log_delete(
        self, entity_type: str, entity_id: UUID,
        old_values: dict = None, entity_name: str = None, request: Request = None,
    ):
        return await self.log(
            entity_type=entity_type, entity_id=entity_id, action="delete",
            old_values=old_values, entity_name=entity_name, request=request,
        )

    async def log_status_change(
        self, entity_type: str, entity_id: UUID,
        old_status: str, new_status: str,
        entity_name: str = None, request: Request = None,
    ):
        return await self.log(
            entity_type=entity_type, entity_id=entity_id, action="status_change",
            old_values={"status": old_status}, new_values={"status": new_status},
            action_detail=f"Status changed from '{old_status}' to '{new_status}'",
            entity_name=entity_name, request=request,
        )


def serialize_for_audit(obj, fields: list) -> dict:
    """Serialize an ORM object to a dict for audit logging."""
    result = {}
    for field in fields:
        value = getattr(obj, field, None)
        result[field] = _make_json_safe(value)
    return result


def _make_json_safe(value):
    """Convert a value to a JSON-serializable type."""
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "hex"):  # UUID
        return str(value)
    if hasattr(value, "isoformat"):  # datetime, date, time
        return value.isoformat()
    if hasattr(value, "as_tuple"):  # Decimal
        return float(value)
    if isinstance(value, (list, tuple)):
        return [_make_json_safe(v) for v in value]
    if isinstance(value, dict):
        return {k: _make_json_safe(v) for k, v in value.items()}
    return str(value)


def make_audit_safe(data: dict) -> dict:
    """Make an entire dict JSON-serializable for audit logging."""
    return {k: _make_json_safe(v) for k, v in data.items()}
