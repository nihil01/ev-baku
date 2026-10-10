from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_serializer, field_validator, model_validator

from .models import (
    ContactMethod,
    Currency,
    District,
    ListingStatus,
    MediaType,
    ParkingType,
    PropertyType,
    ServiceFeePayer,
    UserRole,
)

AZERBAIJANI_MOBILE_PREFIXES = {"10", "50", "51", "55", "60", "70", "77", "99"}


def normalize_azerbaijani_mobile(value: str | None, *, empty_value: str | None = None) -> str | None:
    if value is None:
        return None
    digits = "".join(character for character in value if character in "0123456789")
    if not digits:
        return empty_value
    if digits.startswith("00994"):
        digits = digits[5:]
    elif digits.startswith("994"):
        digits = digits[3:]
    elif digits.startswith("0"):
        digits = digits[1:]
    if len(digits) != 9 or digits[:2] not in AZERBAIJANI_MOBILE_PREFIXES:
        raise ValueError("Enter a valid Azerbaijani mobile number, for example +994 50 123 45 67")
    return f"+994{digits}"


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=32)

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, value: str | None):
        return normalize_azerbaijani_mobile(value)

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
    bio: str | None
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
    bio: str | None = Field(default=None, max_length=1200)

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, value: str | None):
        return normalize_azerbaijani_mobile(value)


class DiscountTier(BaseModel):
    min_months: int = Field(ge=1, le=120)
    discount_percent: Decimal = Field(gt=0, le=50)

    @field_serializer("discount_percent", when_used="json")
    def serialize_percent(self, value: Decimal) -> float:
        return float(value)


class ListingBase(BaseModel):
    title: str = Field(min_length=5, max_length=160)
    description: str = Field(min_length=20, max_length=5000)
    property_type: PropertyType
    district: District
    address: str = Field(min_length=5, max_length=300)
    latitude: Decimal = Field(ge=Decimal("39.78"), le=Decimal("40.80"))
    longitude: Decimal = Field(ge=Decimal("49.15"), le=Decimal("50.55"))
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
    parking_type: ParkingType | None = None
    has_air_conditioning: bool = False
    has_heating: bool = False
    pets_allowed: bool = False
    smoking_allowed: bool = False
    utilities_included: bool = False
    service_fee_payer: ServiceFeePayer = ServiceFeePayer.landlord
    monthly_service_fee: Decimal | None = Field(default=None, gt=0, le=1_000_000)
    minimum_lease_months: int = Field(default=1, ge=1, le=120)
    discount_tiers: list[DiscountTier] = Field(default_factory=list, max_length=8)
    available_from: date | None = None
    contact_name: str = Field(min_length=2, max_length=120)
    contact_phone: str = Field(default="", max_length=32)
    contact_method: ContactMethod = ContactMethod.both
    show_contact_name: bool = True
    contact_telegram: str | None = Field(default=None, max_length=64)
    contact_whatsapp: str | None = Field(default=None, max_length=64)

    @field_validator("contact_phone", mode="before")
    @classmethod
    def validate_contact_phone(cls, value: str | None):
        return normalize_azerbaijani_mobile(value, empty_value="")

    @field_serializer(
        "latitude",
        "longitude",
        "monthly_rent",
        "deposit",
        "area_sqm",
        "monthly_service_fee",
        when_used="json",
    )
    def serialize_decimals(self, value: Decimal | None) -> float | None:
        return float(value) if value is not None else None

    @field_validator("total_floors")
    @classmethod
    def validate_floors(cls, total_floors: int | None, info):
        floor = info.data.get("floor")
        if floor is not None and total_floors is not None and floor > total_floors:
            raise ValueError("floor cannot be greater than total_floors")
        return total_floors

    @model_validator(mode="after")
    def validate_discount_tiers(self):
        months = [tier.min_months for tier in self.discount_tiers]
        if len(months) != len(set(months)):
            raise ValueError("Discount periods must be unique")
        self.discount_tiers.sort(key=lambda tier: tier.min_months)
        if self.contact_method in {ContactMethod.phone, ContactMethod.both} and len(self.contact_phone.strip()) < 5:
            raise ValueError("A phone number is required for the selected contact method")
        if self.parking_type is not None:
            self.has_parking = True
        elif not self.has_parking:
            self.parking_type = None
        if self.service_fee_payer == ServiceFeePayer.tenant and self.monthly_service_fee is None:
            raise ValueError("Monthly service fee is required when the tenant pays it")
        if self.service_fee_payer == ServiceFeePayer.landlord:
            self.monthly_service_fee = None
        return self


