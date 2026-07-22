"""Loading and validating study-area boundary GeoJSON files."""

import json
from pathlib import Path

from geojson_pydantic.geometries import MultiPolygon, Polygon
from pydantic import TypeAdapter

_BOUNDARY_GEOMETRY = TypeAdapter(Polygon | MultiPolygon)


def load_boundary(filepath: Path) -> Polygon | MultiPolygon:
    """Load and validate a study-area boundary GeoJSON file.

    The file must contain a bare GeoJSON geometry object (not a `Feature` or
    `FeatureCollection`) of type `Polygon` or `MultiPolygon`, in WGS84
    (EPSG:4326).

    Args:
        filepath: Path to the `.geojson` file.

    Returns:
        The validated geometry.

    Raises:
        pydantic.ValidationError: If the file's contents aren't a valid
            `Polygon` or `MultiPolygon` geometry.
    """
    with open(filepath) as file:
        raw = json.load(file)

    return _BOUNDARY_GEOMETRY.validate_python(raw)
