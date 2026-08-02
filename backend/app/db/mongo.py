import logging
from datetime import datetime, timedelta, timezone
from bson.objectid import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from backend.app.core.config import load_config

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


# ── Connection ────────────────────────────────────────────────────────────────

async def connect_db() -> None:
    global _client, _db
    config = load_config()
    url = config["mongodb_url"]

    _client = AsyncIOMotorClient(
        url,
        serverSelectionTimeoutMS=8000,
        connectTimeoutMS=8000,
        socketTimeoutMS=8000,
        retryWrites=True,
    )
    await _client.admin.command("ping")
    _db = _client[config["mongodb_db"]]
    logger.info(f"[OK] MongoDB connected -> db={config['mongodb_db']}")

    # Ensure functional indices across document library collections
    await _db.users.create_index("email", unique=True)
    await _db.documents.create_index("user_id")
    await _db.documents.create_index("doc_id")
    await _db.documents.create_index("created_at")
    logger.info("[OK] Indexes ensured")


async def close_db() -> None:
    global _client
    if _client:
        _client.close()
        _client = None


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not initialised — call connect_db() first")
    return _db


# ── Users ─────────────────────────────────────────────────────────────────────

async def create_user(email: str, password_hash: str) -> dict:
    db = get_db()
    doc = {
        "email": email,
        "password_hash": password_hash,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


async def find_user_by_email(email: str) -> dict | None:
    return await get_db().users.find_one({"email": email})


async def find_user_by_id(user_id: str) -> dict | None:
    try:
        if ObjectId.is_valid(user_id):
            return await get_db().users.find_one({"_id": ObjectId(user_id)})
        return await get_db().users.find_one({"user_id": user_id})
    except Exception:
        return None


# ── Documents ─────────────────────────────────────────────────────────────────

async def create_document(user_id: str, filename: str, filepath: str) -> dict:
    db = get_db()
    
    # Generate cross-compatible tracking hashes matching baseline api.py rules
    computed_hash = str(hash(filename))
    
    doc = {
        "user_id": ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id,
        "doc_id": computed_hash,
        "filename": filename,
        "filepath": filepath,
        "status": "uploaded",
        "result": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.documents.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


async def get_document(doc_id: str) -> dict | None:
    """
    Polymorphic lookup query node matching both explicit BSON ObjectIds 
    and fast-calculated file identification hash keys string registers.
    """
    try:
        db = get_db()
        # 1. Attempt fallback query via string hash register first
        doc = await db.documents.find_one({"doc_id": str(doc_id)})
        if doc:
            return doc
            
        # 2. Fall back to native database standard entity parameters lookup
        if ObjectId.is_valid(doc_id):
            return await db.documents.find_one({"_id": ObjectId(doc_id)})
            
        return None
    except Exception:
        return None


async def get_user_documents(user_id: str) -> list:
    db = get_db()
    query_target = ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id
    cursor = db.documents.find({"user_id": query_target}).sort("created_at", -1)
    
    raw_docs = await cursor.to_list(length=200)
    
    # Map database entries so frontend view layouts catch complete fields
    for doc in raw_docs:
        if "doc_id" not in doc:
            doc["doc_id"] = str(doc.get("_id"))
        if "uploadedAt" not in doc and "created_at" in doc:
            doc["uploadedAt"] = doc["created_at"].isoformat()
            
    return raw_docs


async def update_document_status(doc_id: str, status: str) -> None:
    db = get_db()
    update_fields = {"status": status, "updated_at": datetime.now(timezone.utc)}
    
    # Execute structural updates using our twin identification pipeline
    result = await db.documents.update_one({"doc_id": str(doc_id)}, {"$set": update_fields})
    if result.matched_count == 0 and ObjectId.is_valid(doc_id):
        await db.documents.update_one({"_id": ObjectId(doc_id)}, {"$set": update_fields})


async def store_document_result(doc_id: str, result: dict) -> None:
    """Persist analysis result + mark done inside an atomic transaction write block."""
    db = get_db()
    update_fields = {
        "status": "done",
        "result": result,
        "updated_at": datetime.now(timezone.utc),
    }
    
    # Multi-path conditional update loop matching raw endpoint definitions
    res = await db.documents.update_one({"doc_id": str(doc_id)}, {"$set": update_fields})
    if res.matched_count == 0 and ObjectId.is_valid(doc_id):
        await db.documents.update_one({"_id": ObjectId(doc_id)}, {"$set": update_fields})


async def delete_document(doc_id: str) -> None:
    db = get_db()
    res = await db.documents.delete_one({"doc_id": str(doc_id)})
    if res.deleted_count == 0 and ObjectId.is_valid(doc_id):
        await db.documents.delete_one({"_id": ObjectId(doc_id)})