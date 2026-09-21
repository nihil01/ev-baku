from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import get_settings

settings = get_settings()

if settings.database_url.startswith("sqlite"):
    Path("./data").mkdir(parents=True, exist_ok=True)

engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)
if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine.sync_engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def create_schema() -> None:
    from . import models  # noqa: F401

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        if settings.database_url.startswith("sqlite"):
            await _migrate_sqlite(connection)


async def _migrate_sqlite(connection) -> None:
    """Small additive migration for local SQLite installs; production should use Alembic."""
    additions = {
        "users": {
            "telegram": "VARCHAR(64)",
            "whatsapp": "VARCHAR(64)",
            "show_full_name": "BOOLEAN NOT NULL DEFAULT 1",
        },
        "listings": {
            "rent_currency": "VARCHAR(3) NOT NULL DEFAULT 'AZN'",
            "monthly_rent_azn": "NUMERIC(12, 2)",
            "show_contact_name": "BOOLEAN NOT NULL DEFAULT 1",
            "contact_telegram": "VARCHAR(64)",
            "contact_whatsapp": "VARCHAR(64)",
        },
    }
    for table, columns in additions.items():
        existing = {row[1] for row in (await connection.execute(text(f"PRAGMA table_info({table})"))).all()}
        for name, definition in columns.items():
            if name not in existing:
                await connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}"))
    await connection.execute(text("UPDATE listings SET monthly_rent_azn = monthly_rent WHERE monthly_rent_azn IS NULL"))
