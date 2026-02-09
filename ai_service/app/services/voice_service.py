"""Voice service - Whisper STT and OpenAI TTS."""
import logging
from typing import Optional
from openai import AsyncOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)


class VoiceService:
    """Handles speech-to-text and text-to-speech operations."""

    # Default language for transcription - prevents Whisper from
    # hallucinating other languages when background noise is present
    DEFAULT_LANGUAGE = "en"

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def transcribe(
        self,
        audio_data: bytes,
        filename: str = "audio.webm",
        language: Optional[str] = None,
    ) -> dict:
        """Transcribe audio using OpenAI Whisper.

        Args:
            audio_data: Raw audio bytes
            filename: Original filename (helps Whisper detect format)
            language: Language code (defaults to 'en' to prevent wrong language detection)

        Returns:
            dict with 'text' and 'language' keys
        """
        file_tuple = (filename, audio_data)

        # ALWAYS set language to prevent Whisper from detecting wrong languages.
        # Whisper can hallucinate non-English text when audio quality is poor
        # or there's background noise.
        forced_language = language or self.DEFAULT_LANGUAGE

        kwargs = {
            "model": settings.OPENAI_WHISPER_MODEL,
            "file": file_tuple,
            "response_format": "json",
            "language": forced_language,
            "prompt": "This is a phone call to an English-speaking restaurant. The caller speaks English.",
        }

        response = await self.client.audio.transcriptions.create(**kwargs)

        transcribed_text = response.text.strip()

        # Filter out common Whisper hallucinations on silence/noise
        hallucination_patterns = [
            "thank you",
            "thanks for watching",
            "subscribe",
            "like and subscribe",
            "thank you for watching",
            "you",
            "bye",
            "...",
            ".",
        ]
        if transcribed_text.lower() in hallucination_patterns:
            logger.warning(f"Filtered Whisper hallucination: '{transcribed_text}'")
            transcribed_text = ""

        logger.info(f"Transcribed ({forced_language}): '{transcribed_text}'")

        return {
            "text": transcribed_text,
            "language": forced_language,
        }

    async def synthesize(
        self,
        text: str,
        voice: Optional[str] = None,
        speed: Optional[float] = None,
    ) -> bytes:
        """Synthesize speech using OpenAI TTS.

        Args:
            text: Text to convert to speech
            voice: Voice to use (alloy, echo, fable, onyx, nova, shimmer)
            speed: Speech speed (0.25 to 4.0)

        Returns:
            Audio bytes in MP3 format
        """
        kwargs = {
            "model": settings.OPENAI_TTS_MODEL,
            "voice": voice or settings.OPENAI_TTS_VOICE,
            "input": text,
            "response_format": "mp3",
        }
        if speed:
            kwargs["speed"] = speed

        response = await self.client.audio.speech.create(**kwargs)

        audio_bytes = response.content
        logger.info(f"Synthesized {len(text)} chars → {len(audio_bytes)} bytes audio")
        return audio_bytes


# Singleton
voice_service = VoiceService()
