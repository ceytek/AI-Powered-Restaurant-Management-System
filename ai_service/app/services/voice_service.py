"""Voice service - Whisper STT and OpenAI TTS."""
import logging
import re
from typing import Optional
from openai import AsyncOpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Whisper hallucination patterns ──
# Exact matches (lowercased, stripped of trailing period) that Whisper produces on silence/noise
HALLUCINATION_EXACT = {
    "thank you",
    "thanks",
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
    "restaurant reservation phone call",
    "restaurant reservation",
    # Common Whisper silence hallucinations
    "i'm going to go ahead and do that",
    "i'll be right back",
    "let me check",
    "one moment please",
    "have a good day",
    "have a nice day",
    "have a great day",
    "take care",
    "see you later",
    "see you soon",
    "that's it",
    "that's all",
    "the following",
    "in this video",
    "hello",
    "hi",
    "hey",
    # Alphabet echo (from name spelling context)
    "a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z",
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
    "the previous",
    "restaurant reservation phone call",
    "in this episode",
    "in this video",
    "don't forget to",
    "hit the bell",
    "notification",
]

# Regex patterns for common Whisper noise artefacts
HALLUCINATION_REGEX = [
    re.compile(r"^\W+$"),                          # only punctuation/symbols
    re.compile(r"^(\.{2,}|…+)$"),                  # just dots/ellipsis
    re.compile(r"^[\s\W]*$"),                       # whitespace/symbols only
    re.compile(r"^this is [\w\s]+ bell\.?$", re.I), # "This is Matt Bell" etc
    re.compile(r"^my name is [\w\s]+\.?$", re.I),   # "My name is ..." artefact
    # Multi-sentence farewells that Whisper hallucinates from noise
    re.compile(r"^that'?s it for now[\.\!]?\s*(have a|bye|good)", re.I),
    re.compile(r"^(have a (great|good|nice|wonderful) (day|one|evening)[\.\!]?\s*){1,2}$", re.I),
    # Full alphabet recitation — REQUIRE comma or space+comma between letters
    # e.g. "A, B, C, D, E" but NOT "I want" (which has no separators)
    re.compile(r"^[A-Z][,\s]{2,}[A-Z][,\s]{2,}[A-Z][,\s]{2,}[A-Z][,\s]{2,}[A-Z]", re.I),
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

    # Check if it's just a sequence of 5+ comma-separated single letters (alphabet echo)
    # e.g. "A, B, C, D, E, F, G, ..."
    parts = [p.strip() for p in t.replace(",", " ").split()]
    if len(parts) >= 5 and all(len(p) == 1 and p.isalpha() for p in parts):
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
        context_hint: Optional[str] = None,
    ) -> dict:
        """Transcribe audio using OpenAI Whisper.

        Args:
            audio_data: Raw audio bytes
            filename: Original filename (helps Whisper detect format)
            language: Language code (defaults to 'en' to prevent wrong language detection)
            context_hint: Optional conversation context to prime Whisper for better accuracy.

        Returns:
            dict with 'text' and 'language' keys
        """
        file_tuple = (filename, audio_data)

        # ALWAYS set language to prevent Whisper from detecting wrong languages.
        forced_language = language or self.DEFAULT_LANGUAGE

        # Build a contextual prompt for Whisper.
        prompt = self._build_whisper_prompt(context_hint)

        kwargs = {
            "model": settings.OPENAI_WHISPER_MODEL,
            "file": file_tuple,
            "response_format": "json",
            "language": forced_language,
            "prompt": prompt,
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

    @staticmethod
    def _build_whisper_prompt(context_hint: Optional[str] = None) -> str:
        """Build a contextual prompt for Whisper to improve accuracy.

        The prompt primes Whisper to expect relevant words based on what
        the agent last asked. This dramatically reduces hallucinations.

        IMPORTANT: Keep prompts SHORT and natural. Long prompts or listing
        letters/alphabet causes Whisper to echo them back.
        """
        base = "Restaurant reservation phone call."

        if not context_hint:
            return base

        ctx = context_hint.lower()

        # Date-related context
        if any(w in ctx for w in ["date", "when", "day", "which day", "what day"]):
            return f"{base} The caller responds with a date like tomorrow, Saturday, next Friday, the 15th."

        # Time-related context
        if any(w in ctx for w in ["time", "what time", "o'clock"]):
            return f"{base} The caller responds with a time like seven PM, 6:30, half past seven."

        # Name-related context — DO NOT list alphabet, it causes echo
        if any(w in ctx for w in ["name", "your name", "who", "may i have", "spell"]):
            return f"{base} The caller says their name or spells it out."

        # Party size context
        if any(w in ctx for w in ["many", "guests", "party", "people", "how many"]):
            return f"{base} The caller says a number of guests, like two, four, six."

        # Phone number context
        if any(w in ctx for w in ["phone", "number", "contact", "reach"]):
            return f"{base} The caller says a phone number."

        # Confirmation context
        if any(w in ctx for w in ["confirm", "shall i", "go ahead", "book", "correct"]):
            return f"{base} The caller confirms: yes please, sounds good, go ahead, or corrects details."

        # Reservation lookup context
        if any(w in ctx for w in ["reservation number", "confirmation", "look up", "check", "cancel"]):
            return f"{base} The caller says a reservation number or name."

        # Generic — use a short excerpt of the last agent message
        truncated = context_hint[:80]
        return f"{base} Agent asked: \"{truncated}\""

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
