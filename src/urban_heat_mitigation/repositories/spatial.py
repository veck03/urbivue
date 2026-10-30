"""Spatial queries for viewport heat maps and selected locations."""

from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

ENVIRONMENTAL_COLUMNS = (
    "AirTemp",
    "BuiltSurface",
    "DistanceToWater",
    "EVI",
    "Elevation",
    "LandCover",
    "NDBI",
    "NDVI",
    "NDWI",
    "Population",
    "Slope",
    "TreeCover",
    "WindSpeed",
    "Humidity",
)

_ENVIRONMENTAL_COLUMNS = """
    o.air_temp AS "AirTemp",
    o.built_surface AS "BuiltSurface",
    o.distance_to_water AS "DistanceToWater",
    o.evi AS "EVI",
    o.elevation AS "Elevation",
    o.land_cover AS "LandCover",
    o.ndbi AS "NDBI",
    o.ndvi AS "NDVI",
    o.ndwi AS "NDWI",
    o.population AS "Population",
    o.slope AS "Slope",
    o.tree_cover AS "TreeCover",
    o.wind_speed AS "WindSpeed",
    o.humidity AS "Humidity"
"""


def query_heatmap(
    engine: Engine,
    *,
    west: float,
    south: float,
    east: float,
    north: float,
    year: int,
    month: int,
    limit: int,
) -> list[dict[str, Any]]:
    statement = text(
        """
        SELECT c.cell_id, ST_X(c.geom) AS longitude, ST_Y(c.geom) AS latitude,
               o.year, o.month, o.lst AS observed_lst_c
        FROM grid_cells AS c
        JOIN observations AS o ON o.cell_id = c.cell_id
        WHERE o.year = :year AND o.month = :month
          AND c.geom && ST_MakeEnvelope(:west, :south, :east, :north, 4326)
        ORDER BY c.cell_id
        LIMIT :limit_plus_one
        """
    )
    with engine.connect() as connection:
        return [
            dict(row)
            for row in connection.execute(
                statement,
                {
                    "west": west,
                    "south": south,
                    "east": east,
                    "north": north,
                    "year": year,
                    "month": month,
                    "limit_plus_one": limit + 1,
                },
            ).mappings()
        ]


def query_nearest_location(
    engine: Engine, *, latitude: float, longitude: float, year: int, month: int
) -> dict[str, Any] | None:
    statement = text(
        f"""
        SELECT c.cell_id, c.latitude, c.longitude, o.year, o.month,
               o.lst AS observed_lst_c,
               ST_DistanceSphere(
                   c.geom,
                   ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
               ) AS distance_m,
               {_ENVIRONMENTAL_COLUMNS}
        FROM grid_cells AS c
        JOIN observations AS o ON o.cell_id = c.cell_id
        WHERE o.year = :year AND o.month = :month
        ORDER BY ST_DistanceSphere(
            c.geom, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
        )
        LIMIT 1
        """
    )
    with engine.connect() as connection:
        row = connection.execute(
            statement,
            {"latitude": latitude, "longitude": longitude, "year": year, "month": month},
        ).mappings().first()
    return dict(row) if row else None


def query_location(
    engine: Engine, *, cell_id: str, year: int, month: int
) -> dict[str, Any] | None:
    statement = text(
        f"""
        SELECT c.cell_id, c.latitude, c.longitude, o.year, o.month,
               o.lst AS observed_lst_c,
               NULL::double precision AS distance_m,
               {_ENVIRONMENTAL_COLUMNS}
        FROM grid_cells AS c
        JOIN observations AS o ON o.cell_id = c.cell_id
        WHERE c.cell_id = :cell_id AND o.year = :year AND o.month = :month
        LIMIT 1
        """
    )
    with engine.connect() as connection:
        row = connection.execute(
            statement, {"cell_id": cell_id, "year": year, "month": month}
        ).mappings().first()
    return dict(row) if row else None


