"""Observed-data hotspot rankings and capped CSV exports."""

import csv
import io
import logging

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import SQLAlchemyError

from urban_heat_mitigation.api.validation import validate_period
from urban_heat_mitigation.ml.schema import FEATURE_COLUMNS
from urban_heat_mitigation.repositories.spatial import (
    query_hotspots,
    query_observation_export,
)
from urban_heat_mitigation.schemas.spatial import Hotspot, ModelMetadata

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["insights and exports"])


@router.get("/models/current", response_model=ModelMetadata)
def current_model(request: Request) -> ModelMetadata:
    model = request.app.state.model_service
    return ModelMetadata(
        model_type="RandomForestRegressor",
        artifact_name=model.artifact_name,
        feature_order=list(FEATURE_COLUMNS),
        importance_method="impurity-based global feature importance",
        feature_importances=model.feature_importances(),
    )


@router.get("/insights/hotspots", response_model=list[Hotspot])
def hotspots(
    request: Request,
    year: int = Query(ge=1900, le=2100),
    month: int = Query(ge=1, le=12),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[Hotspot]:
    validate_period(year, month)
    try:
        rows = query_hotspots(
            request.app.state.database_engine, year=year, month=month, limit=limit
        )
    except SQLAlchemyError as exc:
        logger.exception("Hotspot query failed")
        raise HTTPException(status_code=503, detail="Spatial data is temporarily unavailable.") from exc
    return [Hotspot(**row) for row in rows]


@router.get("/exports/observations.csv")
def export_observations(
    request: Request,
    year: int = Query(ge=1900, le=2100),
    month: int = Query(ge=1, le=12),
    limit: int = Query(default=50000, ge=1, le=50000),
) -> StreamingResponse:
    validate_period(year, month)
    try:
        rows = query_observation_export(
            request.app.state.database_engine, year=year, month=month, limit=limit
        )
    except SQLAlchemyError as exc:
        logger.exception("Observation export query failed")
        raise HTTPException(status_code=503, detail="Spatial data is temporarily unavailable.") from exc

    stream = io.StringIO(newline="")
    fields = [
        "cell_id", "latitude", "longitude", "year", "month", "lst",
        "air_temp", "built_surface", "distance_to_water", "evi", "elevation",
        "land_cover", "ndbi", "ndvi", "ndwi", "population", "slope",
        "tree_cover", "wind_speed", "humidity",
    ]
    writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    stream.seek(0)
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="urban-heat-{year}-{month:02d}.csv"'},
    )
