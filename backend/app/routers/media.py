from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..database import get_db
from ..dependencies import AuthContext, csrf_protected, optional_auth
from ..models import Listing, ListingMedia, MediaType
from ..schemas import MediaRead, Message
from ..storage import ObjectStorage

router = APIRouter(tags=["media"])


def requested_byte_range(value: str | None, total: int) -> tuple[int, int] | None:
    if not value:
        return None

    try:
        unit, byte_range = value.strip().split("=", 1)
        if unit.lower() != "bytes" or "," in byte_range:
            raise ValueError
        start_text, end_text = byte_range.split("-", 1)
        if not start_text:
            suffix_length = int(end_text)
            if suffix_length <= 0:
                raise ValueError
            start = max(total - suffix_length, 0)
            end = total - 1
        else:
            start = int(start_text)
            end = int(end_text) if end_text else total - 1
            if start < 0 or start >= total or end < start:
                raise ValueError
            end = min(end, total - 1)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
            detail="Requested range is not satisfiable",
            headers={"Content-Range": f"bytes */{total}"},
        ) from None

    return start, end


def get_storage(request: Request) -> ObjectStorage:
    return request.app.state.storage


@router.post("/listings/{listing_id}/media", response_model=MediaRead, status_code=status.HTTP_201_CREATED)
async def upload_media(
    listing_id: str,
    file: UploadFile = File(...),
    media_type: MediaType = Form(MediaType.image),
    caption: str | None = Form(default=None, max_length=240),
    is_cover: bool = Form(default=False),
    sort_order: int = Form(default=0, ge=0, le=1000),
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
    storage: ObjectStorage = Depends(get_storage),
):
    listing = (await db.execute(select(Listing).where(Listing.id == listing_id, Listing.owner_id == auth.user.id))).scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    object_key, size, content_type = await storage.save_upload(file, auth.user.id, listing.id, media_type)
    if is_cover:
        await db.execute(update(ListingMedia).where(ListingMedia.listing_id == listing.id).values(is_cover=False))
    media = ListingMedia(
        listing_id=listing.id,
        media_type=media_type,
        object_key=object_key,
        content_type=content_type,
        size_bytes=size,
        original_name=(file.filename or "upload")[:255],
        caption=caption,
        sort_order=sort_order,
        is_cover=is_cover,
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)
    return MediaRead(
        id=media.id, media_type=media.media_type, url=f"/api/v1/media/{media.id}", content_type=media.content_type,
        size_bytes=media.size_bytes, original_name=media.original_name, caption=media.caption,
        sort_order=media.sort_order, is_cover=media.is_cover,
    )


@router.get("/media/{media_id}")
async def serve_media(
    media_id: str,
    request: Request,
    auth: AuthContext | None = Depends(optional_auth),
    db: AsyncSession = Depends(get_db),
    storage: ObjectStorage = Depends(get_storage),
):
    media = (await db.execute(
        select(ListingMedia).options(selectinload(ListingMedia.listing)).where(ListingMedia.id == media_id)
    )).scalar_one_or_none()
    if not media or (media.listing.status.value != "published" and (not auth or media.listing.owner_id != auth.user.id)):
        raise HTTPException(status_code=404, detail="Media not found")

    byte_range = requested_byte_range(request.headers.get("range"), media.size_bytes)
    start, end = byte_range or (0, media.size_bytes - 1)
    length = end - start + 1
    try:
        body = await storage.stream(media.object_key, offset=start, length=length)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Media file missing")

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Cache-Control": (
            "public, max-age=86400, immutable"
            if media.listing.status.value == "published"
            else "private, no-store"
        ),
    }
    if byte_range:
        headers["Content-Range"] = f"bytes {start}-{end}/{media.size_bytes}"

    return StreamingResponse(
        body,
        status_code=status.HTTP_206_PARTIAL_CONTENT if byte_range else status.HTTP_200_OK,
        media_type=media.content_type,
        headers=headers,
    )


@router.delete("/media/{media_id}", response_model=Message)
async def delete_media(
    media_id: str,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
    storage: ObjectStorage = Depends(get_storage),
):
    media = (await db.execute(
        select(ListingMedia).join(Listing).where(ListingMedia.id == media_id, Listing.owner_id == auth.user.id)
    )).scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.media_type == MediaType.image:
        image_count = (await db.execute(
            select(func.count(ListingMedia.id)).where(
                ListingMedia.listing_id == media.listing_id,
                ListingMedia.media_type == MediaType.image,
            )
        )).scalar_one()
        listing_status = (await db.execute(
            select(Listing.status).where(Listing.id == media.listing_id)
        )).scalar_one()
        if listing_status.value == "published" and image_count <= 1:
            raise HTTPException(
                status_code=422,
                detail="A published listing must keep at least one property photo",
            )
    await storage.delete(media.object_key)
    await db.delete(media)
    await db.commit()
    return Message(message="Media deleted")


@router.post("/media/{media_id}/cover", response_model=MediaRead)
async def set_media_cover(
    media_id: str,
    auth: AuthContext = Depends(csrf_protected),
    db: AsyncSession = Depends(get_db),
):
    media = (await db.execute(
        select(ListingMedia).join(Listing).where(
            ListingMedia.id == media_id,
            Listing.owner_id == auth.user.id,
        )
    )).scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")
    if media.media_type != MediaType.image:
        raise HTTPException(status_code=422, detail="Only a property photo can be used as the cover")

    await db.execute(
        update(ListingMedia)
        .where(ListingMedia.listing_id == media.listing_id)
        .values(is_cover=False)
    )
    media.is_cover = True
    await db.commit()
    await db.refresh(media)
    return MediaRead(
        id=media.id,
        media_type=media.media_type,
        url=f"/api/v1/media/{media.id}",
        content_type=media.content_type,
        size_bytes=media.size_bytes,
        original_name=media.original_name,
        caption=media.caption,
        sort_order=media.sort_order,
        is_cover=media.is_cover,
    )
