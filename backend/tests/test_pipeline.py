"""Orchestration, with routing stubbed out. No JVM."""

import json

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
import pytest
from shapely.geometry import Point

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

# Two real, ascending resolution-9 cell ids. See the note in test_results.py.
HEX_IDS = np.array(
    sorted(
        h3.str_to_int(cell)
        for cell in h3.grid_disk(h3.latlng_to_cell(-43.53, 172.63, 9), 1)
    )[:2],
    dtype=np.uint64,
)


@pytest.fixture
def city(tmp_path):
    osm = tmp_path / "city.osm.pbf"
    osm.write_bytes(b"placeholder")
    return CityConfig(
        id="canterbury",
        name="Canterbury",
        timezone="Pacific/Auckland",
        osm_source=osm,
        hexagon_resolution=9,
    )


@pytest.fixture
def analysis(tmp_path):
    feed = tmp_path / "gtfs.zip"
    feed.write_bytes(b"placeholder")
    return AnalysisConfig(
        id="remove-route-135",
        metadata=ScenarioMetadata(title="Remove Route 135", description="..."),
        travel_time_boundary=TravelTimeBoundary(
            modes=["walking"], value=20, unit="minutes"
        ),
        baseline_gtfs_filepath=feed,
        modified_gtfs_filepath=feed,
        calendar_types=[
            CalendarType(name="weekday", departure_date="2026-08-03"),
            CalendarType(name="saturday", departure_date="2026-08-08"),
        ],
        time_windows=[TimeWindow(name="am_peak", start="07:00", end="09:00")],
        routing_parameters=RoutingParameters(),
    )


@pytest.fixture
def stub_routing(monkeypatch, tmp_path):
    """Replace the JVM-backed calls with a deterministic fake grid and matrix."""
    grid = gpd.GeoDataFrame(
        {"id": HEX_IDS},
        geometry=[Point(172.6, -43.5), Point(172.61, -43.5)],
        crs=4326,
    )
    calls = {"matrices": 0}

    def _fake_study_area(city, analysis):
        return grid

    def _fake_matrix(*args, **kwargs):
        calls["matrices"] += 1
        return pd.DataFrame(
            {
                "from_id": np.repeat(HEX_IDS, 2),
                "to_id": np.tile(HEX_IDS, 2),
                "travel_time": [0.0, 12.0, 12.0, 0.0],
            }
        )

    monkeypatch.setattr(pipeline, "build_study_area", _fake_study_area)
    monkeypatch.setattr(pipeline, "_travel_times", _fake_matrix)
    monkeypatch.setattr(pipeline, "OUTPUT_ROOT", tmp_path / "output")
    return calls


def test_run_writes_a_matrix_per_variant_per_scenario(city, analysis, stub_routing):
    output = pipeline.run(city, analysis)

    # 2 calendar types x 1 time window x 2 variants
    assert stub_routing["matrices"] == 4
    assert (output / "weekday" / "am_peak" / "baseline.p50.bin").exists()
    assert (output / "weekday" / "am_peak" / "modified.p50.bin").exists()
    assert (output / "saturday" / "am_peak" / "baseline.p50.bin").exists()


def test_run_writes_the_manifest_hexes_and_study_area(city, analysis, stub_routing):
    output = pipeline.run(city, analysis)

    assert (output / "manifest.json").exists()
    assert (output / "hexes.json").exists()
    assert (output / "study_area.parquet").exists()


def test_the_written_matrix_is_readable_at_the_documented_offset(
    city, analysis, stub_routing
):
    """End to end: what the pipeline writes is what read_row promises."""
    output = pipeline.run(city, analysis)
    manifest = results.read_manifest(output / "manifest.json")

    row = results.read_row(
        output / manifest["scenarios"][0]["variants"]["baseline"]["50"],
        0,
        manifest["hex_count"],
        np.dtype(manifest["encoding"]["dtype"]),
    )

    assert list(row) == [0, 12]


def test_hexes_json_matches_the_study_area_order(city, analysis, stub_routing):
    import h3

    output = pipeline.run(city, analysis)

    written = json.loads((output / "hexes.json").read_text())
    grid = gpd.read_parquet(output / "study_area.parquet")
    assert [h3.str_to_int(cell) for cell in written] == list(grid["id"])


