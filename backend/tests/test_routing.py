from shapely.geometry import MultiLineString

from backend import routing


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
