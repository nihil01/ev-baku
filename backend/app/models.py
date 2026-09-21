import enum
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"


class ListingStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class PropertyType(str, enum.Enum):
    studio = "studio"
    apartment = "apartment"
    house = "house"
    villa = "villa"


class District(str, enum.Enum):
    sabail = "sabail"
    yasamal = "yasamal"
    nasimi = "nasimi"
    narimanov = "narimanov"
    khatai = "khatai"
    nizami = "nizami"


class MediaType(str, enum.Enum):
    image = "image"
    floor_plan = "floor_plan"
    video = "video"


class Currency(str, enum.Enum):
    AZN = "AZN"
    USD = "USD"
    EUR = "EUR"
    RUB = "RUB"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    telegram: Mapped[str | None] = mapped_column(String(64), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(64), nullable=True)
    show_full_name: Mapped[bool] = mapped_column(Boolean, default=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.user)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    listings: Mapped[list["Listing"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    sessions: Mapped[list["Session"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    user: Mapped[User] = relationship(back_populates="sessions")


class Listing(Base):
    __tablename__ = "listings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[ListingStatus] = mapped_column(Enum(ListingStatus), default=ListingStatus.draft, index=True)

    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    property_type: Mapped[PropertyType] = mapped_column(Enum(PropertyType), index=True)
    district: Mapped[District] = mapped_column(Enum(District), index=True)
    address: Mapped[str] = mapped_column(String(300))
    latitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))

    monthly_rent: Mapped[Decimal] = mapped_column(Numeric(12, 2), index=True)
    rent_currency: Mapped[Currency] = mapped_column(Enum(Currency), default=Currency.AZN)
    monthly_rent_azn: Mapped[Decimal] = mapped_column(Numeric(12, 2), index=True)
    deposit: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    area_sqm: Mapped[Decimal] = mapped_column(Numeric(8, 2), index=True)
    rooms: Mapped[int] = mapped_column(Integer)
    bedrooms: Mapped[int] = mapped_column(Integer, default=0)
    bathrooms: Mapped[int] = mapped_column(Integer, default=1)
    max_guests: Mapped[int] = mapped_column(Integer, default=1)
    furnished: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    floor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_floors: Mapped[int | None] = mapped_column(Integer, nullable=True)

    has_elevator: Mapped[bool] = mapped_column(Boolean, default=False)
    has_balcony: Mapped[bool] = mapped_column(Boolean, default=False)
    has_parking: Mapped[bool] = mapped_column(Boolean, default=False)
    has_air_conditioning: Mapped[bool] = mapped_column(Boolean, default=False)
    has_heating: Mapped[bool] = mapped_column(Boolean, default=False)
    pets_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    smoking_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    utilities_included: Mapped[bool] = mapped_column(Boolean, default=False)
    minimum_lease_months: Mapped[int] = mapped_column(Integer, default=1)
    available_from: Mapped[date | None] = mapped_column(Date, nullable=True)

    contact_name: Mapped[str] = mapped_column(String(120))
    contact_phone: Mapped[str] = mapped_column(String(32))
    show_contact_name: Mapped[bool] = mapped_column(Boolean, default=True)
    contact_telegram: Mapped[str | None] = mapped_column(String(64), nullable=True)
    contact_whatsapp: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    owner: Mapped[User] = relationship(back_populates="listings")
    media: Mapped[list["ListingMedia"]] = relationship(back_populates="listing", cascade="all, delete-orphan", order_by="ListingMedia.sort_order")


class ListingMedia(Base):
    __tablename__ = "listing_media"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    listing_id: Mapped[str] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    media_type: Mapped[MediaType] = mapped_column(Enum(MediaType))
    object_key: Mapped[str] = mapped_column(String(600), unique=True)
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer)
    original_name: Mapped[str] = mapped_column(String(255))
    caption: Mapped[str | None] = mapped_column(String(240), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_cover: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    listing: Mapped[Listing] = relationship(back_populates="media")


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "listing_id", name="uq_favorite_user_listing"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    listing_id: Mapped[str] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (UniqueConstraint("listing_id", "buyer_id", name="uq_conversation_listing_buyer"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    listing_id: Mapped[str] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    buyer_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