def test_the_manifest_lists_only_scenarios_that_were_written(
    city, analysis, stub_routing
):
    output = pipeline.run(city, analysis, only=("weekday/am_peak",))

    manifest = results.read_manifest(output / "manifest.json")
    assert len(manifest["scenarios"]) == 1
    assert manifest["scenarios"][0]["calendar_type"] == "weekday"


def test_only_filters_the_scenarios_that_are_computed(city, analysis, stub_routing):
    pipeline.run(city, analysis, only=("weekday/am_peak",))

    assert stub_routing["matrices"] == 2


def test_an_only_filter_that_matches_nothing_is_an_error(city, analysis, stub_routing):
    with pytest.raises(ValueError, match="no scenarios"):
        pipeline.run(city, analysis, only=("tuesday/lunchtime",))


def test_a_second_run_skips_matrices_already_on_disk(city, analysis, stub_routing):
    pipeline.run(city, analysis)
    stub_routing["matrices"] = 0

    pipeline.run(city, analysis)

    assert stub_routing["matrices"] == 0


def test_a_truncated_matrix_is_recomputed(city, analysis, stub_routing):
    """A short file would otherwise be trusted and served as valid."""
    output = pipeline.run(city, analysis)
    truncated = output / "weekday" / "am_peak" / "baseline.p50.bin"
    truncated.write_bytes(b"\x00")
    stub_routing["matrices"] = 0

    pipeline.run(city, analysis)

    assert stub_routing["matrices"] > 0
    assert truncated.stat().st_size == results.matrix_size(2, np.dtype(np.uint8))


def test_a_resumed_run_reuses_the_study_area_without_rebuilding_it(
    city, analysis, stub_routing, monkeypatch
):
    """Rebuilding needs a JVM and could return a different grid, silently
    misaddressing every matrix already written."""
    pipeline.run(city, analysis)

    def _explode(city, analysis):
        raise AssertionError("the study area should have been reused")

    monkeypatch.setattr(pipeline, "build_study_area", _explode)

    pipeline.run(city, analysis)


def test_changed_inputs_abort_rather_than_mixing_incompatible_matrices(
    city, analysis, stub_routing
):
    pipeline.run(city, analysis)
    analysis.travel_time_boundary = TravelTimeBoundary(
        modes=["walking"], value=45, unit="minutes"
    )

    with pytest.raises(pipeline.StaleOutputError, match="travel_time_boundary"):
        pipeline.run(city, analysis)


def test_force_clears_stale_output_and_starts_over(city, analysis, stub_routing):
    output = pipeline.run(city, analysis)
    (output / "stray.txt").write_text("left over")
    analysis.travel_time_boundary = TravelTimeBoundary(
        modes=["walking"], value=45, unit="minutes"
    )

    pipeline.run(city, analysis, force=True)

    assert not (output / "stray.txt").exists()
    assert (output / "manifest.json").exists()


def test_output_paths_use_config_ids_not_object_reprs(city, analysis, stub_routing):
    output = pipeline.run(city, analysis)

    assert output == pipeline.OUTPUT_ROOT / "canterbury" / "remove-route-135"


def test_an_empty_study_area_is_an_error(city, analysis, stub_routing, monkeypatch):
    """A travel_time_boundary too restrictive for the GTFS/OSM inputs can
    legitimately filter the grid down to zero hexagons. Proceeding would write
    zero-byte matrices that every future run treats as complete."""
    empty_grid = gpd.GeoDataFrame(
        {"id": np.array([], dtype=np.uint64)}, geometry=[], crs=4326
    )
    monkeypatch.setattr(pipeline, "build_study_area", lambda city, analysis: empty_grid)

    with pytest.raises(ValueError, match="travel_time_boundary"):
        pipeline.run(city, analysis)


