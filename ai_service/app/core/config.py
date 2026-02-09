"""AI Service configuration."""
from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Restaurant AI Agent Service"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database (shared with backend)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/restaurant_db"
    DATABASE_URL_SYNC: str = "postgresql://postgres:postgres@localhost:5433/restaurant_db"

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    OPENAI_EMBEDDING_DIMENSIONS: int = 1536
    OPENAI_TTS_MODEL: str = "tts-1"
    OPENAI_TTS_VOICE: str = "alloy"
    OPENAI_WHISPER_MODEL: str = "whisper-1"

    # Backend API (to call backend endpoints)
    BACKEND_API_URL: str = "http://localhost:8000/api/v1"

    # JWT (same secret as backend to validate tokens)
    JWT_SECRET_KEY: str = "your-super-secret-jwt-key-change-this-in-production"
    JWT_ALGORITHM: str = "HS256"

    # CORS
    BACKEND_CORS_ORIGINS: str = '["http://localhost:3000", "http://localhost:5173"]'

    @property
    def cors_origins(self) -> List[str]:
        return json.loads(self.BACKEND_CORS_ORIGINS)

    # Server
    AI_SERVICE_HOST: str = "0.0.0.0"
    AI_SERVICE_PORT: int = 8001

    # Embedding batch size
    EMBEDDING_BATCH_SIZE: int = 50

    class Config:
        env_file = "../.env"  # Root .env file
        extra = "ignore"
        env_file_encoding = "utf-8"
        case_sensitive = True


settings = Settings()
