import geopandas as gpd
import h3
import numpy as np
import pytest
from geopandas import GeoDataFrame
from shapely.geometry import Polygon, box

from backend import hexgrid

_RESOLUTION = 9


def _boundary_around(latitude: float, longitude: float) -> GeoDataFrame:
    """A small square boundary, big enough to hold a few resolution-9 cells."""
    return GeoDataFrame(
        geometry=[
            Polygon(
                [
                    (longitude - 0.01, latitude - 0.01),
                    (longitude + 0.01, latitude - 0.01),
                    (longitude + 0.01, latitude + 0.01),
                    (longitude - 0.01, latitude + 0.01),
                ]
            )
        ],
        crs=4326,
    )


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


def test_generate_returns_h3_cell_ids_as_uint64():
    boundary = _boundary_around(-43.53, 172.63)

    grid = hexgrid.generate(boundary, resolution=9)

    assert grid["id"].dtype == np.uint64
    assert len(grid) > 0


def test_generated_ids_are_the_cells_covering_their_own_geometry():
    """The id must identify the hexagon it is stored against.

    A row whose id belongs to a different cell would misaddress every travel
    time written for it.
    """
    boundary = _boundary_around(-43.53, 172.63)

    grid = hexgrid.generate(boundary, resolution=9)

    for cell_id, geometry in zip(grid["id"], grid["geometry"], strict=True):
        centroid = geometry.centroid
        assert h3.latlng_to_cell(centroid.y, centroid.x, 9) == h3.int_to_str(
            int(cell_id)
        )


def test_ids_survive_the_boundary_intersection_filter():
    """generate() filters rows after building them; the id must come along."""
    boundary = _boundary_around(-43.53, 172.63)

    grid = hexgrid.generate(boundary, resolution=9)

    assert grid["id"].notna().all()
    assert grid["id"].nunique() == len(grid)


def test_h3_ids_sort_identically_as_uint64_and_as_strings():
    """Deliberately guards the h3 library, not our code, so it never goes red
    first. Kept anyway by explicit decision.

    The browser binary-searches string ids to find a row offset.

    Python sorts them numerically as uint64 when laying out rows. If the two
    orders ever disagreed, every lookup would silently return the wrong hexagon.
    H3 ids are fixed-width 15-character lowercase hex, so they agree.
    """
    for resolution in (7, 8, 9, 10):
        cells = list(h3.grid_disk(h3.latlng_to_cell(-43.53, 172.63, resolution), 30))

        by_number = [h3.int_to_str(i) for i in sorted(h3.str_to_int(c) for c in cells)]

        assert sorted(cells) == by_number
        assert {len(cell) for cell in cells} == {15}
