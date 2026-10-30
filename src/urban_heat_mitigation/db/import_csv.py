"""Bounded-memory importer for the processed master CSV."""

import csv
import hashlib
import math
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from geoalchemy2.elements import WKTElement
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Engine

from urban_heat_mitigation.db.connection import create_database_engine
from urban_heat_mitigation.db.models import DatasetImport, GridCell, Observation

DEFAULT_DATA_PATH = (
    Path(__file__).resolve().parents[3]
    / "data"
    / "processed"
    / "Delhi_Master_Dataset.csv"
)
EXPECTED_COLUMNS = {
    "AirTemp", "BuiltSurface", "DistanceToWater", "EVI", "Elevation", "LST",
    "LandCover", "Latitude", "Longitude", "Month", "NDBI", "NDVI", "NDWI",
    "Population", "Slope", "TreeCover", "Year", "WindSpeed", "Humidity",
}
BATCH_SIZE = 2000

OBSERVATION_FIELDS = {
    "air_temp": "AirTemp",
    "built_surface": "BuiltSurface",
    "distance_to_water": "DistanceToWater",
    "evi": "EVI",
    "elevation": "Elevation",
    "lst": "LST",
    "land_cover": "LandCover",
    "ndbi": "NDBI",
    "ndvi": "NDVI",
    "ndwi": "NDWI",
    "population": "Population",
    "slope": "Slope",
    "tree_cover": "TreeCover",
    "wind_speed": "WindSpeed",
    "humidity": "Humidity",
}


def stable_cell_id(latitude: float, longitude: float) -> str:
    """Hash six-decimal coordinates into a stable identifier."""
    key = f"{latitude:.6f},{longitude:.6f}"
    return hashlib.sha256(key.encode("ascii")).hexdigest()


def _numeric(row: dict[str, str], column: str, row_number: int) -> float:
    try:
        value = float(row[column])
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Row {row_number}: {column} must be numeric.") from exc
    if not math.isfinite(value):
        raise ValueError(f"Row {row_number}: {column} must be finite.")
    return value


def parse_row(
    row: dict[str, str], source_sha256: str, row_number: int
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Validate a master CSV row and map it to cell and observation records."""
    latitude = _numeric(row, "Latitude", row_number)
    longitude = _numeric(row, "Longitude", row_number)
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError(f"Row {row_number}: coordinates are outside valid ranges.")
    year_value = _numeric(row, "Year", row_number)
    month_value = _numeric(row, "Month", row_number)
    land_cover_value = _numeric(row, "LandCover", row_number)
    if not year_value.is_integer():
        raise ValueError(f"Row {row_number}: Year must be an integer.")
    if not month_value.is_integer() or not 1 <= month_value <= 12:
        raise ValueError(f"Row {row_number}: Month must be from 1 to 12.")
    if not land_cover_value.is_integer():
        raise ValueError(f"Row {row_number}: LandCover must be an integer code.")

    cell_id = stable_cell_id(latitude, longitude)
    cell = {
        "cell_id": cell_id,
        "latitude": latitude,
        "longitude": longitude,
        "geom": WKTElement(f"POINT({longitude} {latitude})", srid=4326),
    }
    observation: dict[str, Any] = {
        "cell_id": cell_id,
        "year": int(year_value),
        "month": int(month_value),
        "source_sha256": source_sha256,
        "land_cover": int(land_cover_value),
    }
    for field, column in OBSERVATION_FIELDS.items():
        if field != "land_cover":
            observation[field] = _numeric(row, column, row_number)
    return cell, observation


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _batches(path: Path, source_sha256: str) -> Iterator[tuple[list[dict[str, Any]], list[dict[str, Any]]]]:
    with path.open("r", newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        actual_columns = set(reader.fieldnames or [])
        if actual_columns != EXPECTED_COLUMNS:
            missing = sorted(EXPECTED_COLUMNS - actual_columns)
            extra = sorted(actual_columns - EXPECTED_COLUMNS)
            raise ValueError(f"Unexpected CSV schema; missing={missing}, extra={extra}.")

        cells: list[dict[str, Any]] = []
        observations: list[dict[str, Any]] = []
        for row_number, row in enumerate(reader, start=2):
            cell, observation = parse_row(row, source_sha256, row_number)
            cells.append(cell)
            observations.append(observation)
            if len(observations) >= BATCH_SIZE:
                yield cells, observations
                cells, observations = [], []
        if observations:
            yield cells, observations


def import_master_csv(path: str | Path | None = None, engine: Engine | None = None) -> dict[str, int | str]:
    """Import one master file in batches in a single atomic transaction."""
    source_path = Path(
        path or os.getenv("URBAN_HEAT_DATA_PATH") or DEFAULT_DATA_PATH
    ).expanduser().resolve()
    if not source_path.is_file():
        raise FileNotFoundError(f"Master dataset not found: {source_path}")
    source_sha256 = _file_sha256(source_path)
    db_engine = engine or create_database_engine()

    with db_engine.begin() as connection:
        existing = connection.scalar(
            select(DatasetImport.source_sha256).where(
                DatasetImport.source_sha256 == source_sha256
            )
        )
        if existing:
            existing_rows = connection.scalar(
                select(func.count()).select_from(Observation).where(
                    Observation.source_sha256 == source_sha256
                )
            )
            return {
                "rows": int(existing_rows or 0),
                "already_imported": 1,
                "source_sha256": source_sha256,
            }

        connection.execute(
            insert(DatasetImport).values(
                source_sha256=source_sha256,
                source_filename=source_path.name,
                row_count=0,
            )
        )

        imported_rows = 0
        cell_insert = insert(GridCell)
        observation_insert = insert(Observation)
        observation_updates = {
            field: getattr(observation_insert.excluded, field)
            for field in OBSERVATION_FIELDS
        }
        observation_updates.update(
            {
                "year": observation_insert.excluded.year,
                "month": observation_insert.excluded.month,
                "source_sha256": observation_insert.excluded.source_sha256,
            }
        )

        for cells, observations in _batches(source_path, source_sha256):
            connection.execute(
                cell_insert.values(cells).on_conflict_do_nothing(
                    index_elements=[GridCell.cell_id]
                )
            )
            connection.execute(
                observation_insert.values(observations).on_conflict_do_update(
                    index_elements=[
                        Observation.cell_id,
                        Observation.year,
                        Observation.month,
                    ],
                    set_=observation_updates,
                )
            )
            imported_rows += len(observations)

        rows_for_source = connection.scalar(
            select(func.count()).select_from(Observation).where(
                Observation.source_sha256 == source_sha256
            )
        )
        if rows_for_source != imported_rows:
            raise ValueError(
                f"Imported {imported_rows} CSV rows but found {rows_for_source} unique "
                "cell-period observations; duplicate cell-period keys are not allowed."
            )
        connection.execute(
            update(DatasetImport)
            .where(DatasetImport.source_sha256 == source_sha256)
            .values(row_count=imported_rows)
        )
        cell_count = connection.scalar(select(func.count()).select_from(GridCell))

    return {
        "rows": imported_rows,
        "cells": int(cell_count or 0),
        "already_imported": 0,
        "source_sha256": source_sha256,
    }


def main() -> None:
    result = import_master_csv()
    for key, value in result.items():
        print(f"{key}: {value}")
