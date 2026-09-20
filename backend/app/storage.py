import asyncio
import mimetypes
import os
import tempfile
import uuid
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from minio import Minio

from .config import Settings
from .models import MediaType

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/avif"}
VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}


class ObjectStorage:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client: Minio | None = None
        self.public_client: Minio | None = None

        if settings.storage_backend == "minio":
            # Backend использует этот клиент для загрузки и удаления.
            self.client = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=settings.minio_secure,
                region=settings.minio_region,
            )

            # Этот клиент только формирует ссылки для браузера.
            self.public_client = Minio(
                settings.minio_public_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=settings.minio_public_secure,
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

    async def presigned_url(self, object_key: str) -> str:
        if not self.public_client:
            return ""

        return await asyncio.to_thread(
            self.public_client.presigned_get_object,
            self.settings.minio_bucket,
            object_key,
            expires=timedelta(minutes=15),
        )
