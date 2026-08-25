"""Orchestration: build a study area, then route over it scenario by scenario."""

import itertools
import os
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

from backend import gtfs, log, results
from backend.config.models import (
    AnalysisConfig,
    CalendarType,
    CityConfig,
    RoutingParameters,
    TimeWindow,
)

logger = log.get_logger(__name__)

OUTPUT_ROOT = Path("output")

VARIANTS = ("baseline", "modified")


def _default_workers() -> int:
    """Half the machine's CPU count, at least one.

    Two-way concurrency (one scenario's baseline and modified variants
    routed at once) measured a 1.5-1.9x wall-clock speedup in a sanity
    check; higher fan-out is untested, so this stays conservative rather
    than defaulting to every core.
    """
    return max(1, (os.cpu_count() or 1) // 2)


@dataclass
class _RoutingTask:
    """One scenario/variant's routing work: what to compute, what to write."""

    calendar_type: CalendarType
    time_window: TimeWindow
    variant: str
    paths: dict[int, Path]
    missing: list[int]


class StaleOutputError(Exception):
    """The stored output was built from a different study area."""


def run(
    city: CityConfig,
    analysis: AnalysisConfig,
    only: tuple[str, ...] = (),
    force: bool = False,
    max_workers: int | None = None,
) -> Path:
    """Compute and publish travel times for every selected scenario.

    Args:
        city: The city being analysed.
        analysis: The baseline-versus-modified scenario.
        only: Optional `<calendar_type>/<time_window>` selectors. Empty means
            every combination.
        force: Discard any existing output first.
        max_workers: How many scenario/variant routing tasks to run
            concurrently. Defaults to half the machine's CPU count.

    Returns:
        The output directory.

    Raises:
        StaleOutputError: If existing output was built from different inputs.
        ValueError: If `only` selects no scenarios.
    """

    output = OUTPUT_ROOT / city.id / analysis.id
    manifest_path = output / "manifest.json"

    if force and output.exists():
        logger.info(f"Clearing {output} before a forced rerun")
        shutil.rmtree(output)

    manifest = None
    if manifest_path.exists():
        manifest = results.read_manifest(manifest_path)
        changed = results.stale_fields(manifest, city, analysis)
        if changed:
            raise StaleOutputError(
                f"{output} was built with different inputs "
                f"({', '.join(changed)} changed). Existing matrices there may "
                "be addressed or encoded differently to what this run would "
                "produce. Rerun with --force to discard it."
            )

    study_area, rebuilt = _study_area(
        city, analysis, output, reusable=manifest is not None
    )
    hex_ids = study_area["id"].to_numpy()

    if len(hex_ids) == 0:
        raise ValueError(
            f"{city.id}/{analysis.id} has an empty study area (0 hexagons). "
            "travel_time_boundary is likely too restrictive for the actual "
            "GTFS/OSM inputs, filtering out every hexagon."
        )

    parameters = analysis.routing_parameters
    dtype = results.element_dtype(parameters.max_time)
    expected_size = results.matrix_size(len(hex_ids), dtype)

    # The manifest header and hexes.json must always describe whatever grid
    # is actually on disk. A rebuild can happen even when a manifest already
    # existed (e.g. study_area.parquet went missing), so this is driven by
    # whether the grid was rebuilt, not by whether a manifest was found.
    if rebuilt:
        if manifest is not None:
            # Discard matrices computed against the previous grid. A rebuild
            # can land on a grid with the same hex count but different
            # hexagon ids (e.g. GTFS/OSM content changed behind unchanged
            # file paths), and expected_size depends only on the count, so
            # nothing else would catch stale .bin files being re-recorded as
            # valid against the new grid.
            for calendar_type in analysis.calendar_types:
                shutil.rmtree(output / calendar_type.name, ignore_errors=True)
        manifest = results.new_manifest(city, analysis, hex_ids, dtype)
        results.write_hexes(hex_ids, output / "hexes.json")
    elif not (output / "hexes.json").exists():
        results.write_hexes(hex_ids, output / "hexes.json")

    scenarios = _selected(analysis, only)

    tasks = []
    for calendar_type, time_window in scenarios:
        for variant in VARIANTS:
            paths = {
                percentile: output
                / calendar_type.name
                / time_window.name
                / f"{variant}.p{percentile}.bin"
                for percentile in parameters.percentiles
            }
            missing = [
                percentile
                for percentile, path in paths.items()
                if not (path.exists() and path.stat().st_size == expected_size)
            ]
            tasks.append(
                _RoutingTask(calendar_type, time_window, variant, paths, missing)
            )

    pending = [task for task in tasks if task.missing]

    if pending:
        # Warm the cache on this thread first: transport_network() is
        # @lru_cache'd but not safe against two worker threads racing on the
        # same cache miss.
        _ensure_networks_built(city, analysis)

        workers = max_workers if max_workers is not None else _default_workers()
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(
                    _route_and_write,
                    city,
                    analysis,
                    study_area,
                    hex_ids,
                    dtype,
                    parameters,
                    task,
                ): task
                for task in pending
            }
            for future in as_completed(futures):
                future.result()  # re-raise, if the task failed
                _record(manifest, manifest_path, output, futures[future])

    # Tasks with nothing missing were never dispatched, but still need
    # recording (matches the pre-existing behaviour of recording every
    # scenario/variant, not just the ones that were freshly routed).
    for task in tasks:
        if not task.missing:
            _record(manifest, manifest_path, output, task)

    return output


