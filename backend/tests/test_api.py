import os
import tempfile
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

TEST_DATA = Path(tempfile.mkdtemp(prefix="ev-baku-api-test-"))

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DATA / 'test-ev.db'}"
os.environ["STORAGE_BACKEND"] = "local"
os.environ["LOCAL_STORAGE_PATH"] = str(TEST_DATA / "uploads")
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-the-settings-model"
TEST_ENV = {
    "CORS_ALLOW_ALL": "false",
    "APP_NAME": "ev. Baku API tests",
    "ENVIRONMENT": "testing",
    "API_PREFIX": "/api/v1",
    "CORS_ORIGINS": "http://testserver",
    "TRUSTED_HOSTS": "testserver",
    "SESSION_COOKIE_NAME": "ev_session",
    "CSRF_COOKIE_NAME": "ev_csrf",
    "SESSION_TTL_DAYS": "14",
    "COOKIE_SECURE": "false",
    "COOKIE_DOMAIN": "null",
    "LANDING_VIDEO_PATH": str(Path(__file__).resolve().parents[1] / "data"),
    "MINIO_ENDPOINT": "localhost:9000",
    "MINIO_PUBLIC_ENDPOINT": "localhost:9000",
    "MINIO_ACCESS_KEY": "test-access-key",
    "MINIO_SECRET_KEY": "test-secret-key",
    "MINIO_BUCKET": "test-media",
    "MINIO_REGION": "test",
    "MINIO_SECURE": "false",
    "MINIO_PUBLIC_SECURE": "false",
    "MAX_IMAGE_MB": "15",
    "MAX_VIDEO_MB": "100",
    "GEOAPIFY_API_KEY": "null",
    "GEOAPIFY_RADIUS_METERS": "1000",
    "EXCHANGE_RATE_PROVIDER": "exchangerate-api",
    "EXCHANGE_RATE_API_KEY": "null",
    "EXCHANGE_RATE_BASE_URL": "null",
    "EXCHANGE_RATE_CACHE_SECONDS": "21600",
    "OPENAI_API_KEY": "null",
    "OPENAI_BASE_URL": "https://api.openai.com/v1",
    "OPENAI_EMBEDDING_MODEL": "text-embedding-3-small",
    "OPENAI_TRANSCRIPTION_MODEL": "gpt-4o-mini-transcribe",
    "OPENAI_TIMEOUT_SECONDS": "20",
    "GUEST_AI_REQUEST_LIMIT": "5",
    "MAX_VOICE_MB": "10",
}
for key, value in TEST_ENV.items():
    os.environ.setdefault(key, value)

from fastapi.testclient import TestClient
from PIL import Image, ImageChops

from app.external import PLACE_CATEGORIES
from app.main import app
from app.models import District
from app.speech import TranscriptionError
from app.storage import add_watermark

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
    "has_parking": True,
    "parking_type": "underground",
    "has_air_conditioning": True,
    "has_heating": True,
    "pets_allowed": False,
    "smoking_allowed": False,
    "utilities_included": False,
    "service_fee_payer": "tenant",
    "monthly_service_fee": 75,
    "minimum_lease_months": 6,
    "discount_tiers": [
        {"min_months": 6, "discount_percent": 5},
        {"min_months": 12, "discount_percent": 10},
    ],
    "contact_name": "Test Owner",
    "contact_phone": "+994501112233",
}


def test_all_baku_districts_are_supported():
    assert {district.value for district in District} == {
        "sabail", "yasamal", "nasimi", "narimanov", "khatai", "nizami",
        "binagadi", "sabunchu", "surakhani", "qaradag", "khazar", "pirallahi",
    }


def test_nearby_categories_cover_daily_life():
    for category in (
        "healthcare.hospital",
        "education.school",
        "education.university",
        "commercial.supermarket",
        "catering.restaurant",
        "public_transport.subway",
        "leisure.park",
    ):
        assert category in PLACE_CATEGORIES


