import logging

import httpx

from .config import Settings


class TranscriptionError(RuntimeError):
    pass


logger = logging.getLogger(__name__)


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
                        "response_format": "json",
                        "prompt": "A short real-estate search query about homes in Baku. Preserve names and numbers.",
                    },
                    files={"file": (filename, audio, content_type)},
                )
                response.raise_for_status()
                text = response.json()["text"]
        except httpx.TimeoutException as error:
            logger.warning("Voice transcription timed out for model %s", self.model)
            raise TranscriptionError("Voice transcription timed out. Please try again") from error
        except httpx.HTTPStatusError as error:
            provider_detail = error.response.text[:500].replace("\n", " ")
            logger.warning(
                "Voice transcription provider rejected the request: status=%s model=%s detail=%s",
                error.response.status_code,
                self.model,
                provider_detail,
            )
            public_message = {
                400: "The voice recording could not be processed. Please record it again",
                401: "Voice transcription authentication failed. Check the server API key",
                403: "Voice transcription is not permitted for this API key",
                404: "Voice transcription endpoint or model is configured incorrectly",
                413: "The voice recording is too large",
                415: "The voice recording format is not supported",
                429: "Voice transcription quota is exhausted. Please try again later",
            }.get(error.response.status_code, "Voice transcription provider is temporarily unavailable")
            raise TranscriptionError(public_message) from error
        except httpx.RequestError as error:
            logger.warning("Voice transcription network error for model %s: %s", self.model, type(error).__name__)
            raise TranscriptionError("Could not connect to the voice transcription provider") from error
        except (KeyError, TypeError, ValueError) as error:
            logger.warning("Voice transcription returned an invalid response for model %s", self.model)
            raise TranscriptionError("Voice transcription provider returned an invalid response") from error
        return str(text).strip()
