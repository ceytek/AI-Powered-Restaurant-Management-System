"""Common schemas used across all modules."""
from pydantic import BaseModel, Field
from typing import TypeVar, Generic, List, Optional
from uuid import UUID
from datetime import datetime


DataT = TypeVar("DataT")


class PaginationParams(BaseModel):
    """Query parameters for pagination."""
    page: int = Field(1, ge=1, description="Page number")
    page_size: int = Field(20, ge=1, le=100, description="Items per page")
    search: Optional[str] = Field(None, max_length=200, description="Search query")
    order_by: Optional[str] = Field(None, description="Field to order by")
    order_dir: Optional[str] = Field("asc", pattern="^(asc|desc)$", description="Order direction")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class PaginatedResponse(BaseModel, Generic[DataT]):
    """Generic paginated response."""
    items: List[DataT]
    total: int
    page: int
    page_size: int
    total_pages: int


class MessageResponse(BaseModel):
    """Simple message response."""
    message: str
    success: bool = True


class IDResponse(BaseModel):
    """Response with just an ID."""
    id: UUID
    message: str = "Operation successful"
