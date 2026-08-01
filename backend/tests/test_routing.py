import datetime

import geopandas as gpd
import pytest
from shapely.geometry import MultiLineString, Point

from backend import routing
from backend.config.models import RoutingParameters


class _FakeMatrix:
    """Captures what routing hands to r5py, without starting a JVM."""

    last_call = None

    def __init__(self, network, origins, destinations, **kwargs):
        type(self).last_call = {
            "network": network,
            "origins": origins,
            "destinations": destinations,
            **kwargs,
        }


@pytest.fixture
def captured_matrix(monkeypatch):
    monkeypatch.setattr("r5py.TravelTimeMatrix", _FakeMatrix)
    _FakeMatrix.last_call = None
    return _FakeMatrix


def _points(ids):
    return gpd.GeoDataFrame(
        {"id": ids},
        geometry=[Point(172.6 + n / 1000, -43.5) for n in range(len(ids))],
        crs=4326,
    )


def test_travel_time_matrix_passes_routing_parameters_through(captured_matrix):
    points = _points([1, 2])
    parameters = RoutingParameters(max_walk_time=20, max_time=300, percentiles=[50, 90])

    routing.travel_time_matrix(
        None,
        points,
        points,
        datetime.datetime(2026, 8, 3, 7, 0),
        datetime.timedelta(hours=2),
        parameters,
    )

    call = captured_matrix.last_call
    assert call["max_time_walking"] == datetime.timedelta(minutes=20)
    assert call["max_time"] == datetime.timedelta(minutes=300)
    assert call["percentiles"] == [50, 90]


def test_travel_time_matrix_snaps_to_the_network_by_keyword(captured_matrix):
    """Passing it positionally works today but breaks on a signature change."""
    points = _points([1, 2])

    routing.travel_time_matrix(
        None,
        points,
        points,
        datetime.datetime(2026, 8, 3, 7, 0),
        datetime.timedelta(hours=2),
        RoutingParameters(),
    )

    assert captured_matrix.last_call["snap_to_network"] is True


def test_travel_time_matrix_rejects_origins_without_an_id(captured_matrix):
    """Silently inventing positional ids would misaddress every result."""
    without_id = _points([1, 2]).drop(columns=["id"])

    with pytest.raises(ValueError, match="must have an 'id' column"):
        routing.travel_time_matrix(
            None,
            without_id,
            _points([1, 2]),
            datetime.datetime(2026, 8, 3, 7, 0),
            datetime.timedelta(hours=2),
            RoutingParameters(),
        )


def test_travel_time_matrix_routes_from_points_inside_each_polygon(captured_matrix):
    """Hexagon centroids can fall outside a concave cell; representative_point
    is guaranteed to land within it."""
    from shapely.geometry import Polygon

    polygons = gpd.GeoDataFrame(
        {"id": [1]},
        geometry=[Polygon([(0, 0), (2, 0), (2, 2), (0, 2)])],
        crs=4326,
    )

    routing.travel_time_matrix(
        None,
        polygons,
        polygons,
        datetime.datetime(2026, 8, 3, 7, 0),
        datetime.timedelta(hours=2),
        RoutingParameters(),
    )

    routed = captured_matrix.last_call["origins"]
    assert routed.geometry.iloc[0].geom_type == "Point"
    assert polygons.geometry.iloc[0].contains(routed.geometry.iloc[0])


def test_default_transport_modes_are_not_built_at_import_time():
    """A default argument evaluated at import pulls r5py in eagerly, which
    defeats the deferred imports that keep `--help` fast."""
    import inspect

    default = (
        inspect.signature(routing.travel_time_matrix)
        .parameters["transport_modes"]
        .default
    )

    assert default is None


def test_close_rings_joins_a_ring_split_across_several_linestrings():
    """r5py returns isochrone edges as separate LineStrings.

    Polygonising each one on its own finds no closed ring and silently loses
    the area, so they must be polygonised together.
    """
    split_ring = MultiLineString([[(0, 0), (0, 1), (1, 1)], [(1, 1), (1, 0), (0, 0)]])

    closed = routing._close_rings(split_ring)

    assert len(closed.geoms) == 1
    assert closed.area == 1.0


def test_close_rings_keeps_disjoint_rings_separate():
    two_rings = MultiLineString(
        [
            [(0, 0), (0, 1), (1, 1), (1, 0), (0, 0)],
            [(3, 3), (3, 4), (4, 4), (4, 3), (3, 3)],
        ]
    )

    closed = routing._close_rings(two_rings)

    assert len(closed.geoms) == 2
    assert closed.area == 2.0


def test_close_rings_yields_nothing_for_an_unclosed_line():
    open_line = MultiLineString([[(0, 0), (0, 1), (1, 1)]])

    assert routing._close_rings(open_line).is_empty


def test_modes_maps_config_strings_onto_r5py_enums():
    import r5py

    assert routing.modes(["walking", "transit"]) == [
        r5py.TransportMode.WALK,
        r5py.TransportMode.TRANSIT,
    ]
