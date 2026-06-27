from fastapi import APIRouter
from app.models.schemas import ForecastResult
from app.services.forecasting import get_forecast

router = APIRouter()

@router.get("/enterprisers", response_model=ForecastResult)
def read_enterpriser_forecast(days: int = 7):
    """Returns a forecast of new enterprisers for the specified number of days."""
    return get_forecast(days)
