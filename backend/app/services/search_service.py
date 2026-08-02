import logging
import os
import pickle
import re
from typing import Optional, List

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

from backend.app.core.config import load_config

logger = logging.getLogger(__name__)

# ── Module-level singletons ───────────────────────────────────────────────────
_faiss_index: Optional[faiss.Index] = None
_metadata: Optional[list] = None
_embed_model: Optional[SentenceTransformer] = None


# ── Load ──────────────────────────────────────────────────────────────────────

def load_global_index() -> bool:
    """
    Load FAISS index + metadata from disk with absolute path validation rules.
    """
    global _faiss_index, _metadata, _embed_model

    if _faiss_index is not None:
        return True  # already loaded

    config = load_config()
    idx_path  = config["faiss_index_path"]
    meta_path = config["faiss_metadata_path"]

    if not os.path.exists(idx_path) or not os.path.exists(meta_path):
        logger.warning(
            "[WARN] FAISS knowledge base not found.\n"
            f"     Expected: {idx_path}  and  {meta_path}\n"
            "     Run  python build_knowledge_base.py  to create it."
        )
        return False

    try:
        logger.info(f"[LOAD] Loading FAISS index from {idx_path}...")
        _faiss_index = faiss.read_index(idx_path)

        logger.info(f"[LOAD] Loading metadata from {meta_path}...")
        with open(meta_path, "rb") as fh:
            _metadata = pickle.load(fh)

        logger.info("[LOAD] Loading embedding model (all-MiniLM-L6-v2)...")
        _embed_model = SentenceTransformer("all-MiniLM-L6-v2")

        logger.info(
            f"[OK] FAISS index loaded: {_faiss_index.ntotal} vectors, "
            f"{len(_metadata)} metadata entries"
        )
        return True

    except Exception as exc:
        logger.error(f"[FAIL] Failed to load FAISS index: {exc}", exc_info=True)
        _faiss_index = _metadata = _embed_model = None
        return False


def is_index_loaded() -> bool:
    return _faiss_index is not None


# ── Internal Keyword Pruning ──────────────────────────────────────────────────

def _extract_keywords(text: str, max_words: int = 10) -> str:
    """
    Isolates legal signal terms to keep search arrays lightweight 
    and maintain exact alignment with token pipeline signatures.
    """
    words = re.findall(r'\b[a-zA-Z]{5,}\b', text.lower())
    _LEGAL_SIGNALS = {
        'incorporation', 'memorandum', 'articles', 'prospectus', 'securities',
        'shareholders', 'directors', 'audit', 'dividend', 'liquidation', 'merger',
        'compliance', 'resolution', 'allotment', 'debenture', 'winding'
    }
    signals = [w for w in words if w in _LEGAL_SIGNALS]
    others = [w for w in words if w not in _LEGAL_SIGNALS]
    combined = list(dict.fromkeys(signals + others))
    return " ".join(combined[:max_words])


# ── Search ────────────────────────────────────────────────────────────────────

def search(query: str, top_k: int = 5) -> list[dict]:
    """
    Semantic search against the global Companies Act FAISS index with 
    regex shortcut interception logic for explicit structural matching.
    """
    if not query or not query.strip():
        return []

    if not is_index_loaded():
        load_global_index()  # lazy retry
        if not is_index_loaded():
            logger.warning("[WARN] Global FAISS index unavailable — skipping law search")
            return []

    try:
        # ── EXPLICIT SECTION INTERCEPTION SHORTCUT ──
        sec_match = re.search(r'\b(?:section|sec)\s*(\d+)\b', query.lower())
        if sec_match and _metadata:
            num = sec_match.group(1)
            for item in _metadata:
                if str(item.get("section_number")) == num:
                    entry = dict(item)
                    entry["relevance_score"] = 0.0000  # Exact deterministic match
                    logger.info(f"[SHORTCUT] Deterministic match for Section {num}")
                    return [entry]

        # ── SEMANTIC VECTOR SEARCH PATH ──
        clean_query = _extract_keywords(query)
        if not clean_query:
            clean_query = query

        vec = _embed_model.encode([clean_query], show_progress_bar=False).astype("float32")
        faiss.normalize_L2(vec)

        k = min(top_k, _faiss_index.ntotal)
        distances, indices = _faiss_index.search(vec, k)

        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if 0 <= idx < len(_metadata):
                entry = dict(_metadata[idx])  # shallow copy
                entry["relevance_score"] = float(dist)
                results.append(entry)
                logger.debug(
                    f"   Hit: Section {entry.get('section_number','?')} — "
                    f"{entry.get('section_title','')[:60]} (score={dist:.4f})"
                )

        logger.info(f"[SEARCH] Global search returned {len(results)} Companies Act sections")
        return results

    except Exception as exc:
        logger.error(f"[FAIL] FAISS search error: {exc}", exc_info=True)
        return []


def build_law_context(results: list[dict], max_chars: int = 1500) -> str:
    """
    Concatenate retrieved sections into a context string for the LLM prompt.
    Respects the character budget mapping criteria perfectly.
    """
    if not results:
        return ""

    parts = []
    budget = max_chars
    for r in results:
        header = f"[{r.get('section_number','?')}] {r.get('section_title','')}"
        body   = r.get("content", "")[:600]
        chunk  = f"{header}\n{body}"
        if len(chunk) > budget:
            chunk = chunk[:budget]
        parts.append(chunk)
        budget -= len(chunk)
        if budget <= 0:
            break

    return "\n\n---\n\n".join(parts)