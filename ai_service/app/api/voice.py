"""Voice API endpoints - Whisper STT and OpenAI TTS."""
import logging
import io
import time
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field

from app.core.database import get_db
from app.core.config import settings
from app.services.conversation_service import ConversationService
from app.services.voice_service import voice_service

router = APIRouter(prefix="/voice", tags=["Voice"])

logger = logging.getLogger(__name__)

# Minimum audio size in bytes to process (filter out silence/noise clips).
# WebM/opus at 48kHz encodes ~6KB/s, so 2KB ≈ 0.3s of real audio.
MIN_AUDIO_SIZE = 2000


# ==================== Schemas ====================

class TranscribeResponse(BaseModel):
    text: str
    language: str = "en"
    duration_ms: int = 0


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice: Optional[str] = None  # alloy, echo, fable, onyx, nova, shimmer
    speed: Optional[float] = Field(None, ge=0.25, le=4.0)


class VoiceChatResponse(BaseModel):
    text_response: str
    session_id: str
    tools_used: list[str] = []
    latency_ms: int = 0
    call_active: bool = True
    transcribed_text: str = ""
    audio_url: Optional[str] = None


# ==================== Endpoints ====================

@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    audio: UploadFile = File(..., description="Audio file (webm, mp3, wav, m4a)"),
    language: str = Query("en", description="Language code (default: en)"),
):
    """Transcribe audio to text using OpenAI Whisper."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    start = time.time()

    audio_data = await audio.read()
    if len(audio_data) < MIN_AUDIO_SIZE:
        raise HTTPException(status_code=400, detail="Audio file too small or empty")

    try:
        result = await voice_service.transcribe(
            audio_data=audio_data,
            filename=audio.filename or "audio.webm",
            language=language,
        )
        duration_ms = int((time.time() - start) * 1000)
        return TranscribeResponse(
            text=result["text"],
            language=result.get("language", language),
            duration_ms=duration_ms,
        )
    except Exception as e:
        logger.error(f"Transcription error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@router.post("/synthesize")
async def synthesize_speech(data: SynthesizeRequest):
    """Convert text to speech using OpenAI TTS. Returns audio/mpeg stream."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    try:
        audio_bytes = await voice_service.synthesize(
            text=data.text,
            voice=data.voice,
            speed=data.speed,
        )
        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=speech.mp3",
                "Content-Length": str(len(audio_bytes)),
            },
        )
    except Exception as e:
        logger.error(f"Synthesis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {str(e)}")


@router.post("/chat", response_model=VoiceChatResponse)
async def voice_chat(
    audio: UploadFile = File(..., description="Audio file from microphone"),
    company_id: UUID = Query(...),
    session_id: Optional[str] = Query(None),
    customer_phone: Optional[str] = Query(None),
    language: str = Query("en", description="Language code for transcription"),
    db: AsyncSession = Depends(get_db),
):
    """Full voice pipeline: Transcribe → AI Agent → TTS response.

    Accepts audio, transcribes it, sends to AI, returns text response.
    Use /voice/synthesize separately to get audio for the response.
    """
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    start = time.time()

    # 1. Transcribe
    audio_data = await audio.read()
    audio_size = len(audio_data)
    logger.info(f"Voice chat received audio: {audio_size} bytes")

    if audio_size < MIN_AUDIO_SIZE:
        logger.warning(f"Audio too small ({audio_size} bytes), likely silence")
        return VoiceChatResponse(
            text_response="I'm sorry, I couldn't hear that. Could you please speak a bit louder?",
            session_id=session_id or "",
            transcribed_text="",
            latency_ms=int((time.time() - start) * 1000),
        )

    try:
        transcription = await voice_service.transcribe(
            audio_data=audio_data,
            filename=audio.filename or "audio.webm",
            language=language,
        )
        transcribed_text = transcription["text"].strip()
    except Exception as e:
        logger.error(f"Transcription error in voice_chat: {e}")
        raise HTTPException(status_code=500, detail="Failed to transcribe audio")

    if not transcribed_text:
        return VoiceChatResponse(
            text_response="I'm sorry, I couldn't hear that. Could you please repeat?",
            session_id=session_id or "",
            transcribed_text="",
            latency_ms=int((time.time() - start) * 1000),
        )

    logger.info(f"Transcribed text: '{transcribed_text}'")

    # 2. Get company name
    company_q = await db.execute(
        text("SELECT name FROM companies WHERE id = :cid LIMIT 1"),
        {"cid": str(company_id)},
    )
    company = company_q.fetchone()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # 3. Process through AI agent
    service = ConversationService(db)
    result = await service.chat(
        company_id=str(company_id),
        company_name=company.name,
        message=transcribed_text,
        session_id=session_id,
        customer_phone=customer_phone,
        input_type="voice",
    )

    total_ms = int((time.time() - start) * 1000)

    return VoiceChatResponse(
        text_response=result["response"],
        session_id=result["session_id"],
        tools_used=result.get("tools_used", []),
        latency_ms=total_ms,
        call_active=result.get("call_active", True),
        transcribed_text=transcribed_text,
    )
