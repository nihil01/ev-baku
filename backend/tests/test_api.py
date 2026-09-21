import os
import tempfile
from pathlib import Path

TEST_DATA = Path(tempfile.mkdtemp(prefix="ev-baku-api-test-"))

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DATA / 'test-ev.db'}"
os.environ["STORAGE_BACKEND"] = "local"
os.environ["LOCAL_STORAGE_PATH"] = str(TEST_DATA / "uploads")
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-the-settings-model"

from fastapi.testclient import TestClient

from app.main import app

LISTING = {
    "title": "Bright apartment near the city center",
    "description": "A furnished long-term rental with a balcony and city access.",
    "property_type": "apartment",
    "district": "yasamal",
    "address": "Huseyn Javid Avenue 25, Baku",
    "latitude": 40.386,
    "longitude": 49.803,
    "monthly_rent": 1400,
    "deposit": 1400,
    "area_sqm": 92,
    "rooms": 3,
    "bedrooms": 2,
    "bathrooms": 1,
    "max_guests": 4,
    "furnished": True,
    "floor": 8,
    "total_floors": 16,
    "has_elevator": True,
    "has_balcony": True,
    "has_parking": False,
    "has_air_conditioning": True,
    "has_heating": True,
    "pets_allowed": False,
    "smoking_allowed": False,
    "utilities_included": False,
    "minimum_lease_months": 6,
    "contact_name": "Test Owner",
    "contact_phone": "+994501112233",
}


class FakeExchangeRates:
    async def rates(self):
        from decimal import Decimal
        return {"AZN": Decimal(1), "USD": Decimal("0.5"), "EUR": Decimal("0.4"), "RUB": Decimal(50)}

    async def to_azn(self, amount, currency):
        rates = await self.rates()
        return amount / rates[currency.value]


class FakeGeoapify:
    async def nearby(self, latitude, longitude, radius=None, lang="ru"):
        return [{
            "place_id": "market-1", "name": "Test Market", "address": "Baku",
            "latitude": latitude, "longitude": longitude, "distance_meters": 240,
            "categories": ["commercial.supermarket"], "category": "commercial.supermarket",
        }]

    async def address_autocomplete(self, query, lang="ru"):
        return [{
            "place_id": "address-1", "label": "Nizami Street 25, Baku, Azerbaijan",
            "street": "Nizami Street", "house_number": "25", "district": "Sabail",
            "latitude": 40.3712, "longitude": 49.8364,
        }]


