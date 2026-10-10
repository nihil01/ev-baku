import asyncio
import io
import mimetypes
import os
import tempfile
import uuid
from collections.abc import Iterator
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from minio import Minio
from PIL import Image, ImageOps, UnidentifiedImageError

from .config import Settings
from .models import MediaType

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/avif"}
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
WATERMARK_PATH = Path(__file__).parent / "data" / "logo.png"
IMAGE_FORMATS = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
    "image/avif": "AVIF",
}


def validate_video_signature(stream, content_type: str) -> None:
    """Reject an arbitrary file whose client-provided MIME type says video."""
    stream.seek(0)
    header = stream.read(16)
    stream.seek(0)
    is_webm = content_type == "video/webm" and header.startswith(b"\x1aE\xdf\xa3")
    is_iso_media = content_type in {"video/mp4", "video/quicktime"} and len(header) >= 12 and header[4:8] == b"ftyp"
    if not (is_webm or is_iso_media):
        raise HTTPException(status_code=422, detail="Invalid or damaged video")


def add_watermark(source: bytes, content_type: str) -> bytes:
    """Bake a small, translucent brand mark into an uploaded image."""
    try:
        with Image.open(io.BytesIO(source)) as opened:
            opened.load()
            image = ImageOps.exif_transpose(opened).convert("RGBA")
        with Image.open(WATERMARK_PATH) as opened_logo:
            logo = opened_logo.convert("RGBA")
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as error:
        raise HTTPException(status_code=422, detail="Invalid or damaged image") from error

    target_width = max(4, min(180, round(image.width * 0.14), round(image.height * 0.26)))
    target_height = max(1, round(logo.height * target_width / logo.width))
    logo = logo.resize((target_width, target_height), Image.Resampling.LANCZOS)
    logo_alpha = logo.getchannel("A").point(lambda value: round(value * 0.36))
    logo.putalpha(logo_alpha)

    position = (
        max(0, (image.width - logo.width) // 2),
        max(0, (image.height - logo.height) // 2),
    )
    image.alpha_composite(logo, position)

    output = io.BytesIO()
    image_format = IMAGE_FORMATS[content_type]
    if image_format == "JPEG":
        image.convert("RGB").save(output, image_format, quality=90, optimize=True, progressive=True)
    elif image_format == "PNG":
        image.save(output, image_format, optimize=True)
    elif image_format == "WEBP":
        image.save(output, image_format, quality=90, method=6)
    else:
        image.save(output, image_format, quality=85)
    return output.getvalue()


class ObjectStorage:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client: Minio | None = None

        if settings.storage_backend == "minio":
            self.client = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=settings.minio_secure,
                region=settings.minio_region,
            )

    async def initialize(self) -> None:
        if self.client:
            last_error: Exception | None = None
            for attempt in range(20):
                try:
                    exists = await asyncio.to_thread(self.client.bucket_exists, self.settings.minio_bucket)
                    if not exists:
                        await asyncio.to_thread(self.client.make_bucket, self.settings.minio_bucket)
                    return
                except Exception as error:  # noqa: BLE001 - network clients raise several transport exceptions.
                    last_error = error
                    if attempt < 19:
                        await asyncio.sleep(1)
            raise RuntimeError("Object storage is unavailable") from last_error
        else:
            self.settings.local_storage_path.mkdir(parents=True, exist_ok=True)

    async def save_upload(self, upload: UploadFile, user_id: str, listing_id: str, media_type: MediaType) -> tuple[str, int, str]:
        content_type = (upload.content_type or mimetypes.guess_type(upload.filename or "")[0] or "application/octet-stream").lower()
        allowed = VIDEO_TYPES if media_type == MediaType.video else IMAGE_TYPES
        if content_type not in allowed:
            raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported media type")
        limit = (self.settings.max_video_mb if media_type == MediaType.video else self.settings.max_image_mb) * 1024 * 1024
        suffix = Path(upload.filename or "upload").suffix.lower()[:10]
        object_key = f"users/{user_id}/listings/{listing_id}/{uuid.uuid4().hex}{suffix}"

        size = 0
        with tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024) as stream:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File is too large")
                stream.write(chunk)
            if size == 0:
                raise HTTPException(status_code=422, detail="Empty file")
            stream.seek(0)
            if media_type == MediaType.video:
                validate_video_signature(stream, content_type)
            else:
                watermarked = await asyncio.to_thread(add_watermark, stream.read(), content_type)
                size = len(watermarked)
                stream.seek(0)
                stream.truncate(0)
                stream.write(watermarked)
                stream.seek(0)
            if self.client:
                await asyncio.to_thread(
                    self.client.put_object,
                    self.settings.minio_bucket,
                    object_key,
                    stream,
                    size,
                    content_type=content_type,
                )
            else:
                target = self.settings.local_storage_path / object_key
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("wb") as destination:
                    while chunk := stream.read(1024 * 1024):
                        destination.write(chunk)
        return object_key, size, content_type

    async def delete(self, object_key: str) -> None:
        if self.client:
            await asyncio.to_thread(self.client.remove_object, self.settings.minio_bucket, object_key)
        else:
            path = self.settings.local_storage_path / object_key
            if path.exists():
                await asyncio.to_thread(os.remove, path)

    async def stream(
        self,
        object_key: str,
        *,
        offset: int = 0,
        length: int | None = None,
    ) -> Iterator[bytes]:
        """Read an object without exposing the storage endpoint to the browser."""
        chunk_size = 1024 * 1024

        if self.client:
            response = await asyncio.to_thread(
                self.client.get_object,
                self.settings.minio_bucket,
                object_key,
                offset=offset,
                length=length or 0,
            )

            def minio_chunks() -> Iterator[bytes]:
                try:
                    yield from response.stream(chunk_size)
                finally:
                    response.close()
                    response.release_conn()

            return minio_chunks()

        root = self.settings.local_storage_path.resolve()
        path = (root / object_key).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise FileNotFoundError(object_key)

        def local_chunks() -> Iterator[bytes]:
            remaining = length
            with path.open("rb") as source:
                source.seek(offset)
                while remaining is None or remaining > 0:
                    read_size = chunk_size if remaining is None else min(chunk_size, remaining)
                    chunk = source.read(read_size)
                    if not chunk:
                        break
                    yield chunk
                    if remaining is not None:
                        remaining -= len(chunk)

        return local_chunks()