def test_a_rebuilt_study_area_refreshes_the_manifest_and_hexes(
    city, analysis, stub_routing, monkeypatch
):
    """If study_area.parquet goes missing (partial copy, manual deletion) but
    manifest.json survives, the grid gets rebuilt. hexes.json and the
    manifest header must describe the new grid, not the stale one from the
    manifest that was already on disk."""
    output = pipeline.run(city, analysis)
    (output / "study_area.parquet").unlink()

    other_hex_ids = np.array(
        sorted(
            h3.str_to_int(cell)
            for cell in h3.grid_disk(h3.latlng_to_cell(-43.53, 172.63, 9), 2)
        )[:5],
        dtype=np.uint64,
    )
    new_grid = gpd.GeoDataFrame(
        {"id": other_hex_ids},
        geometry=[Point(172.6 + 0.001 * i, -43.5) for i in range(5)],
        crs=4326,
    )
    monkeypatch.setattr(pipeline, "build_study_area", lambda city, analysis: new_grid)

    pipeline.run(city, analysis)

    manifest = results.read_manifest(output / "manifest.json")
    assert manifest["hex_count"] == 5
    written = json.loads((output / "hexes.json").read_text())
    assert [h3.str_to_int(cell) for cell in written] == sorted(other_hex_ids.tolist())


def test_a_rebuilt_study_area_discards_matrices_from_the_previous_grid(
    city, analysis, stub_routing, monkeypatch
):
    """A rebuild can land on a grid with the same hex count but different
    hexagon ids (e.g. GTFS/OSM content changed behind unchanged file paths).
    The old .bin files are still the right size, so nothing else would catch
    that they encode travel times for the wrong hexagons."""
    output = pipeline.run(city, analysis)
    stale_bin = output / "weekday" / "am_peak" / "baseline.p50.bin"
    stale_bytes = stale_bin.read_bytes()
    (output / "study_area.parquet").unlink()

    other_hex_ids = np.array(
        sorted(
            h3.str_to_int(cell)
            for cell in h3.grid_disk(h3.latlng_to_cell(-43.6, 172.7, 9), 1)
        )[:2],
        dtype=np.uint64,
    )
    assert len(other_hex_ids) == len(HEX_IDS)
    assert set(other_hex_ids.tolist()) != set(HEX_IDS.tolist())
    new_grid = gpd.GeoDataFrame(
        {"id": other_hex_ids},
        geometry=[Point(172.7, -43.6), Point(172.71, -43.6)],
        crs=4326,
    )
    monkeypatch.setattr(pipeline, "build_study_area", lambda city, analysis: new_grid)

    def _fake_matrix_for_new_grid(*args, **kwargs):
        stub_routing["matrices"] += 1
        return pd.DataFrame(
            {
                "from_id": np.repeat(other_hex_ids, 2),
                "to_id": np.tile(other_hex_ids, 2),
                "travel_time": [0.0, 7.0, 7.0, 0.0],
            }
        )

    monkeypatch.setattr(pipeline, "_travel_times", _fake_matrix_for_new_grid)
    stub_routing["matrices"] = 0

    pipeline.run(city, analysis)

    assert stub_routing["matrices"] > 0
    assert stale_bin.read_bytes() != stale_bytes

    manifest = results.read_manifest(output / "manifest.json")
    written = json.loads((output / "hexes.json").read_text())
    assert [h3.str_to_int(cell) for cell in written] == sorted(other_hex_ids.tolist())
    assert manifest["hex_count"] == 2


def test_a_deleted_hexes_json_is_regenerated_without_a_rebuild(
    city, analysis, stub_routing, monkeypatch
):
    """hexes.json can go missing on its own (manual deletion, partial copy)
    while manifest.json and study_area.parquet both survive intact. Nothing
    should silently leave it missing forever."""
    output = pipeline.run(city, analysis)
    (output / "hexes.json").unlink()

    def _explode(city, analysis):
        raise AssertionError("the study area should have been reused, not rebuilt")

    monkeypatch.setattr(pipeline, "build_study_area", _explode)

    pipeline.run(city, analysis)

    assert (output / "hexes.json").exists()
    written = json.loads((output / "hexes.json").read_text())
    grid = gpd.read_parquet(output / "study_area.parquet")
    assert [h3.str_to_int(cell) for cell in written] == list(grid["id"])


def test_a_wider_max_time_widens_the_element_type(city, analysis, stub_routing):
    analysis.routing_parameters = RoutingParameters(max_time=360)

    output = pipeline.run(city, analysis)

    manifest = results.read_manifest(output / "manifest.json")
    assert manifest["encoding"]["dtype"] == "uint16"
    assert (
        output / "weekday" / "am_peak" / "baseline.p50.bin"
    ).stat().st_size == results.matrix_size(2, np.dtype(np.uint16))