class ListingCreate(ListingBase):
    pass


class ListingUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=5, max_length=160)
    description: str | None = Field(default=None, min_length=20, max_length=5000)
    property_type: PropertyType | None = None
    district: District | None = None
    address: str | None = Field(default=None, min_length=5, max_length=300)
    latitude: Decimal | None = Field(default=None, ge=Decimal("39.78"), le=Decimal("40.80"))
    longitude: Decimal | None = Field(default=None, ge=Decimal("49.15"), le=Decimal("50.55"))
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
    parking_type: ParkingType | None = None
    has_air_conditioning: bool | None = None
    has_heating: bool | None = None
    pets_allowed: bool | None = None
    smoking_allowed: bool | None = None
    utilities_included: bool | None = None
    service_fee_payer: ServiceFeePayer | None = None
    monthly_service_fee: Decimal | None = Field(default=None, gt=0, le=1_000_000)
    minimum_lease_months: int | None = Field(default=None, ge=1, le=120)
    discount_tiers: list[DiscountTier] | None = Field(default=None, max_length=8)
    available_from: date | None = None
    contact_name: str | None = Field(default=None, min_length=2, max_length=120)
    contact_phone: str | None = Field(default=None, max_length=32)
    contact_method: ContactMethod | None = None
    show_contact_name: bool | None = None
    contact_telegram: str | None = Field(default=None, max_length=64)
    contact_whatsapp: str | None = Field(default=None, max_length=64)

    @field_validator("contact_phone", mode="before")
    @classmethod
    def validate_contact_phone(cls, value: str | None):
        return normalize_azerbaijani_mobile(value, empty_value="")

    @field_validator("discount_tiers")
    @classmethod
    def validate_discount_tiers(cls, tiers: list[DiscountTier] | None):
        if tiers is None:
            return tiers
        months = [tier.min_months for tier in tiers]
        if len(months) != len(set(months)):
            raise ValueError("Discount periods must be unique")
        return sorted(tiers, key=lambda tier: tier.min_months)

    @model_validator(mode="after")
    def validate_contact_method(self):
        if (
            self.contact_method in {ContactMethod.phone, ContactMethod.both}
            and self.contact_phone is not None
            and len(self.contact_phone.strip()) < 5
        ):
            raise ValueError("A phone number is required for the selected contact method")
        return self


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


class NearbyPlace(BaseModel):
    place_id: str
    name: str
    address: str | None
    latitude: float | None
    longitude: float | None
    distance_meters: int
    categories: list[str]
    category: str


class ListingRead(ListingBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    monthly_rent_azn: Decimal
    status: ListingStatus
    media: list[MediaRead]
    nearby_places: list[NearbyPlace] | None
    nearby_updated_at: datetime | None
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None

    # Public responses redact the stored phone for message-only listings.
    contact_phone: str | None

    @field_serializer("monthly_rent_azn", when_used="json")
    def serialize_azn(self, value: Decimal) -> float:
        return float(value)


class LandlordReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    body: str = Field(min_length=10, max_length=1200)


class LandlordReviewRead(BaseModel):
    id: str
    author_id: str
    author_name: str
    rating: int
    body: str
    created_at: datetime
    updated_at: datetime


class LandlordProfileRead(BaseModel):
    id: str
    display_name: str
    bio: str | None
    created_at: datetime
    rating: float | None
    reviews_count: int
    listings: list[ListingRead]
    reviews: list[LandlordReviewRead]


class ListingPage(BaseModel):
    items: list[ListingRead]
    total: int
    page: int
    page_size: int


class AiSearchResponse(BaseModel):
    items: list[ListingRead]
    total: int
    query: str
    mode: Literal["semantic", "text"]
    answer: str
    guest_requests_remaining: int | None = None
    guest_request_limit: int | None = None


class Message(BaseModel):
    message: str


class AddressSuggestion(BaseModel):
    place_id: str
    label: str
    street: str | None
    house_number: str | None
    district: str | None
    latitude: float
    longitude: float


class ExchangeRatesRead(BaseModel):
    base: str = "AZN"
    rates: dict[str, float]
    provider: str
    updated_at: datetime | None = None


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
    listing_address: str
    listing_district: District
    listing_monthly_rent: float
    listing_rent_currency: Currency
    listing_cover_url: str | None = None
    listing_status: ListingStatus
    counterpart_name: str
    counterpart_id: str
    updated_at: datetime
    last_message: ChatMessageRead | None = None
