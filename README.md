# ev. — Baku rental platform

Full-stack rental marketplace for Baku: a React/MapLibre frontend, a FastAPI API, cookie-based sessions, SQLite (with a PostgreSQL-ready URL), and private S3-compatible media storage through MinIO.

## What is included

- Responsive Three.js construction hero with AZ / EN / RU UI.
- Baku-only MapLibre search with Split / Map / Listings layouts.
- Live listings from the API — no hardcoded property cards or photos.
- Search and filters for district, property type, rooms, rent and furniture.
- Account registration and login with opaque signed session cookies (no JWT).
- CSRF protection, strict CORS/origin checks, trusted hosts and security headers.
- Owner dashboard for draft, publish, archive and delete flows.
- Complete rental form: type, rooms, guests, area, floors, furniture, amenities, lease period, availability, contact details and Baku coordinates.
- Multiple property photos, a floor plan and video upload.
- Private MinIO bucket; the API validates access and issues short-lived download links.
- SQLite by default, with async PostgreSQL support already included.

## Fastest local start

Requirements: Node.js 20+, Python 3.12+, Docker (for MinIO).

1. Start MinIO and the API:

   ```bash
   docker compose up --build -d minio api
   ```

2. Start the frontend:

   ```bash
   npm install
   npm run dev
   ```

3. Open `http://localhost:5173`. API docs are at `http://localhost:8000/docs`; the MinIO console is at `http://localhost:9001`.

The Vite development server proxies `/api` to FastAPI, so browser cookies stay same-origin during development.

## Run everything without an API container

Start only MinIO:

```bash
docker compose up -d minio
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

The provided local environment example already points the API to MinIO on `localhost:9000`; Docker Compose injects the internal `minio:9000` endpoint into its API container automatically.

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
- `backend/app/models.py` — users, database sessions, listings and media models.
- `backend/app/routers/` — auth, listing and media endpoints.
- `backend/app/storage.py` — MinIO/local object-storage adapter.
- `docker-compose.yml` — API, MinIO, and optional PostgreSQL services.

SQLite schema creation is intentionally automatic for this prototype. Before a production launch and future schema changes, add Alembic migrations and a backup policy.
