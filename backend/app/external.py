import asyncio
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

import httpx
from fastapi import HTTPException

from .config import Settings
from .models import Currency

PLACE_CATEGORIES = (
    "commercial.supermarket,commercial.convenience,"
    "healthcare.pharmacy,commercial.health_and_beauty.pharmacy,"
    "healthcare.hospital,healthcare.clinic_or_praxis,"
    "education.school,childcare.kindergarten,"
    "public_transport.subway,public_transport.bus,"
    "leisure.park,leisure.playground"
)

PLACE_CATEGORY_PREFIXES = (
    "commercial.supermarket",
    "commercial.convenience",
    "healthcare.pharmacy",
    "commercial.health_and_beauty.pharmacy",
    "healthcare.hospital",
    "healthcare.clinic_or_praxis",
    "education.school",
    "childcare.kindergarten",
    "public_transport.subway",
    "public_transport.bus",
    "leisure.park",
    "leisure.playground",
)

# west, south, east, north — used by both address suggestions and the map.
BAKU_RECT = "49.65,40.25,50.15,40.65"
BAKU_CENTER = "49.867,40.409"


class GeoapifyService:
    def __init__(self, settings: Settings):
        self.api_key = settings.geoapify_api_key
        self.default_radius = settings.geoapify_radius_meters

    async def nearby(
        self,
        latitude: float,
        longitude: float,
        radius: int | None = None,
        lang: str = "ru",
    ) -> list[dict]:
        if not self.api_key:
            raise HTTPException(status_code=503, detail="Geoapify is not configured")
        distance = max(100, min(radius or self.default_radius, 5000))
        params = {
            "categories": PLACE_CATEGORIES,
            "filter": f"circle:{longitude},{latitude},{distance}",
            "bias": f"proximity:{longitude},{latitude}",
            # Ask for a complete result set, then remove duplicate/unnamed OSM objects ourselves.
            "limit": 100,
            "lang": lang,
            "apiKey": self.api_key,
        }
        try:
            async with httpx.AsyncClient(timeout=12) as client:
                response = await client.get("https://api.geoapify.com/v2/places", params=params, headers={"Accept": "application/json"})
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="Nearby places service is temporarily unavailable") from exc

        places_by_id: dict[str, dict] = {}
        for feature in response.json().get("features", []):
            props = feature.get("properties", {})
            coordinates = feature.get("geometry", {}).get("coordinates", [None, None])
            categories = props.get("categories") or []
            name = str(props.get("name") or "").strip()
            item_distance = round(float(props.get("distance") or 0))
            # Parks and technical OSM ways often have no real public name. They are not useful
            # in a rental listing, so do not replace them with a fake fallback name.
            if not name or item_distance > distance:
                continue
            place_id = str(props.get("place_id") or "")
            if not place_id:
                continue
            category = next(
                (item for item in categories if item.startswith(PLACE_CATEGORY_PREFIXES)),
                categories[0] if categories else "other",
            )
            item = {
                "place_id": place_id,
                "name": name,
                "address": props.get("formatted") or props.get("address_line2"),
                "latitude": props.get("lat", coordinates[1] if len(coordinates) > 1 else None),
                "longitude": props.get("lon", coordinates[0] if coordinates else None),
                "distance_meters": item_distance,
                "categories": categories,
                "category": category,
            }
            existing = places_by_id.get(place_id)
            if existing is None or item["distance_meters"] < existing["distance_meters"]:
                places_by_id[place_id] = item
        return sorted(places_by_id.values(), key=lambda item: item["distance_meters"])

    async def address_autocomplete(self, query: str, lang: str = "ru") -> list[dict]:
        if not self.api_key:
            raise HTTPException(status_code=503, detail="Geoapify is not configured")
        params = {
            "text": query,
            "filter": f"rect:{BAKU_RECT}",
            "bias": f"proximity:{BAKU_CENTER}",
            "limit": 8,
            "lang": lang,
            "apiKey": self.api_key,
        }
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.get(
                    "https://api.geoapify.com/v1/geocode/autocomplete",
                    params=params,
                    headers={"Accept": "application/json"},
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="Address search service is temporarily unavailable") from exc

        suggestions: list[dict] = []
        seen: set[str] = set()
        for feature in response.json().get("features", []):
            props = feature.get("properties", {})
            coordinates = feature.get("geometry", {}).get("coordinates", [])
            longitude = props.get("lon", coordinates[0] if len(coordinates) > 0 else None)
            latitude = props.get("lat", coordinates[1] if len(coordinates) > 1 else None)
            label = str(props.get("formatted") or "").strip()
            place_id = str(props.get("place_id") or f"{longitude}:{latitude}")
            if not label or latitude is None or longitude is None or place_id in seen:
                continue
            seen.add(place_id)
            suggestions.append({
                "place_id": place_id,
                "label": label,
                "street": props.get("street"),
                "house_number": props.get("housenumber"),
                "district": props.get("district") or props.get("suburb"),
                "latitude": float(latitude),
                "longitude": float(longitude),
            })
        return suggestions


class ExchangeRateService:
    def __init__(self, settings: Settings):
        self.api_key = settings.exchange_rate_api_key
        self.cache_seconds = settings.exchange_rate_cache_seconds
        self._rates: dict[str, Decimal] | None = None
        self._expires_at: datetime | None = None
        self._lock = asyncio.Lock()

    async def rates(self) -> dict[str, Decimal]:
        now = datetime.now(UTC)
        if self._rates and self._expires_at and self._expires_at > now:
            return self._rates
        if not self.api_key:
            raise HTTPException(status_code=503, detail="ExchangeRate API is not configured")
        async with self._lock:
            now = datetime.now(UTC)
            if self._rates and self._expires_at and self._expires_at > now:
                return self._rates
            try:
                async with httpx.AsyncClient(timeout=12) as client:
                    response = await client.get(f"https://v6.exchangerate-api.com/v6/{self.api_key}/latest/AZN")
                    response.raise_for_status()
                    payload = response.json()
            except httpx.HTTPError as exc:
                raise HTTPException(status_code=502, detail="Exchange rate service is temporarily unavailable") from exc
            if payload.get("result") != "success":
                raise HTTPException(status_code=502, detail="Exchange rate provider rejected the request")
            source = payload.get("conversion_rates", {})
            self._rates = {code: Decimal(str(source[code])) for code in ("AZN", "USD", "EUR", "RUB") if code in source}
            if set(self._rates) != {"AZN", "USD", "EUR", "RUB"}:
                raise HTTPException(status_code=502, detail="Exchange rate response is incomplete")
            self._expires_at = now + timedelta(seconds=self.cache_seconds)
            return self._rates

    async def to_azn(self, amount: Decimal, currency: Currency) -> Decimal:
        if currency == Currency.AZN:
            return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        rates = await self.rates()
        return (amount / rates[currency.value]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