def make_test_jpeg(color: tuple[int, int, int] = (235, 238, 230)) -> bytes:
    output = BytesIO()
    Image.new("RGB", (640, 420), color).save(output, "JPEG", quality=92)
    return output.getvalue()


def test_watermark_is_baked_into_image_center():
    source = BytesIO()
    original = Image.new("RGB", (800, 600), "white")
    original.save(source, "PNG")

    result = Image.open(BytesIO(add_watermark(source.getvalue(), "image/png"))).convert("RGB")
    changed = ImageChops.difference(original, result).getbbox()

    assert changed is not None
    left, top, right, bottom = changed
    assert abs(((left + right) / 2) - (original.width / 2)) < 3
    assert abs(((top + bottom) / 2) - (original.height / 2)) < 3
    assert result.getpixel((original.width - 10, original.height - 10)) == (255, 255, 255)


def test_landing_videos_are_listed_and_support_range_requests():
    with TestClient(app) as client:
        manifest = client.get("/api/v1/landing-videos")
        assert manifest.status_code == 200
        videos = manifest.json()
        assert videos
        assert all(video["content_type"].startswith("video/") for video in videos)

        filename = quote(videos[0]["filename"], safe="")
        response = client.get(
            f"/api/v1/landing-videos/{filename}",
            headers={"Range": "bytes=0-31"},
        )
        assert response.status_code == 206
        assert response.headers["content-type"].startswith("video/")
        assert response.headers["content-range"].startswith("bytes 0-31/")
        assert len(response.content) == 32


class FakeExchangeRates:
    async def rates(self):
        from decimal import Decimal
        return {"AZN": Decimal(1), "USD": Decimal("0.5"), "EUR": Decimal("0.4"), "RUB": Decimal(50)}

    async def to_azn(self, amount, currency):
        rates = await self.rates()
        return amount / rates[currency.value]


