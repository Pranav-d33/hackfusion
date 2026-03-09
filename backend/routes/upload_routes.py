from fastapi import APIRouter, UploadFile, File, HTTPException
import base64
import shutil
import os
from pathlib import Path
import uuid

router = APIRouter(prefix="/api/upload", tags=["upload"])

IS_VERCEL = os.getenv("VERCEL", "") == "1"
UPLOAD_DIR = Path("/tmp/uploads") if IS_VERCEL else Path("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Max upload size: 10 MB
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


@router.post("/prescription")
async def upload_prescription(file: UploadFile = File(...)):
    """
    Upload a prescription image.
    Returns both a local file path (for local dev) AND base64 data (for Vercel).
    The base64 payload ensures the image survives across serverless invocations.
    """
    try:
        # Validate file type — accept images and PDFs
        content_type = file.content_type or ""
        if not content_type.startswith("image/") and content_type != "application/pdf":
            raise HTTPException(status_code=400, detail="File must be an image or PDF")

        # Read file bytes once
        file_bytes = await file.read()
        if len(file_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

        # Generate unique filename
        file_ext = os.path.splitext(file.filename or "upload")[1] or ".jpg"
        filename = f"prescription_{uuid.uuid4()}{file_ext}"
        file_path = UPLOAD_DIR / filename

        # Save file to disk (works locally; ephemeral on Vercel but OCR may run in same invocation)
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        with file_path.open("wb") as buffer:
            buffer.write(file_bytes)

        absolute_path = str(file_path.absolute())

        # Also return base64 so the chat endpoint can use it directly
        # without needing the file to still exist on disk.
        b64_data = base64.b64encode(file_bytes).decode("utf-8")
        mime = content_type if content_type else "image/jpeg"

        return {
            "filename": filename,
            "filepath": absolute_path,
            "image_base64": b64_data,
            "mime_type": mime,
            "message": "File uploaded successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
