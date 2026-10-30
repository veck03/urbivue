"""Dashboard aggregates for actual stored observations."""

import logging

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy.exc import SQLAlchemyError

from urban_heat_mitigation.repositories.spatial import (
    query_available_periods,
    query_dashboard_summary,
)
from urban_heat_mitigation.schemas.spatial import (
    AvailablePeriod,
    DashboardSummary,
)
from urban_heat_mitigation.api.validation import validate_period

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["dashboard"])


@router.get("/periods", response_model=list[AvailablePeriod])
def available_periods(request: Request) -> list[AvailablePeriod]:
    try:
        rows = query_available_periods(request.app.state.database_engine)
    except SQLAlchemyError as exc:
        logger.exception("Available period query failed")
        raise HTTPException(status_code=503, detail="Spatial data is temporarily unavailable.") from exc
    return [AvailablePeriod(**row) for row in rows]


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(
    request: Request,
    year: int = Query(ge=1900, le=2100),
    month: int = Query(ge=1, le=12),
) -> DashboardSummary:
    validate_period(year, month)
    try:
        row = query_dashboard_summary(
            request.app.state.database_engine, year=year, month=month
        )
    except SQLAlchemyError as exc:
        logger.exception("Dashboard summary query failed")
        raise HTTPException(status_code=503, detail="Spatial data is temporarily unavailable.") from exc
    return DashboardSummary(year=year, month=month, **row)
