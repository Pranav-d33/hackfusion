"""
Speech-to-text helpers.
"""
from __future__ import annotations

from typing import Optional, Dict, Any

import httpx
from fastapi import HTTPException, UploadFile

from config import GROQ_API_KEY, GROQ_BASE_URL, GROQ_STT_MODEL


async def transcribe_audio_file(file: UploadFile, language: Optional[str] = None) -> Dict[str, Any]:
    """Transcribe an uploaded audio file using Groq Whisper."""
    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="Speech transcription is not configured")

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio file is empty")

    normalized_language = (language or "").split("-")[0].strip().lower() or None
    payload = {
        "model": GROQ_STT_MODEL,
        "response_format": "verbose_json",
        "temperature": "0",
    }
    if normalized_language:
        payload["language"] = normalized_language

    files = {
        "file": (
            file.filename or "voice-input.webm",
            audio_bytes,
            file.content_type or "application/octet-stream",
        )
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                f"{GROQ_BASE_URL}/audio/transcriptions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                data=payload,
                files=files,
            )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text.strip() or "Speech transcription failed"
        raise HTTPException(status_code=502, detail=detail) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Speech transcription failed: {exc}") from exc

    data = response.json()
    return {
        "text": (data.get("text") or "").strip(),
        "language": data.get("language") or normalized_language,
        "duration": data.get("duration"),
        "provider": "groq",
        "model": GROQ_STT_MODEL,
    }