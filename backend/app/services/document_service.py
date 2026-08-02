import logging
import os
import re
from pathlib import Path
from datetime import datetime
import pdfplumber
import PyPDF2
import docx as python_docx
from fastapi import HTTPException, status

from backend.app.core.config import load_config
from backend.app.db import mongo

logger = logging.getLogger(__name__)


# ── File helpers ──────────────────────────────────────────────────────────────

def sanitize_filename(name: str) -> str:
    name = os.path.basename(name)
    name = re.sub(r"[^a-zA-Z0-9._\-]", "_", name).lstrip(".")
    return name[:255] or "document"


def get_upload_dir(username: str, user_id: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_\-]", "_", username)
    return os.path.join("uploads", f"{safe}-{user_id}")


# ── Text extraction ───────────────────────────────────────────────────────────

def extract_text(filepath: str, filename: str) -> str:
    """
    Extract plain text from PDF, DOCX, or TXT formats with absolute fallback stability.
    """
    ext = Path(filename).suffix.lower()

    if ext == ".pdf":
        # Primary: pdfplumber
        try:
            with pdfplumber.open(filepath) as pdf:
                pages = [p.extract_text() or "" for p in pdf.pages]
            text = "\n".join(pages)
            if text.strip():
                logger.info(f"📄  pdfplumber: {len(text):,} chars from {len(pages)} pages")
                return text
        except Exception as e:
            logger.warning(f"⚠️   pdfplumber failed ({e}), trying PyPDF2 …")

        # Fallback: PyPDF2
        with open(filepath, "rb") as fh:
            reader = PyPDF2.PdfReader(fh)
            text = "".join(p.extract_text() or "" for p in reader.pages)
        logger.info(f"📄  PyPDF2: {len(text):,} chars")
        return text

    elif ext == ".docx":
        doc  = python_docx.Document(filepath)
        text = "\n".join(p.text for p in doc.paragraphs)
        logger.info(f"📄  DOCX: {len(text):,} chars")
        return text

    elif ext == ".txt":
        with open(filepath, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        logger.info(f"📄  TXT: {len(text):,} chars")
        return text

    raise ValueError(f"Unsupported file type: {ext}")


# ── Service functions ─────────────────────────────────────────────────────────

async def process_file_upload(
    user_id: str, username: str, filename: str, content: bytes
) -> dict:
    config = load_config()

    # Extension validation matching configuration specifications
    ext = Path(filename).suffix.lstrip(".").lower()
    if ext not in config["allowed_extensions"]:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"File type '{ext}' not allowed. Accepted: {config['allowed_extensions']}",
        )

    # File capacity threshold validation passes
    if len(content) > config["max_file_size_mb"] * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds {config['max_file_size_mb']} MB limit",
        )

    # Persist the physical binary stream safely down onto storage structures
    upload_dir = get_upload_dir(username, user_id)
    Path(upload_dir).mkdir(parents=True, exist_ok=True)

    safe_name = sanitize_filename(filename)
    filepath  = os.path.join(upload_dir, safe_name)
    with open(filepath, "wb") as fh:
        fh.write(content)
    logger.info(f"💾  Saved upload: {filepath} ({len(content):,} bytes)")

    # Write state parameters directly inside the persistence database loop
    doc = await mongo.create_document(user_id, filename, filepath)
    
    # Expose both native ObjectIds and dynamic hash structures interchangeably
    return {
        "doc_id":   str(doc.get("doc_id", str(doc["_id"]))),
        "filename": doc["filename"],
        "filepath": doc["filepath"],
        "status":   doc["status"],
        "created_at": doc["created_at"].isoformat() if isinstance(doc["created_at"], datetime) else str(doc["created_at"]),
    }


async def list_user_documents(user_id: str) -> list[dict]:
    """Retrieve all document tracking items allocated to the workspace framework."""
    docs = await mongo.get_user_documents(user_id)
    return [
        {
            "doc_id":   str(d.get("doc_id", str(d["_id"]))),
            "filename": d["filename"],
            "status":   d["status"],
            "created_at": d["created_at"].isoformat() if hasattr(d["created_at"], "isoformat") else str(d["created_at"]),
            "uploadedAt": d.get("uploadedAt", d["created_at"].isoformat() if hasattr(d["created_at"], "isoformat") else str(d["created_at"]))
        }
        for d in docs
    ]


async def get_document_info(user_id: str, doc_id: str) -> dict:
    """Retrieve runtime context summary parameters for a targeted identifier key block."""
    doc = await mongo.get_document(doc_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
        
    # Cross-match database strings interchangeably to ensure multi-tenant verification rules pass
    if str(doc["user_id"]) != str(user_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
        
    return {
        "doc_id":   str(doc.get("doc_id", str(doc["_id"]))),
        "filename": doc["filename"],
        "status":   doc["status"],
        "created_at": doc["created_at"].isoformat() if hasattr(doc["created_at"], "isoformat") else str(doc["created_at"]),
        "updated_at": doc.get("updated_at", doc["created_at"]).isoformat() if hasattr(doc.get("updated_at"), "isoformat") else str(doc.get("updated_at", doc["created_at"])),
    }