def test_user_listing_media_publish_flow():
    with TestClient(app) as client:
        registration = client.post("/api/v1/auth/register", json={
            "email": "owner@example.com", "password": "securepass123", "full_name": "Test Owner", "phone": "+994501112233",
        })
        assert registration.status_code == 201, registration.text
        csrf = registration.json()["csrf_token"]
        headers = {"X-CSRF-Token": csrf}

        profile = client.patch("/api/v1/auth/me", headers=headers, json={
            "telegram": "@testowner", "whatsapp": "+994501112233", "show_full_name": False,
        })
        assert profile.status_code == 200, profile.text
        assert profile.json()["telegram"] == "@testowner"

        created = client.post("/api/v1/listings", json=LISTING, headers=headers)
        assert created.status_code == 201, created.text
        listing_id = created.json()["id"]
        assert created.json()["status"] == "draft"
        assert client.post("/api/v1/listings", json=LISTING).status_code == 403
        assert client.post(f"/api/v1/listings/{listing_id}/publish", headers=headers).status_code == 422

        updated = client.patch(
            f"/api/v1/listings/{listing_id}", json={"title": "Updated Baku rental apartment"}, headers=headers
        )
        assert updated.status_code == 200
        assert updated.json()["title"] == "Updated Baku rental apartment"

        uploaded = client.post(
            f"/api/v1/listings/{listing_id}/media",
            headers=headers,
            data={"media_type": "image", "is_cover": "true"},
            files={"file": ("home.jpg", b"\xff\xd8\xff\xd9", "image/jpeg")},
        )
        assert uploaded.status_code == 201, uploaded.text
        first_media_id = uploaded.json()["id"]

        published = client.post(f"/api/v1/listings/{listing_id}/publish", headers=headers)
        assert published.status_code == 200, published.text
        assert published.json()["status"] == "published"

        # Published listings stay published and remain fully editable by their author.
        published_update = client.patch(
            f"/api/v1/listings/{listing_id}",
            json={
                "title": "Updated published apartment in Baku",
                "monthly_rent": 1550,
                "pets_allowed": True,
                "utilities_included": True,
                "minimum_lease_months": 3,
            },
            headers=headers,
        )
        assert published_update.status_code == 200, published_update.text
        assert published_update.json()["status"] == "published"
        assert published_update.json()["monthly_rent"] == 1550
        assert published_update.json()["pets_allowed"] is True

        app.state.exchange_rates = FakeExchangeRates()
        converted = client.patch(
            f"/api/v1/listings/{listing_id}",
            json={"monthly_rent": 1000, "rent_currency": "USD"}, headers=headers,
        )
        assert converted.status_code == 200, converted.text
        assert converted.json()["monthly_rent_azn"] == 2000
        assert client.get("/api/v1/listings?price_min=1999&price_max=2001").json()["total"] == 1

        second_upload = client.post(
            f"/api/v1/listings/{listing_id}/media",
            headers=headers,
            data={"media_type": "image", "is_cover": "false"},
            files={"file": ("second.jpg", b"\xff\xd8\xff\xd9", "image/jpeg")},
        )
        assert second_upload.status_code == 201, second_upload.text
        second_media_id = second_upload.json()["id"]
        cover = client.post(f"/api/v1/media/{second_media_id}/cover", headers=headers)
        assert cover.status_code == 200, cover.text
        assert cover.json()["is_cover"] is True
        assert client.delete(f"/api/v1/media/{first_media_id}", headers=headers).status_code == 200
        last_photo_delete = client.delete(f"/api/v1/media/{second_media_id}", headers=headers)
        assert last_photo_delete.status_code == 422

        public = client.get("/api/v1/listings?district=yasamal")
        assert public.status_code == 200
        assert public.json()["total"] == 1
        assert public.json()["items"][0]["title"] == "Updated published apartment in Baku"
        assert public.json()["items"][0]["utilities_included"] is True
        assert public.json()["items"][0]["media"][0]["url"].startswith("/api/v1/media/")

        app.state.geoapify = FakeGeoapify()
        nearby = client.get(f"/api/v1/listings/{listing_id}/nearby?radius=1000&lang=en")
        assert nearby.status_code == 200
        assert nearby.json()[0]["distance_meters"] == 240
        addresses = client.get("/api/v1/addresses/autocomplete?q=nizami&lang=en")
        assert addresses.status_code == 200
        assert addresses.json()[0]["longitude"] == 49.8364

        with TestClient(app) as buyer:
            buyer_registration = buyer.post("/api/v1/auth/register", json={
                "email": "buyer@example.com", "password": "securepass123", "full_name": "Test Buyer",
            })
            buyer_headers = {"X-CSRF-Token": buyer_registration.json()["csrf_token"]}
            assert buyer.post(f"/api/v1/listings/{listing_id}/favorite", headers=buyer_headers).status_code == 201
            assert buyer.get("/api/v1/me/favorites").json()[0]["id"] == listing_id
            conversation = buyer.post(f"/api/v1/listings/{listing_id}/conversations", headers=buyer_headers)
            assert conversation.status_code == 200, conversation.text
            conversation_id = conversation.json()["id"]
            sent = buyer.post(
                f"/api/v1/conversations/{conversation_id}/messages",
                headers=buyer_headers, json={"body": "Is this home still available?"},
            )
            assert sent.status_code == 201, sent.text
            assert buyer.delete(f"/api/v1/listings/{listing_id}/favorite", headers=buyer_headers).status_code == 200
            assert buyer.get("/api/v1/me/favorites").json() == []

        owner_conversations = client.get("/api/v1/me/conversations")
        assert owner_conversations.status_code == 200
        assert owner_conversations.json()[0]["counterpart_name"] == "Test Buyer"
        assert client.get(f"/api/v1/conversations/{conversation_id}/messages").json()[0]["body"].startswith("Is this")

        archived = client.post(f"/api/v1/listings/{listing_id}/archive", headers=headers)
        assert archived.status_code == 200
        assert client.get("/api/v1/listings?district=yasamal").json()["total"] == 0

        republished = client.post(f"/api/v1/listings/{listing_id}/publish", headers=headers)
        assert republished.status_code == 200
        assert client.get("/api/v1/listings?district=yasamal").json()["total"] == 1

        deleted = client.delete(f"/api/v1/listings/{listing_id}", headers=headers)
        assert deleted.status_code == 200
        assert client.get("/api/v1/listings?district=yasamal").json()["total"] == 0

        logout = client.post("/api/v1/auth/logout", headers=headers)
        assert logout.status_code == 200
        assert client.get("/api/v1/auth/me").status_code == 401
