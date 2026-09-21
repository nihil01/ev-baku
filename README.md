# ev. — Baku rental platform

Full-stack rental marketplace for Baku: a React/MapLibre frontend, a FastAPI API, cookie-based sessions, SQLite (with a PostgreSQL-ready URL), and private S3-compatible media storage through Garage.

## What is included

- Responsive Three.js construction hero with AZ / EN / RU UI.
- Baku-only MapLibre search with Split / Map / Listings layouts.
- Live listings from the API — no hardcoded property cards or photos.
- Search and filters for district, property type, rooms, normalized AZN rent and furniture.
- Click/drag location picker plus browser geolocation when publishing a home.
- Geoapify-powered nearby places within a configurable 2 km radius.
- AZN/USD/EUR/RUB listing prices with server-side ExchangeRate-API conversion.
- Account registration and login with opaque signed session cookies (no JWT).
- CSRF protection, strict CORS/origin checks, trusted hosts and security headers.
- Dashboard with full listing CRUD, contacts/privacy, favorites, and listing conversations.
- Complete rental form: type, rooms, guests, area, floors, furniture, amenities, lease period, availability, contact details and Baku coordinates.
- Multiple property photos, a floor plan and video upload.
- Private Garage S3 bucket; the API validates access and issues short-lived download links.
- SQLite by default, with async PostgreSQL support already included.

## Fastest local start

Requirements: Node.js 20+, Python 3.12+, Docker.

1. Create a root `.env` with the Garage credentials plus the two provider keys, then start Garage and the API:

   ```env
   GARAGE_RPC_SECRET=<64-hex-characters>
   GARAGE_ADMIN_TOKEN=<random-secret>
   GARAGE_METRICS_TOKEN=<random-secret>
   GARAGE_ACCESS_KEY=<access-key>
   GARAGE_SECRET_KEY=<secret-key>
   GEOAPIFY_API_KEY=<geoapify-key>
   EXCHANGE_RATE_API_KEY=<exchangerate-api-key>
   ```

   ```bash
   docker compose up --build -d garage api
   ```

2. Start the frontend:

   ```bash
   npm install
   npm run dev
   ```

3. Open `http://localhost:5173`. API docs are at `http://localhost:8000/docs`.

The Vite development server proxies `/api` to FastAPI, so browser cookies stay same-origin during development.

## Run the API outside Docker

Start only Garage:

```bash
docker compose up -d garage
```

Then run the API:

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
uvicorn app.main:app --reload
```

The provided local environment example should point the S3 client to Garage on `localhost:9000`; Docker Compose injects the internal `garage:3900` endpoint into its API container automatically. Geoapify and ExchangeRate keys remain server-side.

## Use PostgreSQL later

Start the optional database service:

```bash
docker compose --profile postgres up -d postgres
```

Set this API environment variable:

```env
DATABASE_URL=postgresql+asyncpg://ev:replace-postgres-password@postgres:5432/ev
```

The model layer uses SQLAlchemy async APIs, so the application code does not need to change.

## Production settings

Change all example secrets and configure at least:

```env
ENVIRONMENT=production
SECRET_KEY=<long-random-secret>
COOKIE_SECURE=true
CORS_ORIGINS=https://your-frontend.example
TRUSTED_HOSTS=your-api.example
MINIO_SECURE=true
```

Serve frontend and API under one HTTPS site if possible. If they must be on different sites, the cookie SameSite policy and CSRF design should be reviewed for that exact topology. Put request throttling and TLS termination at the reverse proxy.

## Checks

```bash
npm run build
cd backend
pytest
ruff check app tests
```

## Project map

- `src/components/ConstructionHero.tsx` — title screen and construction scene.
- `src/components/MapExperience.tsx` — synchronized map, filters and API listing UI.
- `src/components/AccountAccess.tsx` — authentication and owner dashboard.
- `src/lib/api.ts` — credentialed API client and CSRF header handling.
- `src/data/mapConfig.ts` — Baku districts and boundary polygons.
- `public/map-style.json` — the lazily fetched visual map style.
- `backend/app/main.py` — middleware, startup and API assembly.
- `backend/app/models.py` — users, sessions, listings, favorites, chats and media models.
- `backend/app/routers/` — auth, listing, social, external-data and media endpoints.
- `backend/app/storage.py` — Garage/local S3-compatible storage adapter.
- `docker-compose.yml` — API, Garage, and optional PostgreSQL services.

SQLite schema creation is intentionally automatic for this prototype. Before a production launch and future schema changes, add Alembic migrations and a backup policy.
