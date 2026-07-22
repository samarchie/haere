import json

import pytest
from pydantic import ValidationError

from backend.config.boundary import load_boundary
from backend.tests.config.conftest import VALID_POLYGON

_MULTIPOLYGON = {
    "type": "MultiPolygon",
    "coordinates": [VALID_POLYGON["coordinates"]],
}


@pytest.mark.parametrize(
    "geometry",
    [
        pytest.param(VALID_POLYGON, id="polygon"),
        pytest.param(_MULTIPOLYGON, id="multipolygon"),
    ],
)
def test_load_boundary_accepts_valid_geometry(tmp_path, geometry):
    filepath = tmp_path / "boundary.geojson"
    filepath.write_text(json.dumps(geometry))

    boundary = load_boundary(filepath)

    assert boundary.type == geometry["type"]


@pytest.mark.parametrize(
    "geojson",
    [
        pytest.param({"type": "Point", "coordinates": [172.6, -43.6]}, id="point"),
        pytest.param(
            {"type": "Feature", "properties": {}, "geometry": VALID_POLYGON},
            id="feature_wrapper",
        ),
    ],
)
def test_load_boundary_rejects_non_polygon_geometry(tmp_path, geojson):
    filepath = tmp_path / "boundary.geojson"
    filepath.write_text(json.dumps(geojson))

    with pytest.raises(ValidationError):
        load_boundary(filepath)
