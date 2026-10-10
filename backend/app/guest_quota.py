import hashlib
import hmac
from datetime import UTC, datetime

from fastapi import HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings
from .dependencies import AuthContext
from .models import GuestAiUsage


def _client_ip(request: Request) -> str:
    # Uvicorn's ProxyHeadersMiddleware resolves trusted X-Forwarded-For into
    # request.client. Production must only trust the actual reverse proxy.
    return request.client.host if request.client else "unknown"


def _ip_hash(request: Request, settings: Settings) -> str:
    return hmac.new(
        settings.secret_key.encode("utf-8"),
        f"guest-ai:{_client_ip(request)}".encode(),
        hashlib.sha256,
    ).hexdigest()


async def consume_guest_ai_request(
    request: Request,
    auth: AuthContext | None,
    db: AsyncSession,
    settings: Settings,
) -> int | None:
    """Consume one permanent guest allowance and return the remaining count."""
    if auth is not None:
        return None

    ip_hash = _ip_hash(request, settings)
    now = datetime.now(UTC)
    values = {"ip_hash": ip_hash, "request_count": 1, "created_at": now, "updated_at": now}
    dialect = db.bind.dialect.name if db.bind is not None else ""

    if dialect in {"sqlite", "postgresql"}:
        insert = sqlite_insert(GuestAiUsage) if dialect == "sqlite" else postgresql_insert(GuestAiUsage)
        statement = insert.values(**values).on_conflict_do_update(
            index_elements=[GuestAiUsage.ip_hash],
            set_={
                "request_count": GuestAiUsage.request_count + 1,
                "updated_at": now,
            },
            where=GuestAiUsage.request_count < settings.guest_ai_request_limit,
        ).returning(GuestAiUsage.request_count)
        count = (await db.execute(statement)).scalar_one_or_none()
    else:
        usage = (await db.execute(
            select(GuestAiUsage).where(GuestAiUsage.ip_hash == ip_hash).with_for_update()
        )).scalar_one_or_none()
        if usage is None:
            usage = GuestAiUsage(**values)
            db.add(usage)
            count = 1
        elif usage.request_count < settings.guest_ai_request_limit:
            usage.request_count += 1
            usage.updated_at = now
            count = usage.request_count
        else:
            count = None

    if count is None:
        await db.execute(
            update(GuestAiUsage)
            .where(GuestAiUsage.ip_hash == ip_hash, GuestAiUsage.blocked_at.is_(None))
            .values(blocked_at=now, updated_at=now)
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Guest AI search limit reached. Sign in to continue.",
        )

    await db.commit()
    return max(0, settings.guest_ai_request_limit - int(count))
