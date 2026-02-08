from fastapi import APIRouter
from app.api.v1.auth import router as auth_router

api_router = APIRouter(prefix="/api/v1")

# Include all routers
api_router.include_router(auth_router)
