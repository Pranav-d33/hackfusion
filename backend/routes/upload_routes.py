from fastapi import APIRouter, UploadFile, File, HTTPException
import shutil
import os
from pathlib import Path
import uuid

router = APIRouter(prefix="/api/upload", tags=["upload"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@router.post("/prescription")
async def upload_prescription(file: UploadFile = File(...)):
    """
    Upload a prescription image.
    Returns the file path for the agent to process.
    """
    try:
        # Validate file type
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")

        # Generate unique filename
        file_ext = os.path.splitext(file.filename)[1]
        filename = f"prescription_{uuid.uuid4()}{file_ext}"
        file_path = UPLOAD_DIR / filename

        # Save file
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Return absolute path for the agent to use
        # In a real app, you might use a URL or S3 path. 
        # For this MVP, local absolute path works best for the python tools.
        absolute_path = str(file_path.absolute())
        
        return {
            "filename": filename,
            "filepath": absolute_path,
            "message": "File uploaded successfully"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
