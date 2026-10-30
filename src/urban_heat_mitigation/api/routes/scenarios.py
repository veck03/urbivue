"""Model-based cooling scenario endpoint."""

import logging

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.exc import SQLAlchemyError

from urban_heat_mitigation.ml.features import FeatureValidationError
from urban_heat_mitigation.repositories.spatial import (
    query_location,
    query_nearest_location,
    query_scenario_feature_ranges,
)
from urban_heat_mitigation.schemas.spatial import ScenarioRequest, ScenarioResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/scenarios", tags=["scenarios"])


@router.post("", response_model=ScenarioResponse)
def run_scenario(payload: ScenarioRequest, request: Request) -> ScenarioResponse:
    """Compare baseline and modified model estimates for a stored cell."""
    try:
        engine = request.app.state.database_engine
        if payload.cell_id is not None:
            row = query_location(
                engine,
                cell_id=payload.cell_id,
                year=payload.year,
                month=payload.month,
            )
        else:
            row = query_nearest_location(
                engine,
                latitude=payload.latitude,
                longitude=payload.longitude,
                year=payload.year,
                month=payload.month,
            )
        ranges = query_scenario_feature_ranges(engine)
    except SQLAlchemyError as exc:
        logger.exception("Scenario data query failed")
        raise HTTPException(status_code=503, detail="Spatial data is temporarily unavailable.") from exc
    if row is None:
        raise HTTPException(status_code=404, detail="Cell or observation period was not found.")

    baseline = {
        key: row[key]
        for key in (
            "AirTemp", "BuiltSurface", "DistanceToWater", "EVI", "Elevation",
            "LandCover", "NDBI", "NDVI", "NDWI", "Population", "Slope",
            "TreeCover", "WindSpeed", "Humidity",
        )
    }
    baseline.update({"Latitude": row["latitude"], "Longitude": row["longitude"], "Year": row["year"], "Month": row["month"]})
    scenario = dict(baseline)
    outside = False
    for name, value in payload.changes.items():
        minimum, maximum = ranges[name]
        if minimum is None or maximum is None:
            raise HTTPException(status_code=422, detail=f"No dataset support range is available for {name}.")
        outside = outside or not minimum <= value <= maximum
        scenario[name] = value

    try:
        predictions = request.app.state.model_service.predict([baseline, scenario])
    except FeatureValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=f"Scenario inputs cannot be evaluated: {exc}") from exc

    return ScenarioResponse(
        cell_id=row["cell_id"],
        latitude=row["latitude"],
        longitude=row["longitude"],
        distance_m=row.get("distance_m"),
        year=payload.year,
        month=payload.month,
        baseline_prediction_c=predictions[0],
        scenario_prediction_c=predictions[1],
        estimated_change_c=predictions[1] - predictions[0],
        changes=payload.changes,
        outside_dataset_range=outside,
        assumptions=[
            "This is a model-based what-if estimate, not a measured temperature or causal cooling effect.",
            "Changes are absolute feature values; other correlated features remain fixed.",
            "Dataset min/max bounds are a coarse support check, not a complete training-distribution test.",
        ],
    )
