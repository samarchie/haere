import zipfile
from pathlib import Path

import pytest

from backend import gtfs


@pytest.fixture
def make_gtfs(tmp_path):
    """Return a factory building a minimal GTFS zip containing only stops.txt."""

    def _make(name: str, stops: list[tuple[str, float, float]]) -> Path:
        header = "stop_id,stop_name,stop_lat,stop_lon"
        rows = "\n".join(
            f"{stop_id},Stop {stop_id},{lat},{lon}" for stop_id, lat, lon in stops
        )
        path = tmp_path / name
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("stops.txt", f"{header}\n{rows}\n")
        return path

    return _make


def test_read_stops_returns_points_in_epsg_4326(make_gtfs):
    feed = make_gtfs(
        "feed.zip",
        [("a", -43.53, 172.63), ("b", -43.54, 172.64), ("c", -43.55, 172.65)],
    )

    stops = gtfs.read_stops(feed)

    assert len(stops) == 3
    assert stops.crs == 4326
    assert stops.geometry.iloc[0].x == pytest.approx(172.63)
    assert stops.geometry.iloc[0].y == pytest.approx(-43.53)


def test_read_stops_keeps_the_original_columns(make_gtfs):
    feed = make_gtfs("feed.zip", [("a", -43.53, 172.63)])

    stops = gtfs.read_stops(feed)

    assert stops.loc[0, "stop_id"] == "a"
    assert stops.loc[0, "stop_name"] == "Stop a"


def test_unique_stops_drops_locations_shared_between_feeds(make_gtfs):
    shared = ("a", -43.53, 172.63)
    baseline = make_gtfs("baseline.zip", [shared, ("b", -43.54, 172.64)])
    modified = make_gtfs("modified.zip", [shared, ("c", -43.55, 172.65)])

    stops = gtfs.unique_stops(baseline, modified)

    assert len(stops) == 3


def test_unique_stops_of_a_single_feed_is_that_feed(make_gtfs):
    feed = make_gtfs("feed.zip", [("a", -43.53, 172.63), ("b", -43.54, 172.64)])

    assert len(gtfs.unique_stops(feed)) == 2
