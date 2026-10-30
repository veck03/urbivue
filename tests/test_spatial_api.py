import asyncio
import math
import os
from types import SimpleNamespace

import pytest

from urban_heat_mitigation.api.routes.spatial import (
    heatmap,
    location_details,
    nearest_location,
)
from urban_heat_mitigation.api.routes.dashboard import (
    available_periods,
    dashboard_summary,
)
from urban_heat_mitigation.api.routes.insights import export_observations, hotspots
from urban_heat_mitigation.api.routes.scenarios import run_scenario
from urban_heat_mitigation.db.connection import create_database_engine
from urban_heat_mitigation.ml.service import ModelService
from urban_heat_mitigation.schemas.spatial import ScenarioRequest
from fastapi import HTTPException


def test_heatmap_rejects_invalid_viewport_before_database_access() -> None:
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))

    with pytest.raises(HTTPException) as error:
        heatmap(
            request,
            west=77.4,
            south=28.4,
            east=76.8,
            north=29.0,
            year=2025,
            month=5,
            limit=100,
        )

    assert error.value.status_code == 422


@pytest.mark.skipif(
    os.getenv("URBAN_HEAT_RUN_DB_TESTS") != "1",
    reason="Set URBAN_HEAT_RUN_DB_TESTS=1 to run PostGIS integration checks.",
)
def test_heatmap_nearest_and_location_endpoints_use_observed_data() -> None:
    engine = create_database_engine()
    request = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(database_engine=engine))
    )
    try:
        heatmap_response = heatmap(
            request,
            west=76.8,
            south=28.4,
            east=77.4,
            north=29.0,
            year=2025,
            month=5,
            limit=1,
        )
        assert heatmap_response.type == "FeatureCollection"
        assert len(heatmap_response.features) == 1
        assert heatmap_response.truncated is True
        feature = heatmap_response.features[0]
        assert feature.properties.temperature_type == "observed"
        assert feature.properties.observed_lst_c > 0

        nearest = nearest_location(
            request,
            latitude=feature.geometry.coordinates[1],
            longitude=feature.geometry.coordinates[0],
            year=2025,
            month=5,
        )
        assert nearest.cell_id == feature.properties.cell_id
        assert nearest.distance_m == pytest.approx(0, abs=1)
        assert nearest.temperature_type == "observed"
        assert "AirTemp" in nearest.environmental_features

        class ScenarioModel:
            @staticmethod
            def predict(records):
                assert records[0]["Latitude"] == pytest.approx(nearest.latitude)
                assert records[0]["Longitude"] == pytest.approx(nearest.longitude)
                return [39.0, 38.0]

        scenario_request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
            database_engine=engine, model_service=ScenarioModel()
        )))
        scenario = run_scenario(
            ScenarioRequest(
                coordinate_code=f"{nearest.latitude}-{nearest.longitude}",
                year=2025,
                month=5,
                changes={"NDVI": nearest.environmental_features["NDVI"]},
            ),
            scenario_request,
        )
        assert scenario.cell_id == nearest.cell_id
        assert scenario.distance_m == pytest.approx(0, abs=1)
        assert scenario.temperature_type == "model_estimate"

        real_model_scenario = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
            database_engine=engine, model_service=ModelService.load()
        )))
        actual_result = run_scenario(
            ScenarioRequest(
                coordinate_code=f"{nearest.latitude}-{nearest.longitude}",
                year=2025,
                month=5,
                changes={"NDVI": nearest.environmental_features["NDVI"]},
            ),
            real_model_scenario,
        )
        assert math.isfinite(actual_result.baseline_prediction_c)
        assert actual_result.estimated_change_c == pytest.approx(0, abs=1e-9)

        detail = location_details(
            feature.properties.cell_id,
            request,
            year=2025,
            month=5,
        )
        assert detail.observed_lst_c == feature.properties.observed_lst_c
        assert detail.environmental_features == nearest.environmental_features

        periods = available_periods(request)
        assert len(periods) == 22
        assert periods[0].year == 2025 and periods[0].month == 11

        summary = dashboard_summary(request, year=2025, month=5)
        assert summary.observed_cells == 49257
        assert sum(item.cell_count for item in summary.temperature_bins) == 49257
        assert summary.mean_lst_c is not None

        ranked = hotspots(request, year=2025, month=5, limit=3)
        assert len(ranked) == 3
        assert ranked[0].observed_lst_c >= ranked[1].observed_lst_c
        assert ranked[0].year == 2025 and ranked[0].month == 5

        export = export_observations(request, year=2025, month=5, limit=2)
        async def read_export() -> str:
            return "".join([chunk async for chunk in export.body_iterator])
        export_text = asyncio.run(read_export())
        assert export.media_type == "text/csv"
        assert "cell_id,latitude,longitude,year,month,lst" in export_text
        assert len(export_text.strip().splitlines()) == 3

        with pytest.raises(HTTPException) as error:
            nearest_location(
                request,
                latitude=28.6,
                longitude=77.2,
                year=1900,
                month=1,
            )
        assert error.value.status_code == 404
    finally:
        engine.dispose()
