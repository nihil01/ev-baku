from fastapi import APIRouter, Request

from ..external import ExchangeRateService
from ..schemas import ExchangeRatesRead

router = APIRouter(tags=["external"])


@router.get("/exchange-rates", response_model=ExchangeRatesRead)
async def exchange_rates(request: Request):
    service: ExchangeRateService = request.app.state.exchange_rates
    values = await service.rates()
    return ExchangeRatesRead(rates={code: float(value) for code, value in values.items()})
