from contextlib import asynccontextmanager
from urllib.parse import urlsplit

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .ai_search import EmbeddingService
from .config import get_settings
from .database import create_schema
from .external import ExchangeRateService, GeoapifyService
from .rate_limit import SlidingWindowRateLimiter, client_identity
from .routers import auth, external, listings, media, social
from .speech import TranscriptionService
from .storage import ObjectStorage

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_schema()
    storage = ObjectStorage(settings)
    await storage.initialize()
    app.state.storage = storage
    app.state.geoapify = GeoapifyService(settings)
    app.state.exchange_rates = ExchangeRateService(settings)
    app.state.embeddings = EmbeddingService(settings)
    app.state.transcription = TranscriptionService(settings)
    app.state.rate_limiter = SlidingWindowRateLimiter()
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[] if settings.cors_allow_all else settings.allowed_origins,
    allow_origin_regex=r".*" if settings.cors_allow_all else None,
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Accept",
        "Content-Type",
        "X-CSRF-Token",
        "Authorization",
        "X-Requested-With",
    ],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts, www_redirect=False)


def is_same_origin(request: Request, origin: str) -> bool:
    parsed = urlsplit(origin)
    forwarded_host = request.headers.get("x-forwarded-host", "").split(",", 1)[0].strip()
    host = forwarded_host or request.headers.get("host", "")
    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip()
    scheme = forwarded_proto or request.url.scheme
    return parsed.scheme == scheme and parsed.netloc == host


def add_security_headers(request: Request, response: Response) -> Response:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=(self)"
    if request.url.path.startswith(f"{settings.api_prefix}/auth/"):
        response.headers["Cache-Control"] = "no-store"
    if settings.is_production and request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
    return response


@app.middleware("http")
async def request_guards(request: Request, call_next):
    if settings.rate_limit_enabled and request.url.path.startswith(settings.api_prefix):
        limiter: SlidingWindowRateLimiter = request.app.state.rate_limiter
        identity = client_identity(request, settings)
        policies = [(
            "api",
            settings.rate_limit_default_requests,
            settings.rate_limit_default_window_seconds,
        )]
        path = request.url.path
        if path == f"{settings.api_prefix}/auth/login":
            policies.append(("login-ip", settings.rate_limit_auth_requests, settings.rate_limit_auth_window_seconds))
        elif path == f"{settings.api_prefix}/auth/register":
            policies.append(("register-ip", settings.rate_limit_register_requests, settings.rate_limit_register_window_seconds))
        elif path.endswith(("/ai-search", "/voice-search", "/addresses/autocomplete", "/nearby")):
            policies.append(("expensive", settings.rate_limit_expensive_requests, settings.rate_limit_expensive_window_seconds))
        elif request.method in {"POST", "PATCH", "PUT", "DELETE"}:
            policies.append(("write", settings.rate_limit_write_requests, settings.rate_limit_write_window_seconds))

        for bucket, limit, window_seconds in policies:
            result = await limiter.consume(f"{bucket}:{identity}", limit, window_seconds)
            if not result.allowed:
                return add_security_headers(request, JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Please try again later."},
                    headers={"Retry-After": str(result.retry_after)},
                ))

    if (
        not settings.cors_allow_all
        and request.method in {"POST", "PATCH", "PUT", "DELETE"}
    ):
        origin = request.headers.get("origin")

        if origin and not is_same_origin(request, origin) and origin.rstrip("/") not in settings.allowed_origins:
            return add_security_headers(request, JSONResponse(
                status_code=403,
                content={"detail": "Origin not allowed"},
            ))

    content_length = request.headers.get("content-length")
    max_request = (settings.max_video_mb + 2) * 1024 * 1024
    if content_length:
        try:
            if int(content_length) > max_request:
                return add_security_headers(
                    request,
                    JSONResponse(status_code=413, content={"detail": "Request is too large"}),
                )
        except ValueError:
            return add_security_headers(
                request,
                JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"}),
            )
    response = await call_next(request)
    return add_security_headers(request, response)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "database": "sqlite" if settings.database_url.startswith("sqlite") else "postgresql", "storage": settings.storage_backend}


app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(listings.router, prefix=settings.api_prefix)
app.include_router(media.router, prefix=settings.api_prefix)
app.include_router(social.router, prefix=settings.api_prefix)
app.include_router(external.router, prefix=settings.api_prefix)



if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
