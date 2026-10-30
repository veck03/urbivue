"""Versioned endpoints for observed heat maps and cell lookup."""

import logging

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy.exc import SQLAlchemyError

from urban_heat_mitigation.repositories.spatial import (
    ENVIRONMENTAL_COLUMNS,
    query_heatmap,
    query_location,
    query_nearest_location,
)
from urban_heat_mitigation.api.validation import validate_period
from urban_heat_mitigation.schemas.spatial import (
    HeatmapFeature,
    HeatmapProperties,
    HeatmapResponse,
    LocationResponse,
    PointGeometry,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["spatial data"])
MAX_HEATMAP_FEATURES = 10000


@router.get("/heatmap", response_model=HeatmapResponse)
def heatmap(
    request: Request,
    west: float = Query(ge=-180, le=180),
    south: float = Query(ge=-90, le=90),
    east: float = Query(ge=-180, le=180),
    north: float = Query(ge=-90, le=90),
    year: int = Query(ge=1900, le=2100),
    month: int = Query(ge=1, le=12),
    limit: int = Query(default=2500, ge=1, le=MAX_HEATMAP_FEATURES),
) -> HeatmapResponse:
    if west >= east or south >= north:
        raise HTTPException(
            status_code=422,
            detail="viewport must have west < east and south < north",
        )
    validate_period(year, month)
    try:
        rows = query_heatmap(
            request.app.state.database_engine,
            west=west,
            south=south,
            east=east,
            north=north,
            year=year,
            month=month,
            limit=limit,
        )
    except SQLAlchemyError as exc:
        logger.exception("Heat map database query failed")
        raise HTTPException(
            status_code=503, detail="Spatial data is temporarily unavailable."
        ) from exc

    truncated = len(rows) > limit
    features = [
        HeatmapFeature(
            geometry=PointGeometry(coordinates=(row["longitude"], row["latitude"])),
            properties=HeatmapProperties(
                cell_id=row["cell_id"],
                year=row["year"],
                month=row["month"],
                observed_lst_c=row["observed_lst_c"],
            ),
        )
        for row in rows[:limit]
    ]
    return HeatmapResponse(features=features, truncated=truncated, limit=limit)


@router.get("/locations/nearest", response_model=LocationResponse)
def nearest_location(
    request: Request,
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    year: int = Query(ge=1900, le=2100),
    month: int = Query(ge=1, le=12),
) -> LocationResponse:
    validate_period(year, month)
    try:
        row = query_nearest_location(
            request.app.state.database_engine,
            latitude=latitude,
            longitude=longitude,
            year=year,
            month=month,
        )
    except SQLAlchemyError as exc:
        logger.exception("Nearest location database query failed")
        raise HTTPException(
            status_code=503, detail="Spatial data is temporarily unavailable."
        ) from exc
    if row is None:
        raise HTTPException(
            status_code=404, detail="No observed cell exists for the requested period."
        )
    return LocationResponse(
        **{key: value for key, value in row.items() if key not in ENVIRONMENTAL_COLUMNS},
        environmental_features={key: row[key] for key in ENVIRONMENTAL_COLUMNS},
    )


@router.get("/locations/{cell_id}", response_model=LocationResponse)
def location_details(
    cell_id: str,
    request: Request,
    year: int = Query(ge=1900, le=2100),
    month: int = Query(ge=1, le=12),
) -> LocationResponse:
    validate_period(year, month)
    try:
        row = query_location(
            request.app.state.database_engine,
            cell_id=cell_id,
            year=year,
            month=month,
        )
    except SQLAlchemyError as exc:
        logger.exception("Location detail database query failed")
        raise HTTPException(
            status_code=503, detail="Spatial data is temporarily unavailable."
        ) from exc
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Cell or observation period was not found.",
        )
    return LocationResponse(
        **{key: value for key, value in row.items() if key not in ENVIRONMENTAL_COLUMNS},
        environmental_features={key: row[key] for key in ENVIRONMENTAL_COLUMNS},
    )
