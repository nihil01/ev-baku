from pathlib import Path

from fastapi import APIRouter, Query, Request
from fastapi.responses import FileResponse

from ..external import ExchangeRateService, GeoapifyService
from ..schemas import AddressSuggestion, ExchangeRatesRead

router = APIRouter(tags=["external"])
MAP_STYLE_PATH = Path(__file__).resolve().parents[1] / "data" / "map-style.json"
LOGO_PATH = Path(__file__).resolve().parents[1] / "data" / "logo.png"


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
