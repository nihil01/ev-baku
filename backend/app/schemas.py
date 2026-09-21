from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer, field_validator

from .models import Currency, District, ListingStatus, MediaType, PropertyType, UserRole


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=32)

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        if not any(char.isalpha() for char in value) or not any(char.isdigit() for char in value):
            raise ValueError("Password must contain letters and numbers")
        return value


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str
    phone: str | None
    telegram: str | None
    whatsapp: str | None
    show_full_name: bool
    role: UserRole
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserRead
    csrf_token: str


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=32)
    telegram: str | None = Field(default=None, max_length=64)
    whatsapp: str | None = Field(default=None, max_length=64)
    show_full_name: bool | None = None


class ListingBase(BaseModel):
    title: str = Field(min_length=5, max_length=160)
    description: str = Field(min_length=20, max_length=5000)
    property_type: PropertyType
    district: District
    address: str = Field(min_length=5, max_length=300)
    latitude: Decimal = Field(ge=Decimal("40.25"), le=Decimal("40.65"))
    longitude: Decimal = Field(ge=Decimal("49.65"), le=Decimal("50.15"))
    monthly_rent: Decimal = Field(gt=0, le=1_000_000)
    rent_currency: Currency = Currency.AZN
    deposit: Decimal | None = Field(default=None, ge=0, le=1_000_000)
    area_sqm: Decimal = Field(gt=5, le=10_000)
    rooms: int = Field(ge=0, le=50)
    bedrooms: int = Field(default=0, ge=0, le=50)
    bathrooms: int = Field(default=1, ge=1, le=20)
    max_guests: int = Field(default=1, ge=1, le=100)
    furnished: bool = False
    floor: int | None = Field(default=None, ge=-5, le=200)
    total_floors: int | None = Field(default=None, ge=1, le=200)
    has_elevator: bool = False
    has_balcony: bool = False
    has_parking: bool = False
    has_air_conditioning: bool = False
    has_heating: bool = False
    pets_allowed: bool = False
    smoking_allowed: bool = False
    utilities_included: bool = False
    minimum_lease_months: int = Field(default=1, ge=1, le=120)
    available_from: date | None = None
    contact_name: str = Field(min_length=2, max_length=120)
    contact_phone: str = Field(min_length=5, max_length=32)
    show_contact_name: bool = True
    contact_telegram: str | None = Field(default=None, max_length=64)
    contact_whatsapp: str | None = Field(default=None, max_length=64)

    @field_serializer("latitude", "longitude", "monthly_rent", "deposit", "area_sqm", when_used="json")
    def serialize_decimals(self, value: Decimal | None) -> float | None:
        return float(value) if value is not None else None

    @field_validator("total_floors")
    @classmethod
    def validate_floors(cls, total_floors: int | None, info):
        floor = info.data.get("floor")
        if floor is not None and total_floors is not None and floor > total_floors:
            raise ValueError("floor cannot be greater than total_floors")
        return total_floors


class ListingCreate(ListingBase):
    pass


class ListingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=5, max_length=160)
    description: str | None = Field(default=None, min_length=20, max_length=5000)
    property_type: PropertyType | None = None
    district: District | None = None
    address: str | None = Field(default=None, min_length=5, max_length=300)
    latitude: Decimal | None = Field(default=None, ge=Decimal("40.25"), le=Decimal("40.65"))
    longitude: Decimal | None = Field(default=None, ge=Decimal("49.65"), le=Decimal("50.15"))
    monthly_rent: Decimal | None = Field(default=None, gt=0, le=1_000_000)
    rent_currency: Currency | None = None
    deposit: Decimal | None = Field(default=None, ge=0, le=1_000_000)
    area_sqm: Decimal | None = Field(default=None, gt=5, le=10_000)
    rooms: int | None = Field(default=None, ge=0, le=50)
    bedrooms: int | None = Field(default=None, ge=0, le=50)
    bathrooms: int | None = Field(default=None, ge=1, le=20)
    max_guests: int | None = Field(default=None, ge=1, le=100)
    furnished: bool | None = None
    floor: int | None = Field(default=None, ge=-5, le=200)
    total_floors: int | None = Field(default=None, ge=1, le=200)
    has_elevator: bool | None = None
    has_balcony: bool | None = None
    has_parking: bool | None = None
    has_air_conditioning: bool | None = None
    has_heating: bool | None = None
    pets_allowed: bool | None = None
    smoking_allowed: bool | None = None
    utilities_included: bool | None = None
    minimum_lease_months: int | None = Field(default=None, ge=1, le=120)
    available_from: date | None = None
    contact_name: str | None = Field(default=None, min_length=2, max_length=120)
    contact_phone: str | None = Field(default=None, min_length=5, max_length=32)
    show_contact_name: bool | None = None
    contact_telegram: str | None = Field(default=None, max_length=64)
    contact_whatsapp: str | None = Field(default=None, max_length=64)


class MediaRead(BaseModel):
    id: str
    media_type: MediaType
    url: str
    content_type: str
    size_bytes: int
    original_name: str
    caption: str | None
    sort_order: int
    is_cover: bool


class ListingRead(ListingBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    monthly_rent_azn: Decimal
    status: ListingStatus
    media: list[MediaRead]
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None

    @field_serializer("monthly_rent_azn", when_used="json")
    def serialize_azn(self, value: Decimal) -> float:
        return float(value)


class ListingPage(BaseModel):
    items: list[ListingRead]
    total: int
    page: int
    page_size: int


class Message(BaseModel):
    message: str


class NearbyPlace(BaseModel):
    place_id: str
    name: str
    address: str | None
    latitude: float | None
    longitude: float | None
    distance_meters: int
    categories: list[str]
    category: str


class ExchangeRatesRead(BaseModel):
    base: str = "AZN"
    rates: dict[str, float]


class ChatMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class ChatMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    sender_id: str
    body: str
    created_at: datetime


class ConversationRead(BaseModel):
    id: str
    listing_id: str
    listing_title: str
    counterpart_name: str
    counterpart_id: str
    updated_at: datetime
    last_message: ChatMessageRead | None = None
