"""Voice service - Whisper STT and OpenAI TTS."""
import logging
import re
from typing import Optional
from openai import AsyncOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Whisper hallucination patterns ──
# Exact matches (lowercased) that Whisper produces on silence/noise
HALLUCINATION_EXACT = {
    "thank you",
    "thanks for watching",
    "subscribe",
    "like and subscribe",
    "thank you for watching",
    "thanks for listening",
    "thank you for listening",
    "you",
    "bye",
    "bye bye",
    "bye-bye",
    "goodbye",
    "okay",
    "ok",
    "so",
    "uh",
    "um",
    "hmm",
    "hm",
    "ah",
    "oh",
    "yeah",
    "yes",
    "no",
    "the end",
    "...",
    ".",
    "",
    "you're welcome",
    "silence",
    "applause",
    "music",
    "laughter",
    # Prompt echo hallucinations
    "this is a phone call",
    "the caller speaks english",
    "caller speaks english",
    "the caller speaks english.",
    "english",
    "phone call",
}

# Substring patterns – if the transcription contains any of these, it's likely a hallucination
HALLUCINATION_SUBSTRINGS = [
    "thank you for watching",
    "thanks for watching",
    "like and subscribe",
    "subscribe to",
    "please subscribe",
    "check out the",
    "see you next",
    "see you in the next",
    "this is a phone call to",
    "the caller speaks",
    "caller speaks english",
    "subtitles by",
    "captions by",
    "translated by",
    "transcribed by",
    "copyright",
    "all rights reserved",
]

# Regex patterns for common Whisper noise artefacts
HALLUCINATION_REGEX = [
    re.compile(r"^\W+$"),                          # only punctuation/symbols
    re.compile(r"^(\.{2,}|…+)$"),                  # just dots/ellipsis
    re.compile(r"^[\s\W]*$"),                       # whitespace/symbols only
    re.compile(r"^this is [\w\s]+ bell\.?$", re.I), # "This is Matt Bell" etc
    re.compile(r"^my name is [\w\s]+\.?$", re.I),   # "My name is ..." artefact
]


def is_hallucination(text: str) -> bool:
    """Return True if the transcribed text looks like a Whisper hallucination."""
    t = text.strip().lower().rstrip(".")

    # Exact match
    if t in HALLUCINATION_EXACT:
        return True

    # Too short to be real speech (single word ≤ 3 chars)
    if len(t) <= 3:
        return True

    # Substring check
    for sub in HALLUCINATION_SUBSTRINGS:
        if sub in t:
            return True

    # Regex check
    for pat in HALLUCINATION_REGEX:
        if pat.match(text.strip()):
            return True

    return False


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
        forced_language = language or self.DEFAULT_LANGUAGE

        kwargs = {
            "model": settings.OPENAI_WHISPER_MODEL,
            "file": file_tuple,
            "response_format": "json",
            "language": forced_language,
            # Neutral prompt – avoid phrases Whisper may echo back
            "prompt": "Restaurant reservation phone call.",
        }

        response = await self.client.audio.transcriptions.create(**kwargs)

        transcribed_text = response.text.strip()

        # Robust hallucination filter
        if is_hallucination(transcribed_text):
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
