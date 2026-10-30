"""GeoJSON and location response schemas."""

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator


class PointGeometry(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]


class HeatmapProperties(BaseModel):
    cell_id: str
    year: int
    month: int
    observed_lst_c: float
    temperature_type: Literal["observed"] = "observed"


class HeatmapFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: PointGeometry
    properties: HeatmapProperties


class HeatmapResponse(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[HeatmapFeature]
    truncated: bool
    limit: int


class LocationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cell_id: str
    latitude: float
    longitude: float
    year: int
    month: int
    observed_lst_c: float
    temperature_type: Literal["observed"] = "observed"
    distance_m: float | None = None
    environmental_features: dict[str, float]


class AvailablePeriod(BaseModel):
    year: int
    month: int


class TemperatureBin(BaseModel):
    label: str
    lower_c: float
    upper_c: float
    cell_count: int


class DashboardSummary(BaseModel):
    year: int
    month: int
    observed_cells: int
    mean_lst_c: float | None
    min_lst_c: float | None
    max_lst_c: float | None
    mean_ndvi: float | None
    mean_tree_cover: float | None
    temperature_bins: list[TemperatureBin]


class ScenarioRequest(BaseModel):
    cell_id: str | None = Field(default=None, min_length=1, max_length=128)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    coordinate_code: str | None = Field(default=None, min_length=3, max_length=64)
    year: int = Field(ge=1900, le=2100)
    month: int = Field(ge=1, le=12)
    changes: dict[str, FiniteFloat] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def validate_request(self) -> "ScenarioRequest":
        has_latitude = self.latitude is not None
        has_longitude = self.longitude is not None
        if has_latitude != has_longitude:
            raise ValueError("Provide both latitude and longitude.")
        has_coordinates = has_latitude and has_longitude
        lookup_count = sum((self.cell_id is not None, has_coordinates, self.coordinate_code is not None))
        if lookup_count != 1:
            raise ValueError("Provide exactly one of cell_id, latitude/longitude, or coordinate_code.")

        if self.coordinate_code is not None:
            match = re.fullmatch(
                r"([+-]?(?:\d+(?:\.\d*)?|\.\d+))-([+-]?(?:\d+(?:\.\d*)?|\.\d+))",
                self.coordinate_code.strip(),
            )
            if not match:
                raise ValueError("Location code must have the format latitude-longitude, for example 28.61-77.21.")
            latitude, longitude = float(match.group(1)), float(match.group(2))
            if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
                raise ValueError("Location code coordinates must be within latitude −90..90 and longitude −180..180.")
            self.latitude = latitude
            self.longitude = longitude

        allowed = {"NDVI", "EVI", "TreeCover", "BuiltSurface"}
        unsupported = sorted(set(self.changes) - allowed)
        if unsupported:
            raise ValueError(f"Unsupported scenario features: {', '.join(unsupported)}.")
        negative_features = sorted(
            feature for feature, value in self.changes.items()
            if feature in {"TreeCover", "BuiltSurface"} and value < 0
        )
        if negative_features:
            raise ValueError(f"{', '.join(negative_features)} values must be non-negative.")
        return self


class ScenarioResponse(BaseModel):
    cell_id: str
    latitude: float
    longitude: float
    distance_m: float | None = None
    year: int
    month: int
    temperature_type: Literal["model_estimate"] = "model_estimate"
    baseline_prediction_c: float
    scenario_prediction_c: float
    estimated_change_c: float
    changes: dict[str, float]
    outside_dataset_range: bool
    assumptions: list[str]


class Hotspot(BaseModel):
    cell_id: str
    latitude: float
    longitude: float
    year: int
    month: int
    observed_lst_c: float
    ndvi: float | None
    tree_cover: float | None
    built_surface: float | None


class FeatureImportance(BaseModel):
    feature: str
    importance: float


class ModelMetadata(BaseModel):
    model_type: Literal["RandomForestRegressor"]
    artifact_name: str
    feature_order: list[str]
    importance_method: Literal["impurity-based global feature importance"]
    feature_importances: list[FeatureImportance]
