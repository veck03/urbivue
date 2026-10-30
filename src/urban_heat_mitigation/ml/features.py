"""Build the verified Random Forest input frame from source observations."""

import math
from collections.abc import Mapping, Sequence
from typing import Any

import pandas as pd

from urban_heat_mitigation.ml.schema import BASE_FEATURE_COLUMNS, FEATURE_COLUMNS


class FeatureValidationError(ValueError):
    """Raised when an observation cannot be represented by the model schema."""


def prepare_features(records: Sequence[Mapping[str, Any]]) -> pd.DataFrame:
    """Validate records and return columns in the model's trained order.

    `LST` may be present as an observed target, but it is deliberately never
    copied into the returned input frame. Month cycle features are recomputed
    from Month to match the training notebook's transformation.
    """
    if not records:
        raise FeatureValidationError("At least one observation is required.")

    prepared: list[dict[str, float]] = []
    for row_number, record in enumerate(records):
        missing = [column for column in BASE_FEATURE_COLUMNS if column not in record]
        if missing:
            raise FeatureValidationError(
                f"Observation {row_number} is missing required features: {', '.join(missing)}."
            )

        values: dict[str, float] = {}
        for column in BASE_FEATURE_COLUMNS:
            value = record[column]
            if isinstance(value, bool):
                raise FeatureValidationError(
                    f"Observation {row_number} feature {column} must be numeric."
                )
            try:
                numeric_value = float(value)
            except (TypeError, ValueError) as exc:
                raise FeatureValidationError(
                    f"Observation {row_number} feature {column} must be numeric."
                ) from exc
            if not math.isfinite(numeric_value):
                raise FeatureValidationError(
                    f"Observation {row_number} feature {column} must be finite."
                )
            values[column] = numeric_value

        month_value = values["Month"]
        if not month_value.is_integer() or not 1 <= month_value <= 12:
            raise FeatureValidationError(
                f"Observation {row_number} Month must be an integer from 1 to 12."
            )

        month_radians = 2 * math.pi * month_value / 12
        values["Month_sin"] = math.sin(month_radians)
        values["Month_cos"] = math.cos(month_radians)
        prepared.append(values)

    return pd.DataFrame(prepared, columns=FEATURE_COLUMNS)
