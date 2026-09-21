from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    cors_allow_all: bool = False

    app_name: str = "ev. Baku API"
    environment: str = "development"
    api_prefix: str = "/api/v1"
    secret_key: str = Field(default="change-me-in-production-please-use-64-random-characters", min_length=32)

    database_url: str = "sqlite+aiosqlite:///./data/ev.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080"
    trusted_hosts: str = "localhost,127.0.0.1,testserver"

    session_cookie_name: str = "ev_session"
    csrf_cookie_name: str = "ev_csrf"
    session_ttl_days: int = 14
    cookie_secure: bool = False
    cookie_domain: str | None = None

    storage_backend: str = "minio"
    local_storage_path: Path = Path("./data/uploads")

    minio_endpoint: str = "garage:3900"
    minio_public_endpoint: str = "localhost:9000"

    minio_access_key: str = "evminio"
    minio_secret_key: str = "evminio-change-me"
    minio_bucket: str = "ev-media"

    minio_region: str = "garage"
    minio_secure: bool = False
    minio_public_secure: bool = False

    max_image_mb: int = 15
    max_video_mb: int = 100

    geoapify_api_key: str | None = None
    geoapify_radius_meters: int = 2000
    exchange_rate_api_key: str | None = None
    exchange_rate_cache_seconds: int = 21600

    @property
    def allowed_origins(self) -> list[str]:
        return [value.strip().rstrip("/") for value in self.cors_origins.split(",") if value.strip()]

    @property
    def allowed_hosts(self) -> list[str]:
        return [value.strip() for value in self.trusted_hosts.split(",") if value.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