def _column(percentile: int, parameters: RoutingParameters) -> str:
    """Which r5py column holds this percentile.

    r5py renames the single default percentile to a bare `travel_time`.
    """
    if parameters.percentiles == [50]:
        return "travel_time"
    return f"travel_time_p{percentile}"


def _selected(
    analysis: AnalysisConfig, only: tuple[str, ...]
) -> list[tuple[CalendarType, TimeWindow]]:
    """Every calendar type and time window pair, filtered by `only`."""
    scenarios = list(itertools.product(analysis.calendar_types, analysis.time_windows))
    if not only:
        return scenarios

    wanted = set(only)
    chosen = [
        (calendar_type, time_window)
        for calendar_type, time_window in scenarios
        if f"{calendar_type.name}/{time_window.name}" in wanted
    ]
    if not chosen:
        available = ", ".join(
            f"{calendar_type.name}/{time_window.name}"
            for calendar_type, time_window in scenarios
        )
        raise ValueError(f"--only matched no scenarios. Available: {available}")
    return chosen


def _study_area(
    city: CityConfig, analysis: AnalysisConfig, output: Path, reusable: bool
) -> tuple[gpd.GeoDataFrame, bool]:
    """Read back the published study area, or build and publish it.

    The study area is an output rather than a cache because every matrix is
    addressed by position within it. Reusing it also means a resumed run never
    starts a JVM merely to rediscover a study area it already has.

    Returns:
        The study_area, and whether it was freshly built (as opposed to read
        back from disk unchanged). A stale manifest header or hexes.json is only
        safe to trust when this is False.
    """
    path = output / "study_area.parquet"
    if reusable and path.exists():
        logger.info(f"Reusing the study area at {path}")
        return gpd.read_parquet(path), False

    study_area = build_study_area(city, analysis)
    study_area = study_area.sort_values("id").reset_index(drop=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    study_area.to_parquet(path)
    return study_area, True


def _ensure_networks_built(city: CityConfig, analysis: AnalysisConfig) -> None:
    """Warm the network cache for both variants before routing concurrently.

    The seam tests stub, the same way `_travel_times` is stubbed, so no test
    ever starts a real JVM.
    """
    from backend import routing

    routing.transport_network(
        city.osm_source, analysis.baseline_gtfs_filepath, city.elevation_filepath
    )
    routing.transport_network(
        city.osm_source, analysis.modified_gtfs_filepath, city.elevation_filepath
    )


def _route_and_write(
    city: CityConfig,
    analysis: AnalysisConfig,
    study_area: gpd.GeoDataFrame,
    hex_ids: np.ndarray,
    dtype: np.dtype,
    parameters: RoutingParameters,
    task: _RoutingTask,
) -> None:
    """Route one scenario/variant and write its missing matrix files.

    Runs on a worker thread. Must not touch the manifest — recording happens
    back on the main thread via `_record`, so the manifest never needs a lock.
    """
    logger.info(
        f"Routing {task.variant} for {task.calendar_type.name}/{task.time_window.name}"
    )
    feed = getattr(analysis, f"{task.variant}_gtfs_filepath")
    travel_times = _travel_times(
        city,
        feed,
        study_area,
        task.calendar_type.departure_at(task.time_window),
        task.time_window.duration,
        parameters,
    )
    for percentile in task.missing:
        results.write_matrix(
            travel_times,
            hex_ids,
            _column(percentile, parameters),
            dtype,
            task.paths[percentile],
        )
    del travel_times


def _record(
    manifest: dict, manifest_path: Path, output: Path, task: _RoutingTask
) -> None:
    """Note every path in `task` in the manifest and publish it.

    Only ever called from the main thread.
    """
    for percentile, path in task.paths.items():
        results.record_matrix(
            manifest,
            task.calendar_type,
            task.time_window,
            task.variant,
            percentile,
            str(path.relative_to(output)),
        )
    results.write_manifest(manifest, manifest_path)


def _travel_times(
    city: CityConfig,
    gtfs_filepath: Path,
    study_area: gpd.GeoDataFrame,
    departure: datetime,
    departure_time_window: timedelta,
    parameters: RoutingParameters,
) -> pd.DataFrame:
    """Route one variant over the study area. The seam tests stub."""
    from backend import routing

    network = routing.transport_network(
        city.osm_source, gtfs_filepath, city.elevation_filepath
    )
    return routing.travel_time_matrix(
        network,
        study_area,
        study_area,
        departure,
        departure_time_window,
        parameters,
    )


def build_study_area(city: CityConfig, analysis: AnalysisConfig) -> gpd.GeoDataFrame:
    """Build the hex grid covering everywhere within reach of a transit stop.

    Args:
        city: The city being analysed, supplying the OSM extract and the
            hexagon resolution.
        analysis: The scenario, supplying both GTFS feeds and the study area
            boundary.

    Returns:
        The hexagon grid for the study area, in EPSG:4326, with an `id` column
        of H3 cell ids.
    """

    # Imported here rather than at module scope so that `--help`,
    # `validate-gtfs` and the CLI tests never start a JVM.
    from backend import hexgrid, routing

    stops = gtfs.unique_stops(
        analysis.baseline_gtfs_filepath, analysis.modified_gtfs_filepath
    )
    # The isochrone only needs distinct destinations; ids label output we
    # discard, so a positional id is honest here in a way it is not for hexagons.
    stops = stops.reset_index(drop=True)
    stops["id"] = range(len(stops))

    network = routing.transport_network(
        city.osm_source, analysis.baseline_gtfs_filepath, city.elevation_filepath
    )

    # One representative calendar type and time window is enough to bound the
    # study area.
    boundary = analysis.travel_time_boundary
    calendar_type = analysis.calendar_types[0]
    time_window: TimeWindow = analysis.time_windows[0]

    reachable = routing.isochrone(
        network,
        stops,
        travel_times=[pd.Timedelta(boundary.value, boundary.unit)],
        transport_modes=routing.modes(boundary.modes),
        departure=calendar_type.departure_at(time_window),
        departure_time_window=time_window.duration,
    )

    return hexgrid.generate(reachable, city.hexagon_resolution)
