import geopandas as gpd
import pytest
from shapely.geometry import MultiPolygon, Point, Polygon

from backend.config.boundary import load_boundary
from backend.tests.config.conftest import VALID_POLYGON

_POLYGON = Polygon(VALID_POLYGON["coordinates"][0])
_OTHER_POLYGON = Polygon(
    [(180.0, -43.6), (180.1, -43.6), (180.1, -43.5), (180.0, -43.5)]
)


@pytest.mark.parametrize(
    "geometries",
    [
        pytest.param([_POLYGON], id="single_polygon"),
        pytest.param([MultiPolygon([_POLYGON])], id="multipolygon"),
    ],
)
def test_load_boundary_accepts_valid_geometry(tmp_path, geometries):
    filepath = tmp_path / "boundary.geojson"
    gpd.GeoDataFrame({"geometry": geometries}, crs="EPSG:4326").to_file(filepath)

    boundary = load_boundary(filepath)

    assert boundary.geom_type in ("Polygon", "MultiPolygon")


def test_load_boundary_unions_multiple_polygon_features(tmp_path):
    filepath = tmp_path / "boundary.geojson"
    gpd.GeoDataFrame({"geometry": [_POLYGON, _OTHER_POLYGON]}, crs="EPSG:4326").to_file(
        filepath
    )

    boundary: MultiPolygon = load_boundary(filepath)  # type: ignore

    assert boundary.geom_type == "MultiPolygon"
    assert len(boundary.geoms) == 2


def test_load_boundary_reprojects_to_wgs84(tmp_path):
    filepath = tmp_path / "boundary.gpkg"
    gpd.GeoDataFrame({"geometry": [_POLYGON]}, crs="EPSG:4326").to_crs(
        epsg=2193
    ).to_file(filepath)

    boundary = load_boundary(filepath)

    minx, miny, maxx, maxy = boundary.bounds
    assert -180 <= minx <= 180
    assert -90 <= miny <= 90


def test_load_boundary_ignores_non_polygon_features(tmp_path):
    filepath = tmp_path / "boundary.geojson"
    gpd.GeoDataFrame(
        {"geometry": [_POLYGON, Point(172.6, -43.6)]}, crs="EPSG:4326"
    ).to_file(filepath)

    boundary = load_boundary(filepath)

    assert boundary.geom_type == "Polygon"


def test_load_boundary_rejects_file_with_no_polygon_features(tmp_path):
    filepath = tmp_path / "boundary.geojson"
    gpd.GeoDataFrame({"geometry": [Point(172.6, -43.6)]}, crs="EPSG:4326").to_file(
        filepath
    )

    with pytest.raises(ValueError, match="no Polygon/MultiPolygon features"):
        load_boundary(filepath)


def test_load_boundary_rejects_file_with_no_crs(tmp_path):
    # Shapefiles carry their CRS in a sidecar .prj file; removing it produces
    # a genuine CRS-less GeoDataFrame when read back.
    filepath = tmp_path / "boundary.shp"
    gpd.GeoDataFrame({"geometry": [_POLYGON]}, crs="EPSG:4326").to_file(filepath)
    filepath.with_suffix(".prj").unlink()

    with pytest.raises(ValueError, match="no declared CRS"):
        load_boundary(filepath)
