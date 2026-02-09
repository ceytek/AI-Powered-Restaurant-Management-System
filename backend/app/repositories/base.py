"""
Generic CRUD repository with multi-tenant support.
All queries automatically filter by company_id.
"""
from typing import TypeVar, Generic, Type, Optional, List, Any, Dict
from uuid import UUID
from sqlalchemy import select, func, and_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    """Base repository for CRUD operations with multi-tenancy."""

    def __init__(self, model: Type[ModelType], db: AsyncSession, company_id: UUID):
        self.model = model
        self.db = db
        self.company_id = company_id

    def _base_query(self):
        """Base query filtered by company_id."""
        if hasattr(self.model, "company_id"):
            return select(self.model).where(self.model.company_id == self.company_id)
        return select(self.model)

    async def get_by_id(self, id: UUID, options: list = None) -> Optional[ModelType]:
        """Get a single record by ID (within company scope)."""
        query = self._base_query().where(self.model.id == id)
        if options:
            for opt in options:
                query = query.options(opt)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_all(
        self,
        filters: Dict[str, Any] = None,
        search: str = None,
        search_fields: List[str] = None,
        order_by: str = None,
        order_dir: str = "asc",
        offset: int = 0,
        limit: int = 50,
        options: list = None,
        is_active_filter: Optional[bool] = None,
    ) -> tuple[List[ModelType], int]:
        """
        Get paginated list with optional filtering, searching, and ordering.
        Returns (items, total_count).
        """
        query = self._base_query()

        # Apply is_active filter if the model has it and filter is specified
        if is_active_filter is not None and hasattr(self.model, "is_active"):
            query = query.where(self.model.is_active == is_active_filter)

        # Apply additional filters
        if filters:
            for field, value in filters.items():
                if hasattr(self.model, field) and value is not None:
                    query = query.where(getattr(self.model, field) == value)

        # Apply search
        if search and search_fields:
            search_conditions = []
            for field_name in search_fields:
                if hasattr(self.model, field_name):
                    search_conditions.append(
                        getattr(self.model, field_name).ilike(f"%{search}%")
                    )
            if search_conditions:
                from sqlalchemy import or_
                query = query.where(or_(*search_conditions))

        # Count total (before pagination)
        count_query = select(func.count()).select_from(query.subquery())
        count_result = await self.db.execute(count_query)
        total = count_result.scalar()

        # Apply ordering
        if order_by and hasattr(self.model, order_by):
            order_col = getattr(self.model, order_by)
            query = query.order_by(desc(order_col) if order_dir == "desc" else asc(order_col))
        elif hasattr(self.model, "sort_order"):
            query = query.order_by(asc(self.model.sort_order), asc(self.model.created_at))
        elif hasattr(self.model, "created_at"):
            query = query.order_by(desc(self.model.created_at))

        # Apply eager loading
        if options:
            for opt in options:
                query = query.options(opt)

        # Apply pagination
        query = query.offset(offset).limit(limit)

        result = await self.db.execute(query)
        items = list(result.scalars().all())

        return items, total

    async def create(self, data: dict) -> ModelType:
        """Create a new record."""
        if hasattr(self.model, "company_id"):
            data["company_id"] = self.company_id
        instance = self.model(**data)
        self.db.add(instance)
        await self.db.flush()
        await self.db.refresh(instance)
        return instance

    async def update(self, id: UUID, data: dict) -> Optional[ModelType]:
        """Update an existing record."""
        instance = await self.get_by_id(id)
        if not instance:
            return None
        for key, value in data.items():
            if value is not None and hasattr(instance, key):
                setattr(instance, key, value)
        await self.db.flush()
        await self.db.refresh(instance)
        return instance

    async def delete(self, id: UUID) -> bool:
        """Hard delete a record."""
        instance = await self.get_by_id(id)
        if not instance:
            return False
        await self.db.delete(instance)
        await self.db.flush()
        return True

    async def soft_delete(self, id: UUID) -> Optional[ModelType]:
        """Soft delete by setting is_active = False."""
        instance = await self.get_by_id(id)
        if not instance or not hasattr(instance, "is_active"):
            return None
        instance.is_active = False
        await self.db.flush()
        await self.db.refresh(instance)
        return instance

    async def exists(self, **kwargs) -> bool:
        """Check if a record exists with given conditions."""
        query = self._base_query()
        for field, value in kwargs.items():
            if hasattr(self.model, field):
                query = query.where(getattr(self.model, field) == value)
        result = await self.db.execute(select(func.count()).select_from(query.subquery()))
        return result.scalar() > 0
