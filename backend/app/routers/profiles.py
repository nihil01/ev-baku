from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..dependencies import AuthContext, csrf_protected
from ..models import LandlordReview, Listing, ListingStatus, User
from ..schemas import (
    LandlordProfileRead,
    LandlordReviewCreate,
    LandlordReviewRead,
    ListingRead,
    Message,
)
from ..serializers import listing_to_dict

router = APIRouter(prefix="/landlords", tags=["landlord profiles"])


def review_read(review: LandlordReview) -> LandlordReviewRead:
    return LandlordReviewRead(
        id=review.id,
        author_id=review.author_id,
        author_name=review.author.full_name if review.author.show_full_name else "Пользователь EV BAKU",
        rating=review.rating,
        body=review.body,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


@router.get("/{landlord_id}", response_model=LandlordProfileRead)
async def landlord_profile(landlord_id: str, db: AsyncSession = Depends(get_db)):
    landlord = (await db.execute(select(User).where(User.id == landlord_id, User.is_active.is_(True)))).scalar_one_or_none()
    if not landlord:
        raise HTTPException(status_code=404, detail="Landlord profile not found")

    listings = (await db.execute(
        select(Listing)
        .options(selectinload(Listing.media), selectinload(Listing.discount_tiers))
        .where(Listing.owner_id == landlord_id, Listing.status == ListingStatus.published)
        .order_by(Listing.published_at.desc())
    )).scalars().unique().all()
    reviews = (await db.execute(
        select(LandlordReview)
        .options(selectinload(LandlordReview.author))
        .where(LandlordReview.landlord_id == landlord_id)
        .order_by(LandlordReview.created_at.desc())
    )).scalars().all()
    rating, reviews_count = (await db.execute(
        select(func.avg(LandlordReview.rating), func.count(LandlordReview.id))
        .where(LandlordReview.landlord_id == landlord_id)
    )).one()
    return LandlordProfileRead(
        id=landlord.id,
        display_name=landlord.full_name if landlord.show_full_name else "Арендодатель EV BAKU",
        bio=landlord.bio,
        created_at=landlord.created_at,
        rating=round(float(rating), 1) if rating is not None else None,
        reviews_count=reviews_count,
        listings=[ListingRead.model_validate(listing_to_dict(item)) for item in listings],
        reviews=[review_read(item) for item in reviews],
    )


@router.post("/{landlord_id}/reviews", response_model=LandlordReviewRead, status_code=status.HTTP_201_CREATED)
async def create_landlord_review(
    landlord_id: str,
    payload: LandlordReviewCreate,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
):
    if landlord_id == auth.user.id:
        raise HTTPException(status_code=409, detail="You cannot review your own profile")
    landlord = (await db.execute(select(User.id).where(User.id == landlord_id, User.is_active.is_(True)))).scalar_one_or_none()
    if not landlord:
        raise HTTPException(status_code=404, detail="Landlord profile not found")
    review = LandlordReview(
        landlord_id=landlord_id,
        author_id=auth.user.id,
        rating=payload.rating,
        body=payload.body.strip(),
    )
    db.add(review)
    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise HTTPException(status_code=409, detail="You have already reviewed this landlord") from error
    review = (await db.execute(
        select(LandlordReview).options(selectinload(LandlordReview.author)).where(LandlordReview.id == review.id)
    )).scalar_one()
    return review_read(review)


@router.delete("/{landlord_id}/reviews/{review_id}", response_model=Message)
async def delete_landlord_review(
    landlord_id: str,
    review_id: str,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(delete(LandlordReview).where(
        LandlordReview.id == review_id,
        LandlordReview.landlord_id == landlord_id,
        LandlordReview.author_id == auth.user.id,
    ))
    if not result.rowcount:
        raise HTTPException(status_code=404, detail="Review not found")
    await db.commit()
    return Message(message="Review removed")