class FakeGeoapify:
    def __init__(self):
        self.nearby_calls = 0

    async def nearby(self, latitude, longitude, radius=None, lang="ru"):
        self.nearby_calls += 1
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
        map_style = client.get("/api/v1/map-style.json")
        assert map_style.status_code == 200
        assert map_style.headers["content-type"].startswith("application/json")
        assert map_style.json()["version"] == 8
        assert "openmaptiles" in map_style.json()["sources"]
        logo = client.get("/api/v1/branding/logo.png")
        assert logo.status_code == 200
        assert logo.headers["content-type"].startswith("image/png")

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

        fake_geoapify = FakeGeoapify()
        app.state.geoapify = fake_geoapify
        created = client.post("/api/v1/listings", json=LISTING, headers=headers)
        assert created.status_code == 201, created.text
        listing_id = created.json()["id"]
        assert created.json()["status"] == "draft"
        assert created.json()["nearby_places"][0]["name"] == "Test Market"
        assert created.json()["nearby_updated_at"] is not None
        assert fake_geoapify.nearby_calls == 1
        assert created.json()["discount_tiers"][1] == {"min_months": 12, "discount_percent": 10.0}
        assert created.json()["parking_type"] == "underground"
        assert created.json()["service_fee_payer"] == "tenant"
        assert created.json()["monthly_service_fee"] == 75.0
        assert client.post("/api/v1/listings", json=LISTING).status_code == 403
        assert client.post(f"/api/v1/listings/{listing_id}/publish", headers=headers).status_code == 422

        landlord_services = client.patch(
            f"/api/v1/listings/{listing_id}",
            json={"service_fee_payer": "landlord", "parking_type": "surface"},
            headers=headers,
        )
        assert landlord_services.status_code == 200, landlord_services.text
        assert landlord_services.json()["monthly_service_fee"] is None
        assert landlord_services.json()["parking_type"] == "surface"
        missing_tenant_fee = client.patch(
            f"/api/v1/listings/{listing_id}",
            json={"service_fee_payer": "tenant"},
            headers=headers,
        )
        assert missing_tenant_fee.status_code == 422
        tenant_services = client.patch(
            f"/api/v1/listings/{listing_id}",
            json={"service_fee_payer": "tenant", "monthly_service_fee": 80},
            headers=headers,
        )
        assert tenant_services.status_code == 200, tenant_services.text
        assert tenant_services.json()["monthly_service_fee"] == 80.0

        updated = client.patch(
            f"/api/v1/listings/{listing_id}", json={"title": "Updated Baku rental apartment"}, headers=headers
        )
        assert updated.status_code == 200
        assert updated.json()["title"] == "Updated Baku rental apartment"

        # Edit forms submit validated discount tiers again alongside media changes.
        discount_update = client.patch(
            f"/api/v1/listings/{listing_id}",
            json={
                "discount_tiers": [
                    {"min_months": 6, "discount_percent": 7.5},
                    {"min_months": 12, "discount_percent": 12},
                ]
            },
            headers=headers,
        )
        assert discount_update.status_code == 200, discount_update.text
        assert discount_update.json()["discount_tiers"] == [
            {"min_months": 6, "discount_percent": 7.5},
            {"min_months": 12, "discount_percent": 12.0},
        ]

        original_photo = make_test_jpeg()
        uploaded = client.post(
            f"/api/v1/listings/{listing_id}/media",
            headers=headers,
            data={"media_type": "image", "is_cover": "true"},
            files={"file": ("home.jpg", original_photo, "image/jpeg")},
        )
        assert uploaded.status_code == 201, uploaded.text
        first_media_id = uploaded.json()["id"]
        watermarked = client.get(f"/api/v1/media/{first_media_id}")
        assert watermarked.status_code == 200
        assert "location" not in watermarked.headers
        assert watermarked.headers["accept-ranges"] == "bytes"
        assert watermarked.content != original_photo
        with Image.open(BytesIO(watermarked.content)) as stored_image:
            assert stored_image.size == (640, 420)

        partial_photo = client.get(
            f"/api/v1/media/{first_media_id}",
            headers={"Range": "bytes=0-31"},
        )
        assert partial_photo.status_code == 206
        assert partial_photo.headers["content-range"].endswith(f"/{len(watermarked.content)}")
        assert partial_photo.content == watermarked.content[:32]

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
            files={"file": ("second.jpg", make_test_jpeg((220, 228, 235)), "image/jpeg")},
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

        private_contact = client.patch(
            f"/api/v1/listings/{listing_id}",
            json={"contact_method": "messages"},
            headers=headers,
        )
        assert private_contact.status_code == 200, private_contact.text
        assert private_contact.json()["contact_phone"] == "+994501112233"
        public_private = client.get(f"/api/v1/listings/{listing_id}").json()
        assert public_private["contact_method"] == "messages"
        assert public_private["contact_phone"] is None
        assert public_private["contact_telegram"] is None
        assert client.get("/api/v1/me/listings").json()[0]["contact_phone"] == "+994501112233"
        ai_results = client.get("/api/v1/listings/ai-search?q=balcony%20yasamal")
        assert ai_results.status_code == 200, ai_results.text
        assert ai_results.json()["mode"] == "text"
        assert ai_results.json()["answer"]
        assert ai_results.json()["items"][0]["id"] == listing_id

        nearby = client.get(f"/api/v1/listings/{listing_id}/nearby?radius=1000&lang=en")
        assert nearby.status_code == 200
        assert nearby.json()[0]["distance_meters"] == 240
        assert fake_geoapify.nearby_calls == 1
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
            conversation_data = conversation.json()
            conversation_id = conversation_data["id"]
            assert conversation_data["listing_title"] == "Updated published apartment in Baku"
            assert conversation_data["listing_address"] == LISTING["address"]
            assert conversation_data["listing_district"] == "yasamal"
            assert conversation_data["listing_monthly_rent"] == 1000
            assert conversation_data["listing_rent_currency"] == "USD"
            assert conversation_data["listing_cover_url"].startswith("/api/v1/media/")
            assert conversation_data["listing_status"] == "published"
            sent = buyer.post(
                f"/api/v1/conversations/{conversation_id}/messages",
                headers=buyer_headers, json={"body": "Is this home still available?"},
            )
            assert sent.status_code == 201, sent.text
            phone_only = client.patch(
                f"/api/v1/listings/{listing_id}",
                json={"contact_method": "phone"},
                headers=headers,
            )
            assert phone_only.status_code == 200, phone_only.text
            assert buyer.post(f"/api/v1/listings/{listing_id}/conversations", headers=buyer_headers).status_code == 403
            assert buyer.post(
                f"/api/v1/conversations/{conversation_id}/messages",
                headers=buyer_headers,
                json={"body": "Can I still write?"},
            ).status_code == 403
            assert buyer.delete(f"/api/v1/listings/{listing_id}/favorite", headers=buyer_headers).status_code == 200
            assert buyer.get("/api/v1/me/favorites").json() == []

        owner_conversations = client.get("/api/v1/me/conversations")
        assert owner_conversations.status_code == 200
        assert owner_conversations.json()[0]["counterpart_name"] == "Test Buyer"
        assert owner_conversations.json()[0]["listing_cover_url"].startswith("/api/v1/media/")
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


