import hmac
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .config import Settings, get_settings
from .database import get_db
from .models import Session, User
from .security import token_hash, verify_session_cookie


@dataclass
class AuthContext:
    user: User
    session: Session


async def current_auth(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    raw_token = verify_session_cookie(request.cookies.get(settings.session_cookie_name), settings.secret_key)
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    result = await db.execute(
        select(Session).options(selectinload(Session.user)).where(Session.token_hash == token_hash(raw_token))
    )
    session = result.scalar_one_or_none()
    if not session or session.expires_at.replace(tzinfo=UTC) <= datetime.now(UTC) or not session.user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    return AuthContext(user=session.user, session=session)


async def optional_auth(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthContext | None:
    """Return a valid session when present, while keeping public reads public."""
    raw_token = verify_session_cookie(request.cookies.get(settings.session_cookie_name), settings.secret_key)
    if not raw_token:
        return None
    result = await db.execute(
        select(Session).options(selectinload(Session.user)).where(Session.token_hash == token_hash(raw_token))
    )
    session = result.scalar_one_or_none()
    if not session or session.expires_at.replace(tzinfo=UTC) <= datetime.now(UTC) or not session.user.is_active:
        return None
    return AuthContext(user=session.user, session=session)


async def csrf_protected(
    request: Request,
    auth: AuthContext = Depends(current_auth),
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    header = request.headers.get("x-csrf-token", "")
    cookie = request.cookies.get(settings.csrf_cookie_name, "")
    if not header or not cookie or not hmac.compare_digest(header, cookie) or not hmac.compare_digest(header, auth.session.csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")
    return auth
