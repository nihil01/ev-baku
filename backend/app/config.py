from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_parse_none_str="null",
        extra="ignore",
    )

    cors_allow_all: bool

    app_name: str
    environment: str
    api_prefix: str
    secret_key: str = Field(min_length=32)

    database_url: str
    cors_origins: str
    trusted_hosts: str

    session_cookie_name: str
    csrf_cookie_name: str
    session_ttl_days: int
    cookie_secure: bool
    cookie_domain: str | None

    storage_backend: str
    local_storage_path: Path
    landing_video_path: Path

    minio_endpoint: str
    minio_public_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    minio_bucket: str
    minio_region: str
    minio_secure: bool
    minio_public_secure: bool

    max_image_mb: int
    max_video_mb: int

    geoapify_api_key: str | None
    geoapify_radius_meters: int
    exchange_rate_provider: str
    exchange_rate_api_key: str | None
    exchange_rate_base_url: str | None
    exchange_rate_cache_seconds: int

    openai_api_key: str | None
    openai_base_url: str
    openai_embedding_model: str
    openai_transcription_model: str
    openai_timeout_seconds: float

    guest_ai_request_limit: int = Field(ge=1, le=100)
    max_voice_mb: int = Field(ge=1, le=25)

    @classmethod
    def settings_customise_sources(
            cls,
            settings_cls: type[BaseSettings],
            init_settings: PydanticBaseSettingsSource,
            env_settings: PydanticBaseSettingsSource,
            dotenv_settings: PydanticBaseSettingsSource,
            file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (env_settings, dotenv_settings)

    @property
    def allowed_origins(self) -> list[str]:
        return [
            value.strip().rstrip("/")
            for value in self.cors_origins.split(",")
            if value.strip()
        ]

    @property
    def allowed_hosts(self) -> list[str]:
        return [
            value.strip()
            for value in self.trusted_hosts.split(",")
            if value.strip()
        ]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
