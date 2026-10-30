"""Relational and spatial tables for monthly heat observations."""

from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import (
    DateTime,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class DatasetImport(Base):
    __tablename__ = "dataset_imports"

    source_sha256: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class GridCell(Base):
    __tablename__ = "grid_cells"
    __table_args__ = (
        UniqueConstraint("latitude", "longitude", name="uq_grid_cell_coordinates"),
    )

    cell_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    geom: Mapped[object] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=False),
        nullable=False,
    )


class Observation(Base):
    __tablename__ = "observations"
    __table_args__ = (
        UniqueConstraint("cell_id", "year", "month", name="uq_observation_cell_period"),
        CheckConstraint("month >= 1 AND month <= 12", name="ck_observation_month"),
        Index("idx_observations_period", "year", "month"),
    )

    observation_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cell_id: Mapped[str] = mapped_column(
        ForeignKey("grid_cells.cell_id", ondelete="RESTRICT"), nullable=False
    )
    year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    month: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    source_sha256: Mapped[str] = mapped_column(
        ForeignKey("dataset_imports.source_sha256", ondelete="RESTRICT"), nullable=False
    )
    air_temp: Mapped[float] = mapped_column(Float, nullable=False)
    built_surface: Mapped[float] = mapped_column(Float, nullable=False)
    distance_to_water: Mapped[float] = mapped_column(Float, nullable=False)
    evi: Mapped[float] = mapped_column(Float, nullable=False)
    elevation: Mapped[float] = mapped_column(Float, nullable=False)
    lst: Mapped[float] = mapped_column(Float, nullable=False)
    land_cover: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    ndbi: Mapped[float] = mapped_column(Float, nullable=False)
    ndvi: Mapped[float] = mapped_column(Float, nullable=False)
    ndwi: Mapped[float] = mapped_column(Float, nullable=False)
    population: Mapped[float] = mapped_column(Float, nullable=False)
    slope: Mapped[float] = mapped_column(Float, nullable=False)
    tree_cover: Mapped[float] = mapped_column(Float, nullable=False)
    wind_speed: Mapped[float] = mapped_column(Float, nullable=False)
    humidity: Mapped[float] = mapped_column(Float, nullable=False)
