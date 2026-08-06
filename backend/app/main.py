import sys
if __name__ == "__main__" and "__main__" in sys.modules:
    sys.modules["main"] = sys.modules["__main__"]

import logging
import logging.handlers
import os
import re
import pickle
import shutil
import traceback
import uuid
import mimetypes
import json
from pathlib import Path
from typing import List, Optional
from contextlib import asynccontextmanager

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np
import faiss
import pdfplumber
import docx2txt
import ollama
from sentence_transformers import SentenceTransformer

from fastapi import FastAPI, APIRouter, HTTPException, status, Query, Header, Form, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field

from backend.app.core.config import load_config
from backend.app.db import mongo
from backend.app.services import search_service


# Logging
def setup_logging():
    os.makedirs("logs", exist_ok=True)
    root = logging.getLogger()
    root.setLevel(logging.WARNING)
    fmt = logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s", "%H:%M:%S")
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)
    fh = logging.handlers.RotatingFileHandler("logs/legal_ai.log", maxBytes=10*1024*1024, backupCount=3, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    root.addHandler(ch)
    root.addHandler(fh)
    logging.getLogger("app").setLevel(logging.INFO)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)

setup_logging()
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────
# Document router (inline with registry.json)
# ─────────────────────────────────────────

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

REGISTRY_PATH = os.path.join(UPLOAD_DIR, "registry.json")
_doc_registry = {}   # doc_id -> {filename, path, status}
_summary_cache = {}  # doc_id -> analysis result

def _load_registry():
    global _doc_registry
    if os.path.exists(REGISTRY_PATH):
        try:
            with open(REGISTRY_PATH, 'r', encoding='utf-8') as f:
                saved = json.load(f)
            for doc_id, meta in saved.items():
                if not doc_id or not isinstance(doc_id, str):
                    logger.warning(f"Skipping bad registry key: {repr(doc_id)}")
                    continue
                path = os.path.join(UPLOAD_DIR, os.path.basename(meta.get("path", "")))
                if os.path.exists(path):
                    _doc_registry[doc_id] = {
                        "filename": meta.get("filename", "Unknown"),
                        "path": path,
                        "status": meta.get("status", "queued")
                    }
        except Exception as e:
            logger.warning(f"Could not load registry: {e}")

def _save_registry():
    try:
        with open(REGISTRY_PATH, 'w', encoding='utf-8') as f:
            json.dump(_doc_registry, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"Could not save registry: {e}")

def _scan_uploads():
    if not os.path.exists(UPLOAD_DIR):
        return
    for fname in os.listdir(UPLOAD_DIR):
        if fname.startswith(".") or fname == "registry.json":
            continue
        fpath = os.path.join(UPLOAD_DIR, fname)
        if not os.path.isfile(fpath):
            continue
        doc_id = os.path.splitext(fname)[0]
        if not doc_id or not isinstance(doc_id, str):
            logger.warning(f"Skipping file with bad id: {repr(fname)}")
            continue
        if doc_id not in _doc_registry:
            _doc_registry[doc_id] = {
                "filename": fname,
                "path": fpath,
                "status": "queued"
            }

_load_registry()
_scan_uploads()

def _get_mime_type(filename: str) -> str:
    mime, _ = mimetypes.guess_type(filename)
    if filename.lower().endswith('.docx'):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return mime or "application/octet-stream"

document_router = APIRouter(prefix="/api/documents", tags=["documents"])

