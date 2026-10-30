"""Initial grid, observation, and import provenance tables."""

from typing import Sequence, Union

from alembic import op
import geoalchemy2
import sqlalchemy as sa

revision: str = "0001_initial_spatial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "dataset_imports",
        sa.Column("source_sha256", sa.String(length=64), primary_key=True),
        sa.Column("source_filename", sa.String(length=255), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "imported_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_table(
        "grid_cells",
        sa.Column("cell_id", sa.String(length=64), primary_key=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column(
            "geom",
            geoalchemy2.Geometry(
                geometry_type="POINT", srid=4326, spatial_index=False
            ),
            nullable=False,
        ),
        sa.UniqueConstraint("latitude", "longitude", name="uq_grid_cell_coordinates"),
    )
    op.create_index(
        "idx_grid_cells_geom", "grid_cells", ["geom"], postgresql_using="gist"
    )
    op.create_table(
        "observations",
        sa.Column("observation_id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("cell_id", sa.String(length=64), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=False),
        sa.Column("month", sa.SmallInteger(), nullable=False),
        sa.Column("source_sha256", sa.String(length=64), nullable=False),
        sa.Column("air_temp", sa.Float(), nullable=False),
        sa.Column("built_surface", sa.Float(), nullable=False),
        sa.Column("distance_to_water", sa.Float(), nullable=False),
        sa.Column("evi", sa.Float(), nullable=False),
        sa.Column("elevation", sa.Float(), nullable=False),
        sa.Column("lst", sa.Float(), nullable=False),
        sa.Column("land_cover", sa.SmallInteger(), nullable=False),
        sa.Column("ndbi", sa.Float(), nullable=False),
        sa.Column("ndvi", sa.Float(), nullable=False),
        sa.Column("ndwi", sa.Float(), nullable=False),
        sa.Column("population", sa.Float(), nullable=False),
        sa.Column("slope", sa.Float(), nullable=False),
        sa.Column("tree_cover", sa.Float(), nullable=False),
        sa.Column("wind_speed", sa.Float(), nullable=False),
        sa.Column("humidity", sa.Float(), nullable=False),
        sa.CheckConstraint("month >= 1 AND month <= 12", name="ck_observation_month"),
        sa.ForeignKeyConstraint(["cell_id"], ["grid_cells.cell_id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["source_sha256"], ["dataset_imports.source_sha256"], ondelete="RESTRICT"
        ),
        sa.UniqueConstraint(
            "cell_id", "year", "month", name="uq_observation_cell_period"
        ),
    )
    op.create_index(
        "idx_observations_period", "observations", ["year", "month"]
    )


def downgrade() -> None:
    op.drop_index("idx_observations_period", table_name="observations")
    op.drop_table("observations")
    op.drop_index("idx_grid_cells_geom", table_name="grid_cells")
    op.drop_table("grid_cells")
    op.drop_table("dataset_imports")
