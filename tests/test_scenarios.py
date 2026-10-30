from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from urban_heat_mitigation.api.routes import scenarios
from urban_heat_mitigation.api.routes.insights import current_model
from urban_heat_mitigation.schemas.spatial import ScenarioRequest
from conftest import SAMPLE


def test_current_model_metadata_uses_loaded_artifact():
    class Model:
        artifact_name = "urban_heat_rf.pkl"

        @staticmethod
        def feature_importances():
            return [{"feature": "NDVI", "importance": 1.0}]

    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(model_service=Model())))
    metadata = current_model(request)

    assert metadata.artifact_name == "urban_heat_rf.pkl"
    assert metadata.feature_importances[0].feature == "NDVI"
    assert metadata.importance_method == "impurity-based global feature importance"


def test_scenario_request_rejects_target_and_unsupported_features() -> None:
    with pytest.raises(ValidationError, match="Unsupported scenario features"):
        ScenarioRequest(cell_id="cell", year=2025, month=5, changes={"LST": 45})


@pytest.mark.parametrize(
    "lookup",
    [
        {},
        {"latitude": 28.6},
        {"cell_id": "cell", "latitude": 28.6, "longitude": 77.2},
    ],
)
def test_scenario_request_requires_exactly_one_lookup_method(lookup) -> None:
    with pytest.raises(ValidationError, match="Provide (both latitude and longitude|exactly one)"):
        ScenarioRequest(year=2025, month=5, changes={"NDVI": 0.3}, **lookup)


def test_scenario_request_accepts_coordinate_pair() -> None:
    request = ScenarioRequest(
        latitude=28.6, longitude=77.2, year=2025, month=5, changes={"NDVI": 0.3}
    )
    assert request.cell_id is None


@pytest.mark.parametrize(
    "lookup",
    [{"latitude": 90.01, "longitude": 77.2}, {"latitude": 28.6, "longitude": 180.01}],
)
def test_scenario_request_rejects_out_of_range_coordinate_pair(lookup) -> None:
    with pytest.raises(ValidationError):
        ScenarioRequest(year=2025, month=5, changes={"NDVI": 0.2}, **lookup)


def test_scenario_request_unpacks_location_code_and_validates_ranges() -> None:
    request = ScenarioRequest(
        coordinate_code="28.61-77.21", year=2025, month=5, changes={"NDVI": -0.2}
    )
    assert request.latitude == pytest.approx(28.61)
    assert request.longitude == pytest.approx(77.21)


@pytest.mark.parametrize("code", ["north-west", "91-77", "28-181", "28.61,77.21"])
def test_scenario_request_rejects_invalid_location_code(code: str) -> None:
    with pytest.raises(ValidationError):
        ScenarioRequest(coordinate_code=code, year=2025, month=5, changes={"NDVI": 0.2})


@pytest.mark.parametrize("feature", ["TreeCover", "BuiltSurface"])
def test_scenario_request_rejects_negative_nonnegative_features(feature: str) -> None:
    with pytest.raises(ValidationError, match="must be non-negative"):
        ScenarioRequest(cell_id="cell", year=2025, month=5, changes={feature: -0.01})


def test_scenario_compares_predictions_and_flags_out_of_dataset_range(monkeypatch) -> None:
    row = {
        "cell_id": "cell-1",
        "latitude": SAMPLE["Latitude"],
        "longitude": SAMPLE["Longitude"],
        "year": 2025,
        "month": 5,
        **{key: value for key, value in SAMPLE.items() if key not in {"LST", "Latitude", "Longitude", "Year", "Month"}},
    }
    monkeypatch.setattr(scenarios, "query_location", lambda *args, **kwargs: row)
    monkeypatch.setattr(
        scenarios,
        "query_scenario_feature_ranges",
        lambda *args: {"NDVI": (-1.0, 1.0), "EVI": (-1.0, 1.0), "TreeCover": (0.0, 1.0), "BuiltSurface": (0.0, 6000.0)},
    )
    calls = []

    class Model:
        def predict(self, records):
            calls.extend(records)
            return [38.0, 36.5]

    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(model_service=Model(), database_engine=object())))
    payload = ScenarioRequest(cell_id="cell-1", year=2025, month=5, changes={"NDVI": 2.0})
    result = scenarios.run_scenario(payload, request)

    assert len(calls) == 2
    assert calls[0]["NDVI"] == SAMPLE["NDVI"]
    assert calls[1]["NDVI"] == 2.0
    assert result.temperature_type == "model_estimate"
    assert result.baseline_prediction_c == 38.0
    assert result.estimated_change_c == -1.5
    assert result.outside_dataset_range is True
    assert any("not a measured temperature" in item for item in result.assumptions)


def test_scenario_returns_404_for_unknown_cell(monkeypatch) -> None:
    monkeypatch.setattr(scenarios, "query_location", lambda *args, **kwargs: None)
    monkeypatch.setattr(scenarios, "query_scenario_feature_ranges", lambda *args: {})
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(database_engine=object())))
    with pytest.raises(HTTPException) as error:
        scenarios.run_scenario(
            ScenarioRequest(cell_id="missing", year=2025, month=5, changes={"NDVI": 0.2}), request
        )
    assert error.value.status_code == 404


def test_scenario_resolves_coordinates_to_nearest_observed_cell(monkeypatch) -> None:
    row = {
        "cell_id": "resolved-cell",
        "latitude": SAMPLE["Latitude"],
        "longitude": SAMPLE["Longitude"],
        "distance_m": 120.0,
        "year": 2025,
        "month": 5,
        **{key: value for key, value in SAMPLE.items() if key not in {"LST", "Latitude", "Longitude", "Year", "Month"}},
    }
    nearest_calls = []

    def nearest(engine, **kwargs):
        nearest_calls.append(kwargs)
        return row

    monkeypatch.setattr(scenarios, "query_nearest_location", nearest)
    monkeypatch.setattr(scenarios, "query_scenario_feature_ranges", lambda *args: {
        "NDVI": (-1.0, 1.0), "EVI": (-1.0, 1.0), "TreeCover": (0.0, 1.0), "BuiltSurface": (0.0, 6000.0)
    })

    class Model:
        @staticmethod
        def predict(records):
            return [38.0, 37.0]

    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
        model_service=Model(), database_engine=object()
    )))
    payload = ScenarioRequest(
        latitude=28.6, longitude=77.2, year=2025, month=5, changes={"NDVI": 0.5}
    )
    result = scenarios.run_scenario(payload, request)

    assert nearest_calls == [{"latitude": 28.6, "longitude": 77.2, "year": 2025, "month": 5}]
    assert result.cell_id == "resolved-cell"
    assert result.latitude == SAMPLE["Latitude"]
    assert result.distance_m == 120.0
    assert result.temperature_type == "model_estimate"
