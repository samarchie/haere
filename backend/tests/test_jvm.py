"""End-to-end tests against a real R5 routing engine.

Skipped by default. Run with:
    RUN_JVM_TESTS=1 uv run pytest backend/tests/test_jvm.py --no-cov

These use r5py's bundled sample data rather than a real city extract, so they
stay in the tens of seconds rather than hours.
"""

import datetime

import numpy as np
import pytest

from backend import pipeline, results
from backend.config.models import (
    AnalysisConfig,
    CalendarType,
    CityConfig,
    RoutingParameters,
    ScenarioMetadata,
    TimeWindow,
    TravelTimeBoundary,
)

pytestmark = pytest.mark.jvm


@pytest.fixture
def sample_network():
    """r5py ships a small Helsinki extract and GTFS feed for exactly this."""
    import r5py.sampledata.helsinki

    return r5py.sampledata.helsinki.osm_pbf, r5py.sampledata.helsinki.gtfs


@pytest.fixture
def sample_scenario(sample_network, tmp_path, monkeypatch):
    osm, gtfs_feed = sample_network
    monkeypatch.setattr(pipeline, "OUTPUT_ROOT", tmp_path / "output")

    city = CityConfig(
        id="helsinki",
        name="Helsinki",
        timezone="Europe/Helsinki",
        osm_source=osm,
        # Resolution 8 keeps the hexagon count small enough to route quickly.
        hexagon_resolution=8,
    )
    analysis = AnalysisConfig(
        id="sample",
        metadata=ScenarioMetadata(title="Sample", description="..."),
        travel_time_boundary=TravelTimeBoundary(
            modes=["walking"], value=5, unit="minutes"
        ),
        baseline_gtfs_filepath=gtfs_feed,
        modified_gtfs_filepath=gtfs_feed,
        calendar_types=[CalendarType(name="weekday", departure_date="2022-02-22")],
        time_windows=[TimeWindow(name="am_peak", start="08:00", end="09:00")],
        routing_parameters=RoutingParameters(max_time=120),
    )
    return city, analysis


def test_a_real_run_produces_a_readable_matrix(sample_scenario, isolated_r5py_cache):
    """The whole path: isochrone, hex grid, routing, encoding, byte layout."""
    city, analysis = sample_scenario

    output = pipeline.run(city, analysis)

    manifest = results.read_manifest(output / "manifest.json")
    hex_count = manifest["hex_count"]
    dtype = np.dtype(manifest["encoding"]["dtype"])
    matrix = output / manifest["scenarios"][0]["variants"]["baseline"]["50"]

    assert hex_count > 0
    assert matrix.stat().st_size == results.matrix_size(hex_count, dtype)

    row = results.read_row(matrix, 0, hex_count, dtype)
    assert len(row) == hex_count
    # A hexagon always reaches itself in no time.
    assert row[0] == 0


def test_baseline_and_modified_agree_when_the_feeds_are_identical(
    sample_scenario, isolated_r5py_cache
):
    """Both variants use the same feed here, so the difference must be zero.

    This is the property the frontend computes, checked against real routing.
    """
    city, analysis = sample_scenario

    output = pipeline.run(city, analysis)

    manifest = results.read_manifest(output / "manifest.json")
    hex_count = manifest["hex_count"]
    dtype = np.dtype(manifest["encoding"]["dtype"])
    variants = manifest["scenarios"][0]["variants"]

    baseline = results.read_row(
        output / variants["baseline"]["50"], 0, hex_count, dtype
    )
    modified = results.read_row(
        output / variants["modified"]["50"], 0, hex_count, dtype
    )

    assert np.array_equal(baseline, modified)


def test_hexagon_ids_resolve_from_coordinates(sample_scenario, isolated_r5py_cache):
    """What the browser does: turn a location into a row offset."""
    import geopandas as gpd
    import h3

    city, analysis = sample_scenario

    output = pipeline.run(city, analysis)

    grid = gpd.read_parquet(output / "study_area.parquet")
    centroid = grid.geometry.iloc[3].centroid
    cell = h3.latlng_to_cell(centroid.y, centroid.x, city.hexagon_resolution)

    assert h3.str_to_int(cell) == grid["id"].iloc[3]


def test_reported_travel_times_stay_within_the_encodable_range(
    sample_scenario, isolated_r5py_cache
):
    """Establish how far R5 may overshoot max_time.

    `baseline.parquet` reached 168 minutes against a documented 120-minute
    bound. The element type is chosen from max_time, so an overshoot that large
    means a max_time just under 254 could still produce values a uint8 cannot
    hold. Measure it here rather than assuming.
    """
    from backend import routing

    city, analysis = sample_scenario
    parameters = analysis.routing_parameters
    study_area = pipeline.build_study_area(city, analysis).sort_values("id")

    network = routing.transport_network(
        city.osm_source, analysis.baseline_gtfs_filepath, None
    )
    travel_times = routing.travel_time_matrix(
        network,
        study_area,
        study_area,
        datetime.datetime(2022, 2, 22, 8, 0),
        datetime.timedelta(hours=1),
        parameters,
    )

    largest = travel_times["travel_time"].max()

    assert largest <= results.SINGLE_BYTE_LIMIT_MINUTES, (
        f"R5 reported {largest} minutes against a max_time of "
        f"{parameters.max_time}. If this exceeds 254, element_dtype's threshold "
        "must carry a margin for the overshoot."
    )
