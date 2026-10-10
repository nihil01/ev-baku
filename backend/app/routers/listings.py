from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..ai_search import EmbeddingService, cosine_similarity, listing_embedding_text, source_hash, text_similarity
from ..config import Settings, get_settings
from ..database import get_db
from ..dependencies import AuthContext, csrf_protected, current_auth, optional_auth
from ..external import (
    NEARBY_CACHE_VERSION,
    NEARBY_DISPLAY_RADIUS_METERS,
    ExchangeRateService,
    GeoapifyService,
)
from ..guest_quota import consume_guest_ai_request
from ..models import (
    ContactMethod,
    District,
    Listing,
    ListingDiscountTier,
    ListingEmbedding,
    ListingStatus,
    MediaType,
    PropertyType,
)
from ..schemas import (
    AiSearchResponse,
    DiscountTier,
    ListingCreate,
    ListingPage,
    ListingRead,
    ListingUpdate,
    Message,
    NearbyPlace,
)
from ..serializers import listing_to_dict
from ..speech import TranscriptionError, TranscriptionService
from ..storage import ObjectStorage

router = APIRouter(tags=["listings"])


def listing_load_options(include_embedding: bool = False):
    options = [selectinload(Listing.media), selectinload(Listing.discount_tiers)]
    if include_embedding:
        options.append(selectinload(Listing.embedding))
    return options


async def owned_listing(listing_id: str, owner_id: str, db: AsyncSession) -> Listing:
    listing = (await db.execute(
        select(Listing).options(*listing_load_options()).where(Listing.id == listing_id, Listing.owner_id == owner_id)
    )).scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


def replace_discount_tiers(listing: Listing, tiers: list[DiscountTier]) -> None:
    existing_by_months = {tier.min_months: tier for tier in listing.discount_tiers}
    updated_tiers: list[ListingDiscountTier] = []

    for tier in tiers:
        stored_tier = existing_by_months.pop(tier.min_months, None)
        if stored_tier is None:
            stored_tier = ListingDiscountTier(min_months=tier.min_months)
        stored_tier.discount_percent = tier.discount_percent
        updated_tiers.append(stored_tier)

    listing.discount_tiers[:] = updated_tiers


async def refresh_embedding(listing: Listing, request: Request, db: AsyncSession) -> None:
    service: EmbeddingService = request.app.state.embeddings
    if not service.configured:
        return
    text = listing_embedding_text(listing)
    digest = source_hash(text)
    record = await db.get(ListingEmbedding, listing.id)
    if record and record.source_hash == digest and record.model == service.model:
        return
    vector = await service.embed(text)
    if vector is None:
        return
    if record:
        record.vector = vector
        record.model = service.model
        record.source_hash = digest
        record.updated_at = datetime.now(UTC)
    else:
        db.add(ListingEmbedding(listing_id=listing.id, vector=vector, model=service.model, source_hash=digest))


async def refresh_nearby_snapshot(
    listing: Listing,
    request: Request,
    *,
    radius: int = NEARBY_DISPLAY_RADIUS_METERS,
    lang: str = "ru",
    suppress_errors: bool = True,
) -> None:
    """Persist one provider response so repeated listing views stay cache-only."""
    service: GeoapifyService = request.app.state.geoapify
    try:
        listing.nearby_places = await service.nearby(
            float(listing.latitude),
            float(listing.longitude),
            radius=radius,
            lang=lang,
        )
        listing.nearby_updated_at = datetime.now(UTC)
        listing.nearby_cache_version = NEARBY_CACHE_VERSION
    except HTTPException:
        if not suppress_errors:
            raise
        # Nearby infrastructure is an enhancement and must never block listing creation.
        listing.nearby_places = None
        listing.nearby_updated_at = None
        listing.nearby_cache_version = 0


