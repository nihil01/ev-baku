import hashlib
import math
import re
from collections.abc import Iterable

import httpx

from .config import Settings
from .models import Listing

DISTRICT_NAMES = {
    "sabail": "Səbail Sabail Сабаиль море центр",
    "yasamal": "Yasamal Ясамал парк университет",
    "nasimi": "Nəsimi Nasimi Насими центр",
    "narimanov": "Nərimanov Narimanov Нариманов",
    "khatai": "Xətai Khatai Хатаи",
    "nizami": "Nizami Низами",
}


class EmbeddingService:
    """Small OpenAI-compatible adapter. Without a key the application uses text search."""

    def __init__(self, settings: Settings):
        self.api_key = settings.openai_api_key
        self.base_url = settings.openai_base_url.rstrip("/")
        self.model = settings.openai_embedding_model
        self.timeout = settings.openai_timeout_seconds

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    async def embed(self, text: str) -> list[float] | None:
        vectors = await self.embed_many([text])
        return vectors[0] if vectors else None

    async def embed_many(self, texts: list[str]) -> list[list[float]] | None:
        clean = [text for text in texts if text.strip()]
        if not self.api_key or not clean:
            return None
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/embeddings",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json={"model": self.model, "input": clean, "encoding_format": "float"},
                )
                response.raise_for_status()
                data = sorted(response.json()["data"], key=lambda item: item["index"])
                vectors = [[float(value) for value in item["embedding"]] for item in data]
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
            # AI is an enhancement: provider downtime must not break listing CRUD/search.
            return None
        return vectors if len(vectors) == len(clean) else None


def listing_embedding_text(listing: Listing) -> str:
    amenities = [
        label
        for enabled, label in (
            (listing.furnished, "furnished меблированная mebelli"),
            (listing.has_elevator, "elevator лифт lift"),
            (listing.has_balcony, "balcony балкон balkon"),
            (listing.has_parking, "parking парковка parkinq"),
            (listing.has_air_conditioning, "air conditioning кондиционер kondisioner"),
            (listing.has_heating, "heating отопление istilik"),
            (listing.pets_allowed, "pets allowed можно с животными"),
            (listing.utilities_included, "utilities included коммунальные включены"),
        )
        if enabled
    ]
    nearby_categories = " ".join(
        str(place.get("category", ""))
        for place in (listing.nearby_places or [])
    )
    nearby = [
        label
        for prefix, label in (
            ("public_transport.subway", "metro subway метро рядом metronun yaxınlığında"),
            ("public_transport.bus", "bus stop автобусная остановка рядом avtobus dayanacağı"),
            ("commercial.supermarket", "supermarket market магазин рядом market yaxınlıqda"),
            ("commercial.convenience", "grocery convenience store магазин рядом market yaxınlıqda"),
            ("healthcare.pharmacy", "pharmacy аптека рядом aptek yaxınlıqda"),
            ("healthcare.hospital", "hospital clinic больница клиника рядом xəstəxana klinika"),
            ("healthcare.clinic_or_praxis", "clinic медицина рядом klinika yaxınlıqda"),
            ("education.school", "school школа рядом məktəb yaxınlıqda"),
            ("education.university", "university university campus университет рядом universitet yaxınlıqda"),
            ("childcare.kindergarten", "kindergarten детский сад рядом uşaq bağçası"),
            ("catering.restaurant", "restaurant ресторан рядом restoran yaxınlıqda"),
            ("catering.cafe", "cafe coffee кофейня рядом kafe yaxınlıqda"),
            ("commercial.shopping_mall", "shopping mall торговый центр рядом ticarət mərkəzi"),
            ("leisure.park", "park парк рядом park yaxınlıqda"),
        )
        if prefix in nearby_categories
    ]
    district = listing.district.value
    return "\n".join(
        part
        for part in (
            listing.title,
            listing.description,
            listing.address,
            DISTRICT_NAMES.get(district, district),
            listing.property_type.value,
            f"{listing.rooms} rooms {listing.bedrooms} bedrooms {listing.area_sqm} square meters",
            " ".join(amenities),
            " ".join(nearby),
        )
        if part
    )


def source_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def cosine_similarity(left: Iterable[float], right: Iterable[float]) -> float:
    a = list(left)
    b = list(right)
    if not a or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


def text_similarity(query: str, listing: Listing) -> float:
    words = set(re.findall(r"[^\W_]+", query.casefold(), flags=re.UNICODE))
    if not words:
        return 0.0
    title = listing.title.casefold()
    description = listing.description.casefold()
    metadata = " ".join((listing.address, DISTRICT_NAMES.get(listing.district.value, ""), listing.property_type.value)).casefold()
    score = 0.0
    for word in words:
        if word in title:
            score += 4
        if word in metadata:
            score += 3
        if word in description:
            score += 1
    return score / len(words)
