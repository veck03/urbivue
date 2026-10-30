import pytest

from conftest import SAMPLE
from urban_heat_mitigation.db.import_csv import parse_row, stable_cell_id


def test_stable_cell_id_uses_six_decimal_coordinate_key() -> None:
    assert stable_cell_id(28.632586955, 77.204404536) == stable_cell_id(
        28.63258697, 77.20440455
    )


def test_master_row_maps_to_cell_and_observed_observation() -> None:
    cell, observation = parse_row(SAMPLE, "a" * 64, row_number=2)

    assert cell["cell_id"] == stable_cell_id(SAMPLE["Latitude"], SAMPLE["Longitude"])
    assert cell["geom"].srid == 4326
    assert observation["year"] == 2025
    assert observation["month"] == 5
    assert observation["lst"] == SAMPLE["LST"]
    assert observation["source_sha256"] == "a" * 64


def test_non_finite_observed_lst_is_rejected() -> None:
    with pytest.raises(ValueError, match="LST must be finite"):
        parse_row({**SAMPLE, "LST": float("nan")}, "a" * 64, row_number=8)
