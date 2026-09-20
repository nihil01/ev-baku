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


def test_user_listing_media_publish_flow():
    with TestClient(app) as client:
        registration = client.post("/api/v1/auth/register", json={
            "email": "owner@example.com", "password": "securepass123", "full_name": "Test Owner", "phone": "+994501112233",
        })
        assert registration.status_code == 201, registration.text
        csrf = registration.json()["csrf_token"]
        headers = {"X-CSRF-Token": csrf}

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

        published = client.post(f"/api/v1/listings/{listing_id}/publish", headers=headers)
        assert published.status_code == 200, published.text
        assert published.json()["status"] == "published"

        public = client.get("/api/v1/listings?district=yasamal")
        assert public.status_code == 200
        assert public.json()["total"] == 1
        assert public.json()["items"][0]["media"][0]["url"].startswith("/api/v1/media/")

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
