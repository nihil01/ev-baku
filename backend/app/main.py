from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .database import create_schema
from .routers import auth, listings, media
from .storage import ObjectStorage

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_schema()
    storage = ObjectStorage(settings)
    await storage.initialize()
    app.state.storage = storage
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


@app.middleware("http")
async def request_guards(request: Request, call_next):
    if (
        not settings.cors_allow_all
        and request.method in {"POST", "PATCH", "PUT", "DELETE"}
    ):
        origin = request.headers.get("origin")

        if origin and origin.rstrip("/") not in settings.allowed_origins:
            return JSONResponse(
                status_code=403,
                content={"detail": "Origin not allowed"},
            )

    content_length = request.headers.get("content-length")
    max_request = (settings.max_video_mb + 2) * 1024 * 1024
    if content_length:
        try:
            if int(content_length) > max_request:
                return JSONResponse(status_code=413, content={"detail": "Request is too large"})
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length"})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "database": "sqlite" if settings.database_url.startswith("sqlite") else "postgresql", "storage": settings.storage_backend}


app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(listings.router, prefix=settings.api_prefix)
app.include_router(media.router, prefix=settings.api_prefix)