def query_scenario_feature_ranges(engine: Engine) -> dict[str, tuple[float, float]]:
    """Return master-dataset support bounds for the permitted scenario inputs."""
    with engine.connect() as connection:
        row = connection.execute(
            text(
                """
                SELECT MIN(ndvi) AS ndvi_min, MAX(ndvi) AS ndvi_max,
                       MIN(evi) AS evi_min, MAX(evi) AS evi_max,
                       MIN(tree_cover) AS tree_cover_min, MAX(tree_cover) AS tree_cover_max,
                       MIN(built_surface) AS built_surface_min,
                       MAX(built_surface) AS built_surface_max
                FROM observations
                """
            )
        ).mappings().one()
    return {
        "NDVI": (row["ndvi_min"], row["ndvi_max"]),
        "EVI": (row["evi_min"], row["evi_max"]),
        "TreeCover": (row["tree_cover_min"], row["tree_cover_max"]),
        "BuiltSurface": (row["built_surface_min"], row["built_surface_max"]),
    }


def query_available_periods(engine: Engine) -> list[dict[str, int]]:
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT DISTINCT year, month FROM observations "
                "ORDER BY year DESC, month DESC"
            )
        ).mappings()
        return [dict(row) for row in rows]


def query_dashboard_summary(engine: Engine, *, year: int, month: int) -> dict[str, Any]:
    with engine.connect() as connection:
        summary = connection.execute(
            text(
                """
                SELECT COUNT(DISTINCT cell_id) AS observed_cells,
                       AVG(lst) AS mean_lst_c,
                       MIN(lst) AS min_lst_c,
                       MAX(lst) AS max_lst_c,
                       AVG(ndvi) AS mean_ndvi,
                       AVG(tree_cover) AS mean_tree_cover
                FROM observations
                WHERE year = :year AND month = :month
                """
            ),
            {"year": year, "month": month},
        ).mappings().one()
        bins = connection.execute(
            text(
                """
                SELECT FLOOR(lst / 5.0) * 5 AS lower_c, COUNT(*) AS cell_count
                FROM observations
                WHERE year = :year AND month = :month
                GROUP BY FLOOR(lst / 5.0) * 5
                ORDER BY lower_c
                """
            ),
            {"year": year, "month": month},
        ).mappings()

    temperature_bins = [
        {
            "lower_c": float(row["lower_c"]),
            "upper_c": float(row["lower_c"] + 5),
            "label": f"{float(row['lower_c']):g}–{float(row['lower_c'] + 5):g}°",
            "cell_count": int(row["cell_count"]),
        }
        for row in bins
    ]
    return {**dict(summary), "temperature_bins": temperature_bins}


def query_hotspots(engine: Engine, *, year: int, month: int, limit: int) -> list[dict[str, Any]]:
    """Rank observed cells by stored LST for one period."""
    statement = text(
        """
        SELECT c.cell_id, c.latitude, c.longitude, o.year, o.month,
               o.lst AS observed_lst_c, o.ndvi, o.tree_cover, o.built_surface
        FROM observations AS o
        JOIN grid_cells AS c ON c.cell_id = o.cell_id
        WHERE o.year = :year AND o.month = :month
        ORDER BY o.lst DESC, c.cell_id
        LIMIT :limit
        """
    )
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(
            statement, {"year": year, "month": month, "limit": limit}
        ).mappings()]


def query_observation_export(
    engine: Engine, *, year: int, month: int, limit: int
) -> list[dict[str, Any]]:
    """Return a capped, deterministic selected-period export."""
    statement = text(
        """
        SELECT c.cell_id, c.latitude, c.longitude, o.year, o.month, o.lst,
               o.air_temp, o.built_surface, o.distance_to_water, o.evi,
               o.elevation, o.land_cover, o.ndbi, o.ndvi, o.ndwi, o.population,
               o.slope, o.tree_cover, o.wind_speed, o.humidity
        FROM observations AS o
        JOIN grid_cells AS c ON c.cell_id = o.cell_id
        WHERE o.year = :year AND o.month = :month
        ORDER BY c.cell_id
        LIMIT :limit
        """
    )
    with engine.connect() as connection:
        return [dict(row) for row in connection.execute(
            statement, {"year": year, "month": month, "limit": limit}
        ).mappings()]
