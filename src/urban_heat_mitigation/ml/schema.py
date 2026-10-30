"""Feature contract recovered from the saved model's training notebook."""

FEATURE_COLUMNS = (
    "AirTemp",
    "BuiltSurface",
    "DistanceToWater",
    "EVI",
    "Elevation",
    "LandCover",
    "Latitude",
    "Longitude",
    "Month",
    "NDBI",
    "NDVI",
    "NDWI",
    "Population",
    "Slope",
    "TreeCover",
    "Year",
    "WindSpeed",
    "Humidity",
    "Month_sin",
    "Month_cos",
)

BASE_FEATURE_COLUMNS = tuple(
    column for column in FEATURE_COLUMNS if column not in {"Month_sin", "Month_cos"}
)
TARGET_COLUMN = "LST"
