import math

import pytest

from urban_heat_mitigation.ml.features import (
    FeatureValidationError,
    prepare_features,
)
from urban_heat_mitigation.ml.schema import FEATURE_COLUMNS
from conftest import SAMPLE


def test_features_match_model_order_and_exclude_observed_target() -> None:
    features = prepare_features([SAMPLE])

    assert tuple(features.columns) == FEATURE_COLUMNS
    assert "LST" not in features.columns
    assert features.loc[0, "Month_sin"] == pytest.approx(math.sin(2 * math.pi * 5 / 12))
    assert features.loc[0, "Month_cos"] == pytest.approx(math.cos(2 * math.pi * 5 / 12))


def test_missing_feature_is_rejected() -> None:
    incomplete = {key: value for key, value in SAMPLE.items() if key != "AirTemp"}

    with pytest.raises(FeatureValidationError, match="AirTemp"):
        prepare_features([incomplete])


@pytest.mark.parametrize("month", [0, 13, 2.5, float("nan")])
def test_unsupported_month_is_rejected(month: float) -> None:
    with pytest.raises(FeatureValidationError, match="Month"):
        prepare_features([{**SAMPLE, "Month": month}])


def test_non_finite_feature_is_rejected() -> None:
    with pytest.raises(FeatureValidationError, match="WindSpeed"):
        prepare_features([{**SAMPLE, "WindSpeed": float("inf")}])
