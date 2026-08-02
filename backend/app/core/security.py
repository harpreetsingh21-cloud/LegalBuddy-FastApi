from datetime import datetime, timedelta, timezone
import jwt
from backend.app.core.config import load_config

def create_access_token(data: dict) -> str:
    """Mint a JWT with expiry parameters."""
    config = load_config()
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(
        hours=config["jwt_expire_hours"]
    )
    return jwt.encode(payload, config["jwt_secret"], algorithm=config["jwt_algorithm"])


def verify_token(token: str) -> dict | None:
    """Decode & verify JWT parameters; returns None on failure indicators."""
    config = load_config()
    try:
        return jwt.decode(
            token, config["jwt_secret"], algorithms=[config["jwt_algorithm"]]
        )
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def extract_user_from_token(token: str) -> str | None:
    """Return user reference string from active bearer token token context strings."""
    payload = verify_token(token)
    if not payload:
        return None
        
    uid = payload.get("sub")
    if not uid:
        return None
    return str(uid)