def test_guest_ai_search_is_locked_after_five_requests_but_authenticated_users_bypass_limit():
    client_address = ("203.0.113.41", 5041)
    with TestClient(app, client=client_address) as guest:
        for expected_remaining in range(4, -1, -1):
            response = guest.get("/api/v1/listings/ai-search?q=baku%20apartment")
            assert response.status_code == 200, response.text
            assert response.json()["guest_requests_remaining"] == expected_remaining
            assert response.json()["guest_request_limit"] == 5

        blocked = guest.get("/api/v1/listings/ai-search?q=baku%20apartment")
        assert blocked.status_code == 429

    # The lock survives a new browser session because it is stored in the database.
    with TestClient(app, client=client_address) as same_ip:
        assert same_ip.get("/api/v1/listings/ai-search?q=baku%20apartment").status_code == 429
        registration = same_ip.post("/api/v1/auth/register", json={
            "email": "quota-user@example.com",
            "password": "securepass123",
            "full_name": "Quota User",
        })
        assert registration.status_code == 201, registration.text
        authenticated = same_ip.get("/api/v1/listings/ai-search?q=baku%20apartment")
        assert authenticated.status_code == 200, authenticated.text
        assert authenticated.json()["guest_requests_remaining"] is None


def test_voice_search_transcribes_audio_and_counts_as_one_guest_request():
    class FailingTranscription:
        async def transcribe(self, audio, **kwargs):
            raise TranscriptionError("Voice transcription provider is temporarily unavailable")

    class FakeTranscription:
        async def transcribe(self, audio, **kwargs):
            assert audio == b"fake-opus-audio"
            assert kwargs["content_type"] == "audio/webm"
            assert kwargs["language"] == "ru"
            return "квартира с балконом в Ясамале"

    with TestClient(app, client=("203.0.113.42", 5042)) as client:
        app.state.transcription = FailingTranscription()
        failed = client.post(
            "/api/v1/listings/voice-search",
            data={"lang": "ru"},
            files={"file": ("voice.webm", b"fake-opus-audio", "audio/webm;codecs=opus")},
        )
        assert failed.status_code == 503

        app.state.transcription = FakeTranscription()
        response = client.post(
            "/api/v1/listings/voice-search",
            data={"lang": "ru"},
            files={"file": ("voice.webm", b"fake-opus-audio", "audio/webm;codecs=opus")},
        )
        assert response.status_code == 200, response.text
        assert response.json()["query"] == "квартира с балконом в Ясамале"
        assert response.json()["answer"]
        assert response.json()["guest_requests_remaining"] == 4
