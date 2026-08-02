import logging
import bcrypt
from fastapi import HTTPException, status
from backend.app.db import mongo
from backend.app.core.security import create_access_token

logger = logging.getLogger(__name__)


def _hash_password(password: str) -> str:
    """Securely hash a plain text password using bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def _verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain text password against a bcrypt hash signature."""
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


async def signup(email: str, password: str) -> dict:
    """
    Registers a new user inside the database with an automated 
    duplicate verification pass loop.
    """
    if not email or not password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email and password fields are required")

    if len(password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password must be ≥ 8 chars")

    if await mongo.find_user_by_email(email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    pw_hash = _hash_password(password)
    user    = await mongo.create_user(email, pw_hash)
    
    logger.info(f"[OK] New user registered successfully: {email}")
    return {
        "status": "success",
        "user_id": str(user.get("_id")), 
        "email": email,
        "message": "User account created successfully."
    }


async def login(email: str, password: str) -> dict:
    """
    Authenticates credential vectors and mints an encrypted JSON Web Token 
    containing user signature subjects.
    """
    if not email or not password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email and password fields are required")

    user = await mongo.find_user_by_email(email)
    if not user or not _verify_password(password, user.get("password_hash", "")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    # Pass primary identification objects downstream inside token payloads
    user_id_str = str(user.get("_id"))
    token = create_access_token({"sub": user_id_str, "email": email})
    
    logger.info(f"[OK] Login successful: {email}")
    return {
        "status": "success",
        "access_token": token,
        "token_type":   "bearer",
        "user_id":      user_id_str,
        "email":        email,
        "user": {
            "id": user_id_str,
            "name": "Harpreet Singh" if email == "harpreet@example.com" else email.split("@")[0],
            "role": "Lead Developer",
            "email": email
        }
    }