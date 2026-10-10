import asyncio
import hashlib
import hmac
import math
import time
from collections import deque
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from .config import Settings


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after: int = 0


class SlidingWindowRateLimiter:
    """Small in-process sliding-window limiter for the single-worker API container."""

    def __init__(self, max_buckets: int = 20_000):
        self._buckets: dict[str, deque[float]] = {}
        self._lock = asyncio.Lock()
        self._max_buckets = max_buckets
        self._operations = 0

    async def consume(self, key: str, limit: int, window_seconds: int) -> RateLimitResult:
        now = time.monotonic()
        cutoff = now - window_seconds
        async with self._lock:
            bucket = self._buckets.setdefault(key, deque())
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                return RateLimitResult(False, max(1, math.ceil(bucket[0] + window_seconds - now)))
            bucket.append(now)
            self._operations += 1
            if self._operations % 512 == 0 or len(self._buckets) > self._max_buckets:
                self._prune(now)
            return RateLimitResult(True)

    def _prune(self, now: float) -> None:
        # Buckets are also pruned precisely on access. This bounded cleanup only
        # prevents forgotten identities from accumulating indefinitely.
        stale_before = now - 3600
        stale = [key for key, values in self._buckets.items() if not values or values[-1] < stale_before]
        for key in stale:
            self._buckets.pop(key, None)
        if len(self._buckets) > self._max_buckets:
            oldest = sorted(self._buckets, key=lambda key: self._buckets[key][-1])
            for key in oldest[:len(self._buckets) - self._max_buckets]:
                self._buckets.pop(key, None)


def client_identity(request: Request, settings: Settings) -> str:
    # Uvicorn resolves X-Forwarded-For only from its configured trusted proxy.
    # The API port is loopback-only in production, so raw public clients cannot
    # inject forwarding headers directly into the application.
    address = request.client.host if request.client else "unknown"
    return private_identity("ip", address, settings)


def private_identity(namespace: str, value: str, settings: Settings) -> str:
    return hmac.new(
        settings.secret_key.encode("utf-8"),
        f"{namespace}:{value}".encode(),
        hashlib.sha256,
    ).hexdigest()


async def enforce_rate_limit(
    request: Request,
    *,
    bucket: str,
    identity: str,
    limit: int,
    window_seconds: int,
) -> None:
    limiter: SlidingWindowRateLimiter = request.app.state.rate_limiter
    result = await limiter.consume(f"{bucket}:{identity}", limit, window_seconds)
    if not result.allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
            headers={"Retry-After": str(result.retry_after)},
        )
