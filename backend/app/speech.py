import httpx

from .config import Settings


class TranscriptionError(RuntimeError):
    pass


class TranscriptionService:
    """OpenAI-compatible speech-to-text adapter; audio is never stored locally."""

    def __init__(self, settings: Settings):
        self.api_key = settings.openai_api_key
        self.base_url = settings.openai_base_url.rstrip("/")
        self.model = settings.openai_transcription_model
        self.timeout = settings.openai_timeout_seconds

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    async def transcribe(
        self,
        audio: bytes,
        *,
        filename: str,
        content_type: str,
        language: str,
    ) -> str:
        if not self.api_key:
            raise TranscriptionError("Voice transcription is not configured")
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/audio/transcriptions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    data={
                        "model": self.model,
                        "language": language,
                        "prompt": "A short real-estate search query about homes in Baku. Preserve names and numbers.",
                    },
                    files={"file": (filename, audio, content_type)},
                )
                response.raise_for_status()
                text = response.json()["text"]
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
            raise TranscriptionError("Voice transcription is temporarily unavailable") from error
        return str(text).strip()
