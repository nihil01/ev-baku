from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse

from ..config import get_settings
from ..external import ExchangeRateService, GeoapifyService
from ..schemas import AddressSuggestion, ExchangeRatesRead

router = APIRouter(tags=["external"])
MAP_STYLE_PATH = Path(__file__).resolve().parents[1] / "data" / "map-style.json"
LOGO_PATH = Path(__file__).resolve().parents[1] / "data" / "logo.png"
VIDEO_MEDIA_TYPES = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
}


def landing_videos() -> list[Path]:
    directory = get_settings().landing_video_path
    if not directory.is_dir():
        return []
    return sorted(
        path for path in directory.iterdir()
        if path.is_file() and path.suffix.lower() in VIDEO_MEDIA_TYPES
    )


@router.get("/map-style.json", include_in_schema=False)
async def map_style():
    return FileResponse(
        MAP_STYLE_PATH,
        media_type="application/json",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/branding/logo.png", include_in_schema=False)
async def brand_logo():
    return FileResponse(
        LOGO_PATH,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/landing-videos", include_in_schema=False)
async def list_landing_videos():
    return [
        {
            "filename": path.name,
            "content_type": VIDEO_MEDIA_TYPES[path.suffix.lower()],
            "size_bytes": path.stat().st_size,
        }
        for path in landing_videos()
    ]


@router.get("/landing-videos/{filename}", include_in_schema=False)
async def landing_video(filename: str):
    directory = get_settings().landing_video_path.resolve()
    path = (directory / filename).resolve()
    if (
        path.parent != directory
        or path.suffix.lower() not in VIDEO_MEDIA_TYPES
        or not path.is_file()
    ):
        raise HTTPException(status_code=404, detail="Landing video not found")
    return FileResponse(
        path,
        media_type=VIDEO_MEDIA_TYPES[path.suffix.lower()],
        headers={
            "Cache-Control": "public, max-age=3600",
            "Accept-Ranges": "bytes",
        },
    )


@router.get("/addresses/autocomplete", response_model=list[AddressSuggestion])
async def address_autocomplete(
    request: Request,
    q: str = Query(min_length=3, max_length=160),
    lang: str = Query(default="ru", pattern="^(az|en|ru)$"),
):
    service: GeoapifyService = request.app.state.geoapify
    return await service.address_autocomplete(q.strip(), lang)


@router.get("/exchange-rates", response_model=ExchangeRatesRead)
async def exchange_rates(request: Request):
    service: ExchangeRateService = request.app.state.exchange_rates
    values = await service.rates()
    return ExchangeRatesRead(
        rates={code: float(value) for code, value in values.items()},
        provider=getattr(service, "provider_name", "configured-provider"),
        updated_at=getattr(service, "updated_at", None),
    )