@document_router.get("")
async def list_documents():
    try:
        _scan_uploads()
        files = []
        for doc_id, meta in _doc_registry.items():
            if not doc_id or not isinstance(doc_id, str):
                logger.warning(f"Filtering out bad doc_id from response: {repr(doc_id)}")
                continue
            files.append({
                "id": doc_id,
                "filename": meta["filename"],
                "status": meta.get("status", "uploaded")
            })
        logger.info(f"API returning {len(files)} documents: {[f['id'] for f in files]}")
        return {"documents": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@document_router.get("/{doc_id}")
async def get_document_meta(doc_id: str):
    _scan_uploads()
    meta = _doc_registry.get(doc_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": doc_id,
        "filename": meta["filename"],
        "status": meta.get("status", "queued"),
        "file_url": f"/api/documents/{doc_id}/file"
    }

@document_router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in {'.pdf', '.docx', '.txt'}:
            raise HTTPException(status_code=400, detail="Only PDF, DOCX, and TXT files are allowed")
        doc_id = str(uuid.uuid4())[:8]
        safe_name = f"{doc_id}{ext}"
        file_path = os.path.join(UPLOAD_DIR, safe_name)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        _doc_registry[doc_id] = {
            "filename": file.filename,
            "path": file_path,
            "status": "queued"
        }
        _save_registry()
        logger.info(f"Uploaded: {file.filename} -> {doc_id}")
        return {"status": "success", "filename": file.filename, "doc_id": doc_id, "message": "Document uploaded successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@document_router.get("/{doc_id}/file")
async def file_document(doc_id: str):
    """Serve the actual file inline for browser preview."""
    _scan_uploads()
    meta = _doc_registry.get(doc_id)
    if not meta or not os.path.exists(meta["path"]):
        raise HTTPException(status_code=404, detail="File not found")
    mime = _get_mime_type(meta["filename"])
    logger.info(f"Serving file: {doc_id} ({meta['filename']}) as {mime}")
    headers = {"Content-Disposition": f'inline; filename="{meta["filename"]}"'}
    return FileResponse(meta["path"], media_type=mime, headers=headers)

@document_router.get("/{doc_id}/download")
async def download_document(doc_id: str):
    _scan_uploads()
    meta = _doc_registry.get(doc_id)
    if not meta or not os.path.exists(meta["path"]):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        meta["path"],
        media_type="application/octet-stream",
        filename=meta["filename"]
    )

@document_router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    _scan_uploads()
    meta = _doc_registry.get(doc_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        if os.path.exists(meta["path"]):
            os.remove(meta["path"])
            logger.info(f"Deleted file from disk: {meta['path']}")
        if doc_id in _doc_registry:
            del _doc_registry[doc_id]
        if doc_id in _summary_cache:
            del _summary_cache[doc_id]
        _save_registry()
        logger.info(f"Deleted document: {doc_id}")
        return {"status": "success", "message": "Document deleted successfully"}
    except Exception as e:
        logger.error(f"Delete error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────
# Summarize router (inline)
# ─────────────────────────────────────────

summarize_router = APIRouter(prefix="/api/summarize", tags=["summarize"])

def _generate_summary(doc_id: str) -> dict:
    _scan_uploads()
    meta = _doc_registry.get(doc_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Document not found")
    
    logger.info(f"Generating summary for: {doc_id} ({meta['filename']})")
    
    text = extract_pdf(meta["path"])
    logger.info(f"Extracted {len(text)} characters from {doc_id}")
    
    results = execute_search(text[:300], top_k=3)
    logger.info(f"Search returned {len(results)} results for {doc_id}")
    
    analysis = execute_generation(
        query="Analyze this legal document",
        results=results,
        file_excerpt=text
    )
    logger.info(f"Analysis generated: {len(analysis)} characters for {doc_id}")
    
    payload = {
        "status": "completed",
        "doc_id": doc_id,
        "filename": meta["filename"],
        "analysis": analysis,
        "summary": analysis,
        "content": analysis,
        "raw_markdown": analysis
    }
    _summary_cache[doc_id] = payload
    _doc_registry[doc_id]["status"] = "analyzed"
    _save_registry()
    return payload

@summarize_router.post("/{doc_id}/trigger")
async def trigger_summary(doc_id: str):
    try:
        result = _generate_summary(doc_id)
        return {"status": "success", "doc_id": doc_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Summary trigger error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@summarize_router.get("/{doc_id}")
async def get_summary(doc_id: str):
    logger.info(f"GET /api/summarize/{doc_id} called")
    if doc_id in _summary_cache:
        logger.info(f"Returning cached summary for {doc_id}")
        return _summary_cache[doc_id]
    if doc_id in _doc_registry or os.path.exists(os.path.join(UPLOAD_DIR, f"{doc_id}.pdf")) or os.path.exists(os.path.join(UPLOAD_DIR, f"{doc_id}.docx")) or os.path.exists(os.path.join(UPLOAD_DIR, f"{doc_id}.txt")):
        try:
            return _generate_summary(doc_id)
        except Exception as e:
            logger.error(f"On-demand summary error: {traceback.format_exc()}")
            return {"status": "queued", "doc_id": doc_id}
    raise HTTPException(status_code=404, detail="Document not found")


# ─────────────────────────────────────────
# Result router (matches frontend /result/{id})
# ─────────────────────────────────────────

result_router = APIRouter(prefix="/result", tags=["result"])

@result_router.get("/{doc_id}")
async def get_result(doc_id: str):
    logger.info(f"GET /result/{doc_id} called")
    if doc_id in _summary_cache:
        return _summary_cache[doc_id]
    if doc_id in _doc_registry or os.path.exists(os.path.join(UPLOAD_DIR, f"{doc_id}.pdf")) or os.path.exists(os.path.join(UPLOAD_DIR, f"{doc_id}.docx")) or os.path.exists(os.path.join(UPLOAD_DIR, f"{doc_id}.txt")):
        try:
            return _generate_summary(doc_id)
        except Exception as e:
            logger.error(f"On-demand result error: {traceback.format_exc()}")
            return {"status": "queued", "doc_id": doc_id}
    raise HTTPException(status_code=404, detail="Document not found")


# ─────────────────────────────────────────
# Auth router
# ─────────────────────────────────────────

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])

@auth_router.post("/login")
async def login_placeholder(request: Request):
    return {
        "access_token": "mock_production_level_jwt_token_string",
        "user_id": "system_developer_admin_id",
        "email": "Harpreet21@gmail.com",
        "status": "active",
        "scope": "authorization_context"
    }


# ─────────────────────────────────────────
# RAG router
# ─────────────────────────────────────────

rag_router = APIRouter(prefix="/api/rag", tags=["rag-engine"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH      = os.path.join(BASE_DIR, "output", "companies_act_dataset.json")
EMBEDDING_PATH = os.path.join(BASE_DIR, "output", "embeddings.npy")
METADATA_PATH  = os.path.join(BASE_DIR, "output", "metadata.pkl")
FAISS_PATH     = os.path.join(BASE_DIR, "output", "faiss_index.bin")

logger.info("Initializing System Components...")
_embed_model = SentenceTransformer('all-MiniLM-L6-v2')
_faiss_index = None
_metadata    = None
_cached_model = "qwen3:1.7b"

def _load_index() -> bool:
    global _faiss_index, _metadata
    if _faiss_index is not None:
        return True
    if not (os.path.exists(FAISS_PATH) and os.path.exists(METADATA_PATH)):
        logger.warning(f"Search index files missing at {FAISS_PATH}. Run build_index.py first.")
        return False
    try:
        _faiss_index = faiss.read_index(FAISS_PATH)
        with open(METADATA_PATH, "rb") as f:
            _metadata = pickle.load(f)
        logger.info(f"FAISS Index Loaded ({len(_metadata)} sections)")
        return True
    except Exception as e:
        logger.error(f"Load error: {e}")
        return False

_load_index()

class SearchRequest(BaseModel):
    query: str = Field(..., example="What are the rules for incorporation under Section 7?")
    top_k: int = Field(default=3, ge=1, le=10)

class RAGGenerationRequest(BaseModel):
    query: str
    results: List[dict] = Field(default_factory=list)
    file_excerpt: str = Field(default="")

class RAGGenerationResponse(BaseModel):
    status: str
    analysis: str
    raw_markdown: str

def extract_pdf(pdf_path: str) -> str:
    text = ""
    try:
        lower = pdf_path.lower()
        if lower.endswith('.docx'):
            text = docx2txt.process(pdf_path)
        elif lower.endswith('.txt'):
            with open(pdf_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
        else:
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    content = page.extract_text()
                    if content:
                        text += content + "\n"
        return text.strip()
    except Exception as e:
        logger.error(f"Document Extraction Error: {e}")
        return ""

def get_model_name() -> str:
    global _cached_model
    try:
        available = [m['model'] for m in ollama.list().get('models', [])]
        if any(_cached_model in m for m in available):
            return _cached_model
        return available[0] if available else _cached_model
    except:
        return _cached_model

def extract_keywords(text: str, max_words: int = 10) -> str:
    words = re.findall(r'\b[a-zA-Z]{5,}\b', text.lower())
    _LEGAL_SIGNALS = {
        'incorporation','memorandum','articles','prospectus','securities',
        'shareholders','directors','audit','dividend','liquidation','merger',
        'compliance','resolution','allotment','debenture','winding'
    }
    signals = [w for w in words if w in _LEGAL_SIGNALS]
    others = [w for w in words if w not in _LEGAL_SIGNALS]
    combined = list(dict.fromkeys(signals + others))
    return " ".join(combined[:max_words])

def execute_search(query: str, top_k: int = 3) -> list:
    if not _load_index():
        return []
    sec_match = re.search(r'\b(?:section|sec)\s*(\d+)\b', query.lower())
    if sec_match:
        num = sec_match.group(1)
        for item in _metadata:
            if str(item.get("section_number")) == num:
                return [item]
    clean_query = extract_keywords(query)
    query_vec = _embed_model.encode([clean_query], show_progress_bar=False).astype('float32')
    faiss.normalize_L2(query_vec)
    distances, indices = _faiss_index.search(query_vec, top_k)
    return [_metadata[i] for i in indices[0] if 0 <= i < len(_metadata)]

def execute_generation(query: str, results: list, file_excerpt: str = "") -> str:
    model = get_model_name()

    # Build legal context from search results
    context_parts = []
    if results:
        for r in results[:3]:
            sec = r.get('section_number', 'General')
            content = r.get('content', 'Indian Corporate Law guidelines.')
            context_parts.append(f"Section {sec}: {content}")
    else:
        context_parts.append("General Indian Corporate Law guidelines.")
    context_text = "\n".join(context_parts)

    # Truncate excerpt to avoid exceeding model context window
    excerpt = file_excerpt.strip()
    if len(excerpt) > 6000:
        excerpt = excerpt[:6000] + "\n\n...[Document truncated due to length]..."

    prompt = f"""You are LegalBuddy, an expert Indian corporate law AI assistant. Analyze the following legal document and provide a structured legal analysis.

## Document Excerpt:
{excerpt}

## Relevant Legal Context from Companies Act, 2013:
{context_text}

## Task:
Provide a comprehensive legal analysis using EXACTLY this structure and headers:

[EXECUTIVE_SUMMARY]
Write a concise 3-5 sentence summary. Identify what type of document this is (statute, contract, agreement, memorandum, articles of association, prospectus, etc.). Describe its purpose and scope accurately. DO NOT assume it is an employment agreement unless the text explicitly shows employment terms.

[CLAUSE_DETECTION]
If the document is a STATUTE (like the Companies Act, 2013), list the KEY CHAPTERS and important SECTIONS covered in the text. For each:
- Chapter/Section name and number
- What it governs in simple terms
- Key provisions or requirements

If the document is a CONTRACT or AGREEMENT, list the key clauses instead. For each:
- Name the clause/section
- Explain what it governs in simple terms
- Note any risks, obligations, or penalties

[RISK_ASSESSMENT]
List the key legal risks, penalties, and consequences of non-compliance mentioned in the document. For each:
- Name the risk or penalty
- Relevant section or provision
- Consequence (fine, imprisonment, disqualification, or operational impact)

[CLAUSE_OBJECTIVES]
Explain the primary objectives: Who does this protect? What compliance does it require? What is the intended legal outcome?

[COMPLIANCE_STATUS]
List the mandatory compliance requirements, filings, and obligations from the document. For each:
- Compliance requirement
- Who it applies to
- Frequency, deadline, or condition if mentioned

Keep the tone professional, factual, and grounded in Indian corporate law. Do not invent information not present in the text. Use clear markdown bullet points for every list.
"""

    try:
        logger.info(f"Calling Ollama model '{model}' for document generation...")
        response = ollama.chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            options={"temperature": 0.2, "num_predict": 2048}
        )
        analysis = response.get("message", {}).get("content", "").strip()
        if not analysis:
            raise ValueError("Empty response from Ollama model")
        logger.info(f"Ollama response received: {len(analysis)} chars")
        return analysis
    except Exception as e:
        logger.error(f"Ollama generation failed, using fallback: {e}")
        primary_sec = results[0].get('section_number', 'General') if results else 'General'
        clean_excerpt = ' '.join(excerpt[:300].split())
        return (
            f"[EXECUTIVE_SUMMARY]\n"
            f"This document has been submitted for legal analysis. Based on the extracted text parameters, "
            f"the file addresses: {clean_excerpt}... "
            f"The document contains legal provisions, corporate governance rules, or statutory requirements "
            f"that require detailed professional review.\n\n"
            f"[CLAUSE_DETECTION]\n"
            f"- **Primary Legal Content:** The document contains provisions related to the submitted text. "
            f"Specific clause or section identification requires full document review.\n"
            f"- **Applicable Framework:** Relevant under Section {primary_sec} of the Companies Act, 2013 "
            f"or associated corporate regulations.\n\n"
            f"[RISK_ASSESSMENT]\n"
            f"- **Non-Compliance Risk:** Failure to adhere to the provisions outlined may attract penalties, "
            f"fines, or legal proceedings as prescribed under the applicable sections of the Companies Act, 2013.\n\n"
            f"[CLAUSE_OBJECTIVES]\n"
            f"The document establishes legal parameters, compliance obligations, or operational guidelines "
            f"under Indian corporate law.\n\n"
            f"[COMPLIANCE_STATUS]\n"
            f"- **General Compliance:** Ensure adherence to statutory filing requirements, board governance, "
            f"and record maintenance as mandated by the Companies Act, 2013. Please ensure the Ollama service "
            f"is running for AI-powered analysis."
        )


@rag_router.post("/search", response_model=List[dict])
async def api_search_index(payload: SearchRequest):
    try:
        results = execute_search(payload.query, payload.top_k)
        if not results:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching legal contexts found inside index.")
        return results
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Search API exception error: {traceback.format_exc()}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@rag_router.post("/generate", response_model=RAGGenerationResponse)
async def api_generate_response(payload: RAGGenerationRequest):
    try:
        analysis_markdown = execute_generation(query=payload.query, results=payload.results, file_excerpt=payload.file_excerpt)
        return RAGGenerationResponse(status="success", analysis=analysis_markdown, raw_markdown=analysis_markdown)
    except Exception as e:
        logger.error(f"Generation API exception error: {traceback.format_exc()}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("LegalBuddy Backend v5 starting...")
    await mongo.connect_db()
    loaded = search_service.load_global_index()
    logger.info(f"FAISS {'ready' if loaded else 'unavailable'}")
    yield
    await mongo.close_db()
    logger.info("Shutdown complete")


def create_app() -> FastAPI:
    config = load_config()

    app = FastAPI(title="LegalBuddy", version="5.0.0", lifespan=lifespan)

    @app.middleware("http")
    async def bypass_auth_middleware(request: Request, call_next):
        incoming_path = request.url.path.lower()
        if "auth/login" in incoming_path:
            logger.info(f"Middleware Intercept: Short-circuiting auth logic for path: {request.url.path}")
            return JSONResponse(
                content={
                    "access_token": "mock_production_level_jwt_token_string",
                    "user_id": "system_developer_admin_id",
                    "email": "Harpreet21@gmail.com",
                    "status": "active",
                    "scope": "authorization_context"
                },
                status_code=200,
                headers={
                    "Access-Control-Allow-Origin": "http://localhost:5173",
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Allow-Methods": "*"
                }
            )
        return await call_next(request)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"]
    )

    app.include_router(auth_router)
    app.include_router(document_router)
    app.include_router(summarize_router)
    app.include_router(result_router)
    app.include_router(rag_router)

    try:
        from backend.app.api.dependencies import get_current_user
        async def mock_current_user():
            return {"email": "Harpreet21@gmail.com", "user_id": "system_developer_admin_id"}
        app.dependency_overrides[get_current_user] = mock_current_user
        logger.info("Active local development authorization bypass successfully established.")
    except Exception as e:
        logger.warning(f"Auth dependency override skipped: {e}")

    @app.get("/health", tags=["infra"])
    async def health():
        return {
            "status": "ok",
            "version": "5.0.0",
            "knowledge_base": "loaded" if search_service.is_index_loaded() else "unavailable",
        }

    @app.get("/", tags=["infra"])
    async def root():
        return {"message": "LegalBuddy Backend v5", "docs": "/docs"}

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    logger.info("Launching production-grade LegalBuddy framework instance...")
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=5000, reload=True)