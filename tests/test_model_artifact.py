import math
import os
from pathlib import Path

import pytest

from urban_heat_mitigation.ml.service import DEFAULT_MODEL_PATH, ModelService
from conftest import SAMPLE


def test_saved_random_forest_loads_and_predicts() -> None:
    artifact_path = Path(
        os.getenv("URBAN_HEAT_MODEL_PATH") or DEFAULT_MODEL_PATH
    ).expanduser()
    if not artifact_path.is_file():
        pytest.skip(f"Model artifact is not present at {artifact_path}.")

    service = ModelService.load(artifact_path)
    prediction = service.predict([SAMPLE])[0]
    importances = service.feature_importances()

    assert math.isfinite(prediction)
    assert 0 <= prediction <= 70
    assert len(importances) == 20
    assert importances == sorted(importances, key=lambda item: item["importance"], reverse=True)
    assert sum(item["importance"] for item in importances) == pytest.approx(1.0)
