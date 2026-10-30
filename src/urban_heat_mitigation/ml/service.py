"""Load and run the saved Random Forest model."""

import os
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor

from urban_heat_mitigation.ml.features import prepare_features
from urban_heat_mitigation.ml.schema import FEATURE_COLUMNS

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MODEL_PATH = REPOSITORY_ROOT / "artifacts" / "models" / "urban_heat_rf.pkl"


class ModelSchemaError(RuntimeError):
    """Raised when the artifact does not satisfy the verified model contract."""


class ModelService:
    """Validated wrapper around the saved model and its feature contract."""

    def __init__(self, model: RandomForestRegressor, artifact_name: str = "urban_heat_rf.pkl") -> None:
        if not isinstance(model, RandomForestRegressor):
            raise ModelSchemaError(
                "Expected a scikit-learn RandomForestRegressor artifact."
            )
        actual_features = tuple(getattr(model, "feature_names_in_", ()))
        if actual_features != FEATURE_COLUMNS:
            raise ModelSchemaError(
                "Model feature names or order do not match the verified training schema."
            )
        self._model = model
        self.artifact_name = artifact_name

    @classmethod
    def load(cls, path: str | Path | None = None) -> "ModelService":
        """Load the artifact once; `URBAN_HEAT_MODEL_PATH` can override its path."""
        model_path = Path(
            path or os.getenv("URBAN_HEAT_MODEL_PATH") or DEFAULT_MODEL_PATH
        ).expanduser()
        if not model_path.is_file():
            raise FileNotFoundError(f"Model artifact not found: {model_path}")

        # Memory mapping avoids copying the artifact's large tree arrays into RAM.
        model = joblib.load(model_path, mmap_mode="r")
        return cls(model, artifact_name=model_path.name)

    def feature_importances(self) -> list[dict[str, float | str]]:
        """Return global impurity-based importance from the fitted forest."""
        values = np.asarray(self._model.feature_importances_, dtype=float)
        if values.shape != (len(FEATURE_COLUMNS),) or not np.isfinite(values).all():
            raise ModelSchemaError("Model feature-importance values do not match its input schema.")
        ordered = sorted(zip(FEATURE_COLUMNS, values.tolist()), key=lambda item: item[1], reverse=True)
        return [{"feature": feature, "importance": importance} for feature, importance in ordered]

    def predict(self, records: Sequence[Mapping[str, Any]]) -> list[float]:
        """Return model estimates in Celsius for validated observations."""
        features = prepare_features(records)
        predictions = np.asarray(self._model.predict(features), dtype=float)
        if not np.isfinite(predictions).all():
            raise RuntimeError("Model returned a non-finite temperature estimate.")
        return predictions.tolist()
