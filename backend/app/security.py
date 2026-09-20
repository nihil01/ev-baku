import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import Response
from pwdlib import PasswordHash

from .config import Settings

password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def random_token(bytes_count: int = 32) -> str:
    return secrets.token_urlsafe(bytes_count)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def sign_session_token(token: str, secret: str) -> str:
    signature = hmac.new(secret.encode(), token.encode(), hashlib.sha256).hexdigest()
    return f"{token}.{signature}"


def verify_session_cookie(value: str | None, secret: str) -> str | None:
    if not value or "." not in value:
        return None
    token, signature = value.rsplit(".", 1)
    expected = hmac.new(secret.encode(), token.encode(), hashlib.sha256).hexdigest()
    return token if hmac.compare_digest(signature, expected) else None


def expires_at(days: int) -> datetime:
    return datetime.now(UTC) + timedelta(days=days)


def set_auth_cookies(response: Response, settings: Settings, signed_session: str, csrf_token: str) -> None:
    max_age = settings.session_ttl_days * 24 * 60 * 60
    common = {
        "max_age": max_age,
        "path": "/",
        "secure": settings.cookie_secure,
        "samesite": "lax",
        "domain": settings.cookie_domain,
    }
    response.set_cookie(settings.session_cookie_name, signed_session, httponly=True, **common)
    response.set_cookie(settings.csrf_cookie_name, csrf_token, httponly=False, **common)


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(settings.session_cookie_name, path="/", domain=settings.cookie_domain)
    response.delete_cookie(settings.csrf_cookie_name, path="/", domain=settings.cookie_domain)
