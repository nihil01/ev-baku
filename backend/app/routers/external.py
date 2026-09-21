from fastapi import APIRouter, Query, Request

from ..external import ExchangeRateService, GeoapifyService
from ..schemas import AddressSuggestion, ExchangeRatesRead

router = APIRouter(tags=["external"])


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
    return ExchangeRatesRead(rates={code: float(value) for code, value in values.items()})
