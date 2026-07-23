"""Loading and validating study-area boundary files in any geospatial format."""

from pathlib import Path
from typing import cast

import geopandas as gpd
from shapely import MultiPolygon, Polygon


def load_boundary(filepath: Path) -> Polygon | MultiPolygon:
    """Load and validate a study-area boundary from any geospatial file format.

    Reads `filepath` with `geopandas.read_file`, so any vector format GDAL/OGR
    supports works (Shapefile, GeoPackage, GeoJSON, KML, etc.). Non-polygon
    features are dropped; the remaining Polygon/MultiPolygon features are
    unioned into a single geometry and reprojected to WGS84 (EPSG:4326).

    Args:
        filepath: Path to a vector file readable by `geopandas.read_file`.

    Returns:
        The unioned boundary geometry, in EPSG:4326.

    Raises:
        ValueError: If the file has no declared CRS, or contains no
            Polygon/MultiPolygon features.
    """
    gdf = gpd.read_file(filepath)

    if gdf.crs is None:
        raise ValueError(
            f"{filepath} has no declared CRS; cannot safely reproject to WGS84"
        )

    polygons = gdf[gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    if polygons.empty:
        raise ValueError(f"{filepath} contains no Polygon/MultiPolygon features")

    return cast(Polygon | MultiPolygon, polygons.to_crs(epsg=4326).union_all())
