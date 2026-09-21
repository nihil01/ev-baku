from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..dependencies import AuthContext, csrf_protected, current_auth
from ..models import ChatMessage, Conversation, Favorite, Listing, ListingStatus, User
from ..schemas import ChatMessageCreate, ChatMessageRead, ConversationRead, ListingRead, Message
from ..serializers import listing_to_dict

router = APIRouter(tags=["social"])


async def accessible_conversation(conversation_id: str, user_id: str, db: AsyncSession) -> Conversation:
    item = (await db.execute(select(Conversation).where(
        Conversation.id == conversation_id,
        or_(Conversation.buyer_id == user_id, Conversation.owner_id == user_id),
    ))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return item


@router.get("/me/favorites", response_model=list[ListingRead])
async def favorites(auth: AuthContext = Depends(current_auth), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Listing).join(Favorite, Favorite.listing_id == Listing.id)
        .options(selectinload(Listing.media))
        .where(Favorite.user_id == auth.user.id, Listing.status == ListingStatus.published)
        .order_by(Favorite.created_at.desc())
    )
    return [ListingRead.model_validate(listing_to_dict(item)) for item in result.scalars().unique().all()]


@router.post("/listings/{listing_id}/favorite", response_model=Message, status_code=status.HTTP_201_CREATED)
async def add_favorite(listing_id: str, auth: AuthContext = Depends(csrf_protected), db: AsyncSession = Depends(get_db)):
    listing = (await db.execute(select(Listing).where(
        Listing.id == listing_id, Listing.status == ListingStatus.published
    ))).scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    existing = (await db.execute(select(Favorite.id).where(
        Favorite.user_id == auth.user.id, Favorite.listing_id == listing_id
    ))).scalar_one_or_none()
    if not existing:
        db.add(Favorite(user_id=auth.user.id, listing_id=listing_id))
        await db.commit()
    return Message(message="Added to favorites")


@router.delete("/listings/{listing_id}/favorite", response_model=Message)
async def remove_favorite(listing_id: str, auth: AuthContext = Depends(csrf_protected), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Favorite).where(Favorite.user_id == auth.user.id, Favorite.listing_id == listing_id))
    await db.commit()
    return Message(message="Removed from favorites")


@router.post("/listings/{listing_id}/conversations", response_model=ConversationRead)
async def start_conversation(listing_id: str, auth: AuthContext = Depends(csrf_protected), db: AsyncSession = Depends(get_db)):
    listing = (await db.execute(select(Listing).where(
        Listing.id == listing_id, Listing.status == ListingStatus.published
    ))).scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    if listing.owner_id == auth.user.id:
        raise HTTPException(status_code=409, detail="You cannot start a conversation with yourself")
    conversation = (await db.execute(select(Conversation).where(
        Conversation.listing_id == listing_id, Conversation.buyer_id == auth.user.id
    ))).scalar_one_or_none()
    if not conversation:
        conversation = Conversation(listing_id=listing_id, buyer_id=auth.user.id, owner_id=listing.owner_id)
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)
    owner = (await db.execute(select(User).where(User.id == listing.owner_id))).scalar_one()
    return ConversationRead(id=conversation.id, listing_id=listing.id, listing_title=listing.title,
                            counterpart_name=owner.full_name, counterpart_id=owner.id,
                            updated_at=conversation.updated_at)


@router.get("/me/conversations", response_model=list[ConversationRead])
async def conversations(auth: AuthContext = Depends(current_auth), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Conversation).where(
        or_(Conversation.buyer_id == auth.user.id, Conversation.owner_id == auth.user.id)
    ).order_by(Conversation.updated_at.desc()))).scalars().all()
    output = []
    for item in rows:
        listing = (await db.execute(select(Listing).where(Listing.id == item.listing_id))).scalar_one()
        counterpart_id = item.owner_id if item.buyer_id == auth.user.id else item.buyer_id
        counterpart = (await db.execute(select(User).where(User.id == counterpart_id))).scalar_one()
        last = (await db.execute(select(ChatMessage).where(
            ChatMessage.conversation_id == item.id
        ).order_by(ChatMessage.created_at.desc()).limit(1))).scalar_one_or_none()
        output.append(ConversationRead(
            id=item.id, listing_id=item.listing_id, listing_title=listing.title,
            counterpart_name=counterpart.full_name, counterpart_id=counterpart_id,
            updated_at=item.updated_at,
            last_message=ChatMessageRead.model_validate(last) if last else None,
        ))
    return output


@router.get("/conversations/{conversation_id}/messages", response_model=list[ChatMessageRead])
async def messages(conversation_id: str, auth: AuthContext = Depends(current_auth), db: AsyncSession = Depends(get_db)):
    await accessible_conversation(conversation_id, auth.user.id, db)
    result = await db.execute(select(ChatMessage).where(
        ChatMessage.conversation_id == conversation_id
    ).order_by(ChatMessage.created_at.asc()).limit(500))
    return [ChatMessageRead.model_validate(item) for item in result.scalars().all()]


@router.post("/conversations/{conversation_id}/messages", response_model=ChatMessageRead, status_code=status.HTTP_201_CREATED)
async def send_message(
    conversation_id: str,
    payload: ChatMessageCreate,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
):
    conversation = await accessible_conversation(conversation_id, auth.user.id, db)
    message = ChatMessage(conversation_id=conversation.id, sender_id=auth.user.id, body=payload.body.strip())
    conversation.updated_at = datetime.now(UTC)
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return ChatMessageRead.model_validate(message)
