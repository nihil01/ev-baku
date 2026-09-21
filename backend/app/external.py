import asyncio
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

import httpx
from fastapi import HTTPException

from .config import Settings
from .models import Currency

PLACE_CATEGORIES = (
    "commercial.supermarket,public_transport,education,healthcare,"
    "leisure.park,tourism.sights,catering"
)


class GeoapifyService:
    def __init__(self, settings: Settings):
        self.api_key = settings.geoapify_api_key
        self.default_radius = settings.geoapify_radius_meters

    async def nearby(self, latitude: float, longitude: float, radius: int | None = None, limit: int = 30) -> list[dict]:
        if not self.api_key:
            raise HTTPException(status_code=503, detail="Geoapify is not configured")
        distance = max(100, min(radius or self.default_radius, 5000))
        params = {
            "categories": PLACE_CATEGORIES,
            "filter": f"circle:{longitude},{latitude},{distance}",
            "bias": f"proximity:{longitude},{latitude}",
            "limit": min(limit, 50),
            "apiKey": self.api_key,
        }
        try:
            async with httpx.AsyncClient(timeout=12) as client:
                response = await client.get("https://api.geoapify.com/v2/places", params=params, headers={"Accept": "application/json"})
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="Nearby places service is temporarily unavailable") from exc

        places = []
        for feature in response.json().get("features", []):
            props = feature.get("properties", {})
            coordinates = feature.get("geometry", {}).get("coordinates", [None, None])
            categories = props.get("categories") or []
            places.append({
                "place_id": props.get("place_id") or f"{coordinates}",
                "name": props.get("name") or props.get("address_line1") or props.get("formatted") or "Nearby place",
                "address": props.get("formatted") or props.get("address_line2"),
                "latitude": props.get("lat", coordinates[1] if len(coordinates) > 1 else None),
                "longitude": props.get("lon", coordinates[0] if coordinates else None),
                "distance_meters": round(float(props.get("distance") or 0)),
                "categories": categories,
                "category": next((item for item in categories if item.startswith(("commercial.supermarket", "public_transport", "education", "healthcare", "leisure.park", "tourism.sights", "catering"))), categories[0] if categories else "other"),
            })
        return sorted(places, key=lambda item: item["distance_meters"])


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
