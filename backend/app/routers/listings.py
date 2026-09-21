from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..dependencies import AuthContext, csrf_protected, current_auth
from ..external import ExchangeRateService, GeoapifyService
from ..models import District, Listing, ListingStatus, MediaType, PropertyType
from ..schemas import ListingCreate, ListingPage, ListingRead, ListingUpdate, Message, NearbyPlace
from ..serializers import listing_to_dict
from ..storage import ObjectStorage

router = APIRouter(tags=["listings"])


async def owned_listing(listing_id: str, owner_id: str, db: AsyncSession) -> Listing:
    listing = (await db.execute(
        select(Listing).options(selectinload(Listing.media)).where(Listing.id == listing_id, Listing.owner_id == owner_id)
    )).scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


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
        select(Listing).options(selectinload(Listing.media)).where(*filters).order_by(order).offset((page - 1) * page_size).limit(page_size)
    )
    items = [ListingRead.model_validate(listing_to_dict(item)) for item in result.scalars().unique().all()]
    return ListingPage(items=items, total=total, page=page, page_size=page_size)


@router.get("/listings/{listing_id}", response_model=ListingRead)
async def listing_detail(listing_id: str, db: AsyncSession = Depends(get_db)):
    listing = (await db.execute(
        select(Listing).options(selectinload(Listing.media)).where(Listing.id == listing_id, Listing.status == ListingStatus.published)
    )).scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return ListingRead.model_validate(listing_to_dict(listing))


@router.get("/listings/{listing_id}/nearby", response_model=list[NearbyPlace])
async def listing_nearby(
    listing_id: str,
    request: Request,
    radius: int | None = Query(default=None, ge=100, le=5000),
    lang: str = Query(default="ru", pattern="^(az|en|ru)$"),
    db: AsyncSession = Depends(get_db),
):
    listing = (await db.execute(select(Listing).where(
        Listing.id == listing_id, Listing.status == ListingStatus.published
    ))).scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    service: GeoapifyService = request.app.state.geoapify
    return await service.nearby(float(listing.latitude), float(listing.longitude), radius, lang)


@router.get("/me/listings", response_model=list[ListingRead])
async def my_listings(auth: AuthContext = Depends(current_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Listing).options(selectinload(Listing.media)).where(Listing.owner_id == auth.user.id).order_by(Listing.updated_at.desc())
    )
    return [ListingRead.model_validate(listing_to_dict(item)) for item in result.scalars().unique().all()]


@router.post("/listings", response_model=ListingRead, status_code=status.HTTP_201_CREATED)
async def create_listing(
    payload: ListingCreate,
    request: Request,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
):
    values = payload.model_dump()
    exchange: ExchangeRateService = request.app.state.exchange_rates
    values["monthly_rent_azn"] = await exchange.to_azn(payload.monthly_rent, payload.rent_currency)
    listing = Listing(owner_id=auth.user.id, status=ListingStatus.draft, **values)
    db.add(listing)
    await db.commit()
    await db.refresh(listing, attribute_names=["media"])
    return ListingRead.model_validate(listing_to_dict(listing))


@router.patch("/listings/{listing_id}", response_model=ListingRead)
async def update_listing(
    listing_id: str,
    payload: ListingUpdate,
    request: Request,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
):
    listing = await owned_listing(listing_id, auth.user.id, db)
    values = payload.model_dump(exclude_unset=True)
    if "monthly_rent" in values or "rent_currency" in values:
        amount = values.get("monthly_rent", listing.monthly_rent)
        currency = values.get("rent_currency", listing.rent_currency)
        exchange: ExchangeRateService = request.app.state.exchange_rates
        values["monthly_rent_azn"] = await exchange.to_azn(amount, currency)
    for key, value in values.items():
        setattr(listing, key, value)
    listing.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(listing, attribute_names=["media"])
    return ListingRead.model_validate(listing_to_dict(listing))


@router.post("/listings/{listing_id}/publish", response_model=ListingRead)
async def publish_listing(
    listing_id: str,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
):
    listing = await owned_listing(listing_id, auth.user.id, db)
    if not any(media.media_type == MediaType.image for media in listing.media):
        raise HTTPException(status_code=422, detail="Upload at least one property photo before publishing")
    listing.status = ListingStatus.published
    listing.published_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(listing, attribute_names=["media"])
    return ListingRead.model_validate(listing_to_dict(listing))


@router.post("/listings/{listing_id}/archive", response_model=ListingRead)
async def archive_listing(
    listing_id: str,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
):
    listing = await owned_listing(listing_id, auth.user.id, db)
    listing.status = ListingStatus.archived
    await db.commit()
    await db.refresh(listing, attribute_names=["media"])
    return ListingRead.model_validate(listing_to_dict(listing))


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
