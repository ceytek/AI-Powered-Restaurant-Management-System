"""AI Service - Main Application."""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine
from app.api.knowledge import router as knowledge_router
from app.api.chat import router as chat_router
from app.api.voice import router as voice_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    logger.info(f"🤖 {settings.APP_NAME} starting on port {settings.AI_SERVICE_PORT}")
    logger.info(f"📊 Database: {settings.DATABASE_URL[:50]}...")
    logger.info(f"🧠 LLM Model: {settings.OPENAI_MODEL}")
    logger.info(f"📐 Embedding Model: {settings.OPENAI_EMBEDDING_MODEL}")

    if not settings.OPENAI_API_KEY:
        logger.warning("⚠️  OPENAI_API_KEY not set! AI features will be unavailable.")
    else:
        logger.info("✅ OpenAI API key configured")

    yield

    # Shutdown
    await engine.dispose()
    logger.info("🛑 AI Service stopped")


app = FastAPI(
    title=settings.APP_NAME,
    description="AI-powered restaurant agent service with voice interaction, semantic search, and intelligent reservation management.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(knowledge_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(voice_router, prefix="/api")


# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "model": settings.OPENAI_MODEL,
        "embedding_model": settings.OPENAI_EMBEDDING_MODEL,
        "api_key_set": bool(settings.OPENAI_API_KEY),
    }


@app.get("/")
async def root():
    return {
        "service": settings.APP_NAME,
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }
