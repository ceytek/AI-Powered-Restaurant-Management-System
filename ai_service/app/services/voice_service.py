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
        context_hint: Optional[str] = None,
    ) -> dict:
        """Transcribe audio using OpenAI Whisper.

        Args:
            audio_data: Raw audio bytes
            filename: Original filename (helps Whisper detect format)
            language: Language code (defaults to 'en' to prevent wrong language detection)
            context_hint: Optional conversation context to prime Whisper for better accuracy.
                          E.g. last agent question like "What date were you thinking?"
                          helps Whisper expect date-related words like "tomorrow", "Saturday", etc.

        Returns:
            dict with 'text' and 'language' keys
        """
        file_tuple = (filename, audio_data)

        # ALWAYS set language to prevent Whisper from detecting wrong languages.
        forced_language = language or self.DEFAULT_LANGUAGE

        # Build a contextual prompt for Whisper.
        # The prompt "primes" Whisper — it expects words/phrases similar to the prompt.
        # By including conversation context, Whisper is more likely to hear "tomorrow"
        # instead of hallucinating "That's it for now. Have a great day."
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

        Whisper uses the prompt as a "prior" — it biases transcription towards
        words and phrases that appear in the prompt. By including conversation
        context (e.g. the last agent question), Whisper expects relevant answers.

        Examples:
          Agent asked "What date?"     → prompt includes "tomorrow, Saturday, next week, January..."
          Agent asked "Your name?"     → prompt includes "My name is, spelled, letter by letter..."
          Agent asked "How many guests?"→ prompt includes "two, three, four, five, party of..."
        """
        # Base prompt — always present
        base = "Restaurant reservation phone call."

        if not context_hint:
            return base

        ctx = context_hint.lower()

        # Date-related context
        if any(w in ctx for w in ["date", "when", "day", "which day", "what day"]):
            return f"{base} The caller may say: today, tomorrow, tonight, this Saturday, next Friday, January, February, the 15th, next week."

        # Time-related context
        if any(w in ctx for w in ["time", "what time", "when", "o'clock"]):
            return f"{base} The caller may say: seven PM, 7 o'clock, around 8, 6:30, half past seven, noon, evening."

        # Name-related context
        if any(w in ctx for w in ["name", "your name", "who", "may i have"]):
            return f"{base} The caller is saying their name. They may spell it letter by letter: A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z."

        # Party size context
        if any(w in ctx for w in ["many", "guests", "party", "people", "how many"]):
            return f"{base} The caller may say: two, three, four, five, six, seven, eight, party of, just us, couple."

        # Phone number context
        if any(w in ctx for w in ["phone", "number", "contact", "reach"]):
            return f"{base} The caller is saying a phone number with digits: zero, one, two, three, four, five, six, seven, eight, nine, plus."

        # Confirmation context
        if any(w in ctx for w in ["confirm", "shall i", "go ahead", "book"]):
            return f"{base} The caller may say: yes, yes please, that's correct, go ahead, sure, sounds good, perfect, no wait, actually, change."

        # Reservation lookup context
        if any(w in ctx for w in ["reservation number", "confirmation", "look up", "check", "cancel"]):
            return f"{base} The caller may say a reservation number like RES-0001, or their name, or phone number."

        # Generic — include the last agent message as context
        # Truncate to avoid prompt being too long
        truncated = context_hint[:120]
        return f"{base} Previous: \"{truncated}\""

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
