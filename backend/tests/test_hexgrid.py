import geopandas as gpd
import pytest
from shapely.geometry import Polygon, box

from backend import hexgrid

_RESOLUTION = 9


@pytest.fixture
def square():
    """A roughly 1 km square over Christchurch, in EPSG:4326."""
    return gpd.GeoDataFrame(geometry=[box(172.63, -43.54, 172.64, -43.53)], crs=4326)


def test_generate_returns_cells_covering_the_boundary(square):
    grid = hexgrid.generate(square, _RESOLUTION)

    assert len(grid) > 0
    assert grid.crs == 4326


def test_every_returned_cell_touches_the_unbuffered_boundary(square):
    grid = hexgrid.generate(square, _RESOLUTION)

    assert grid.intersects(square.union_all()).all()


def test_generate_returns_disjoint_cells_not_one_union(square):
    grid = hexgrid.generate(square, _RESOLUTION)

    assert (grid.geometry.geom_type == "Polygon").all()
    assert len(grid) > 1


def test_finer_resolution_produces_more_cells(square):
    coarse = hexgrid.generate(square, 8)
    fine = hexgrid.generate(square, 9)

    assert len(fine) > len(coarse)


def test_generate_does_not_mutate_the_caller_boundary(square):
    before = square.geometry.iloc[0].wkt

    hexgrid.generate(square, _RESOLUTION)

    assert square.geometry.iloc[0].wkt == before
    assert square.crs == 4326


def test_generate_raises_when_no_valid_polygons_exist():
    empty = gpd.GeoDataFrame(geometry=[Polygon()], crs=4326)

    with pytest.raises(RuntimeError, match="No valid hexagons"):
        hexgrid.generate(empty, _RESOLUTION)