@router.get("/listings", response_model=ListingPage)
async def search_listings(
    q: str | None = Query(default=None, max_length=120),
    district: District | None = None,
    property_type: PropertyType | None = None,
    rooms_min: int | None = Query(default=None, ge=0, le=50),
    price_min: Decimal | None = Query(default=None, ge=0),
    price_max: Decimal | None = Query(default=None, ge=0),
    furnished: bool | None = None,
    sort: str = Query(default="newest", pattern="^(newest|price_asc|price_desc|area_desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    filters = [Listing.status == ListingStatus.published]
    if q:
        term = f"%{q.strip()}%"
        filters.append(or_(Listing.title.ilike(term), Listing.address.ilike(term), Listing.description.ilike(term)))
    if district:
        filters.append(Listing.district == district)
    if property_type:
        filters.append(Listing.property_type == property_type)
    if rooms_min is not None:
        filters.append(Listing.rooms >= rooms_min)
    if price_min is not None:
        filters.append(Listing.monthly_rent_azn >= price_min)
    if price_max is not None:
        filters.append(Listing.monthly_rent_azn <= price_max)
    if furnished is not None:
        filters.append(Listing.furnished == furnished)

    order = {
        "newest": Listing.published_at.desc(),
        "price_asc": Listing.monthly_rent_azn.asc(),
        "price_desc": Listing.monthly_rent_azn.desc(),
        "area_desc": Listing.area_sqm.desc(),
    }[sort]
    total = (await db.execute(select(func.count(Listing.id)).where(*filters))).scalar_one()
    result = await db.execute(
        select(Listing).options(*listing_load_options()).where(*filters).order_by(order).offset((page - 1) * page_size).limit(page_size)
    )
    items = [ListingRead.model_validate(listing_to_dict(item)) for item in result.scalars().unique().all()]
    return ListingPage(items=items, total=total, page=page, page_size=page_size)


async def run_ai_listing_search(
    request: Request,
    query: str,
    limit: int,
    db: AsyncSession,
    *,
    guest_requests_remaining: int | None,
    guest_request_limit: int | None,
) -> AiSearchResponse:
    result = await db.execute(
        select(Listing)
        .options(*listing_load_options(include_embedding=True))
        .where(Listing.status == ListingStatus.published)
        .order_by(Listing.published_at.desc())
    )
    listings = result.scalars().unique().all()
    service: EmbeddingService = request.app.state.embeddings
    query_vector = None
    if service.configured:
        missing: list[tuple[Listing, str, str]] = []
        for item in listings:
            text = listing_embedding_text(item)
            digest = source_hash(text)
            if not item.embedding or item.embedding.source_hash != digest or item.embedding.model != service.model:
                missing.append((item, text, digest))
        vectors = await service.embed_many([query, *(text for _, text, _ in missing)])
        if vectors:
            query_vector = vectors[0]
            for (item, _, digest), vector in zip(missing, vectors[1:], strict=True):
                if item.embedding:
                    item.embedding.vector = vector
                    item.embedding.model = service.model
                    item.embedding.source_hash = digest
                    item.embedding.updated_at = datetime.now(UTC)
                else:
                    item.embedding = ListingEmbedding(
                        listing_id=item.id,
                        vector=vector,
                        model=service.model,
                        source_hash=digest,
                    )
            if missing:
                await db.commit()
    use_semantic = query_vector is not None and any(item.embedding for item in listings)

    if use_semantic:
        scored = [
            (
                cosine_similarity(query_vector, item.embedding.vector)
                if item.embedding
                else min(text_similarity(query, item) / 10, 0.2),
                item,
            )
            for item in listings
        ]
        mode = "semantic"
    else:
        scored = [(text_similarity(query, item), item) for item in listings]
        mode = "text"

    matches = [item for score, item in sorted(scored, key=lambda pair: pair[0], reverse=True) if score > 0][:limit]
    items = [ListingRead.model_validate(listing_to_dict(item)) for item in matches]
    return AiSearchResponse(
        items=items,
        total=len(items),
        query=query,
        mode=mode,
        guest_requests_remaining=guest_requests_remaining,
        guest_request_limit=guest_request_limit,
    )


@router.get("/listings/ai-search", response_model=AiSearchResponse)
async def ai_search_listings(
    request: Request,
    q: str = Query(min_length=2, max_length=500),
    limit: int = Query(default=30, ge=1, le=100),
    auth: AuthContext | None = Depends(optional_auth),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    remaining = await consume_guest_ai_request(request, auth, db, settings)
    return await run_ai_listing_search(
        request,
        q.strip(),
        limit,
        db,
        guest_requests_remaining=remaining,
        guest_request_limit=settings.guest_ai_request_limit if auth is None else None,
    )


@router.post("/listings/voice-search", response_model=AiSearchResponse)
async def voice_search_listings(
    request: Request,
    file: UploadFile = File(...),
    lang: str = Form(default="ru", pattern="^(az|en|ru)$"),
    limit: int = Form(default=30, ge=1, le=100),
    auth: AuthContext | None = Depends(optional_auth),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    content_type = (file.content_type or "").split(";", 1)[0].strip().lower()
    supported_types = {
        "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav",
    }
    if content_type not in supported_types:
        raise HTTPException(status_code=415, detail="Unsupported voice recording format")

    max_bytes = settings.max_voice_mb * 1024 * 1024
    audio = await file.read(max_bytes + 1)
    await file.close()
    if not audio:
        raise HTTPException(status_code=422, detail="The voice recording is empty")
    if len(audio) > max_bytes:
        raise HTTPException(status_code=413, detail="The voice recording is too large")

    remaining = await consume_guest_ai_request(request, auth, db, settings)
    service: TranscriptionService = request.app.state.transcription
    try:
        transcript = await service.transcribe(
            audio,
            filename=file.filename or "voice-search.webm",
            content_type=content_type,
            language=lang,
        )
    except TranscriptionError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    if len(transcript) < 2:
        raise HTTPException(status_code=422, detail="Speech could not be recognized")

    return await run_ai_listing_search(
        request,
        transcript[:500],
        limit,
        db,
        guest_requests_remaining=remaining,
        guest_request_limit=settings.guest_ai_request_limit if auth is None else None,
    )


@router.get("/listings/{listing_id}", response_model=ListingRead)
async def listing_detail(listing_id: str, db: AsyncSession = Depends(get_db)):
    listing = (await db.execute(
        select(Listing).options(*listing_load_options()).where(Listing.id == listing_id, Listing.status == ListingStatus.published)
    )).scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return ListingRead.model_validate(listing_to_dict(listing))


@router.get("/listings/{listing_id}/nearby", response_model=list[NearbyPlace])
async def listing_nearby(
    listing_id: str,
    request: Request,
    radius: int = Query(default=NEARBY_DISPLAY_RADIUS_METERS, ge=300, le=5000),
    lang: str = Query(default="ru", pattern="^(az|en|ru)$"),
    db: AsyncSession = Depends(get_db),
):
    listing = (await db.execute(select(Listing).where(
        Listing.id == listing_id, Listing.status == ListingStatus.published
    ))).scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.nearby_places is None or listing.nearby_cache_version < NEARBY_CACHE_VERSION:
        await refresh_nearby_snapshot(
            listing,
            request,
            radius=radius,
            lang=lang,
            suppress_errors=False,
        )
        await db.commit()
    return listing.nearby_places or []


@router.get("/me/listings", response_model=list[ListingRead])
async def my_listings(auth: AuthContext = Depends(current_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Listing).options(*listing_load_options()).where(Listing.owner_id == auth.user.id).order_by(Listing.updated_at.desc())
    )
    return [
        ListingRead.model_validate(listing_to_dict(item, redact_private_contact=False))
        for item in result.scalars().unique().all()
    ]


@router.post("/listings", response_model=ListingRead, status_code=status.HTTP_201_CREATED)
async def create_listing(
    payload: ListingCreate,
    request: Request,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
):
    values = payload.model_dump(exclude={"discount_tiers"})
    exchange: ExchangeRateService = request.app.state.exchange_rates
    values["monthly_rent_azn"] = await exchange.to_azn(payload.monthly_rent, payload.rent_currency)
    listing = Listing(owner_id=auth.user.id, status=ListingStatus.draft, **values)
    replace_discount_tiers(listing, payload.discount_tiers)
    db.add(listing)
    await db.flush()
    # A listing is not complete without its persisted neighbourhood snapshot.
    # Fetch it in the creation transaction so every successful response already
    # contains the places that will be shown on cards and in the detail view.
    await refresh_nearby_snapshot(listing, request, suppress_errors=False)
    await refresh_embedding(listing, request, db)
    await db.commit()
    await db.refresh(listing, attribute_names=["media", "discount_tiers"])
    return ListingRead.model_validate(listing_to_dict(listing, redact_private_contact=False))


@router.patch("/listings/{listing_id}", response_model=ListingRead)
async def update_listing(
    listing_id: str,
    payload: ListingUpdate,
    request: Request,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
):
    listing = await owned_listing(listing_id, auth.user.id, db)
    tiers_supplied = "discount_tiers" in payload.model_fields_set
    tiers = payload.discount_tiers if tiers_supplied else None
    values = payload.model_dump(exclude_unset=True, exclude={"discount_tiers"})
    next_contact_method = values.get("contact_method", listing.contact_method)
    next_contact_phone = values.get("contact_phone", listing.contact_phone) or ""
    if next_contact_method in {ContactMethod.phone, ContactMethod.both} and len(next_contact_phone.strip()) < 5:
        raise HTTPException(status_code=422, detail="A phone number is required for the selected contact method")
    if "contact_phone" in values:
        values["contact_phone"] = next_contact_phone
    location_changed = (
        ("latitude" in values and values["latitude"] != listing.latitude)
        or ("longitude" in values and values["longitude"] != listing.longitude)
    )
    if "monthly_rent" in values or "rent_currency" in values:
        amount = values.get("monthly_rent", listing.monthly_rent)
        currency = values.get("rent_currency", listing.rent_currency)
        exchange: ExchangeRateService = request.app.state.exchange_rates
        values["monthly_rent_azn"] = await exchange.to_azn(amount, currency)
    for key, value in values.items():
        setattr(listing, key, value)
    if tiers_supplied:
        replace_discount_tiers(listing, tiers or [])
    listing.updated_at = datetime.now(UTC)
    await db.flush()
    if location_changed or listing.nearby_updated_at is None:
        await refresh_nearby_snapshot(listing, request, suppress_errors=False)
    await refresh_embedding(listing, request, db)
    await db.commit()
    await db.refresh(listing, attribute_names=["media", "discount_tiers"])
    return ListingRead.model_validate(listing_to_dict(listing, redact_private_contact=False))


@router.post("/listings/{listing_id}/publish", response_model=ListingRead)
async def publish_listing(
    listing_id: str,
    request: Request,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
):
    listing = await owned_listing(listing_id, auth.user.id, db)
    if not any(media.media_type == MediaType.image for media in listing.media):
        raise HTTPException(status_code=422, detail="Upload at least one property photo before publishing")
    listing.status = ListingStatus.published
    listing.published_at = datetime.now(UTC)
    await db.flush()
    await refresh_embedding(listing, request, db)
    await db.commit()
    await db.refresh(listing, attribute_names=["media", "discount_tiers"])
    return ListingRead.model_validate(listing_to_dict(listing, redact_private_contact=False))


@router.post("/listings/{listing_id}/archive", response_model=ListingRead)
async def archive_listing(
    listing_id: str,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
):
    listing = await owned_listing(listing_id, auth.user.id, db)
    listing.status = ListingStatus.archived
    await db.commit()
    await db.refresh(listing, attribute_names=["media", "discount_tiers"])
    return ListingRead.model_validate(listing_to_dict(listing, redact_private_contact=False))


@router.delete("/listings/{listing_id}", response_model=Message)
async def delete_listing(
    listing_id: str,
    request: Request,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
):
    listing = await owned_listing(listing_id, auth.user.id, db)
    storage: ObjectStorage = request.app.state.storage
    for media in listing.media:
        await storage.delete(media.object_key)
    await db.delete(listing)
    await db.commit()
    return Message(message="Listing deleted")
