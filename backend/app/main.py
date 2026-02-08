from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.api.v1.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Startup
    print(f"🚀 {settings.APP_NAME} starting up...")
    print(f"📍 Environment: {settings.ENVIRONMENT}")
    print(f"🔗 Database: {settings.DATABASE_URL[:50]}...")
    yield
    # Shutdown
    print(f"👋 {settings.APP_NAME} shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    description="AI-Powered Restaurant Management System - Backend API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router)


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "backend",
        "version": "1.0.0",
    }
