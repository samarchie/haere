"""Orchestration: build a study area, then route over it scenario by scenario."""

import itertools

import geopandas as gpd
import pandas as pd

from backend import gtfs, log
from backend.config.models import AnalysisConfig, CityConfig

logger = log.get_logger(__name__)


def run(city: CityConfig, analysis: AnalysisConfig) -> None:
    """Compute travel times for every calendar type and time window."""

    # Imported here rather than at module scope so that `--help`,
    # `validate-gtfs` and the CLI tests never start a JVM.
    from backend import routing

    study_area = build_study_area(city, analysis)

    baseline_network = routing.transport_network(
        city.osm_source, analysis.baseline_gtfs_filepath, city.elevation_filepath
    )
    modified_network = routing.transport_network(
        city.osm_source, analysis.modified_gtfs_filepath, city.elevation_filepath
    )

    scenarios = itertools.product(analysis.calendar_types, analysis.time_windows)
    for calendar_type, time_window in scenarios:
        departure = calendar_type.departure_at(time_window)
        logger.info(f"Routing {calendar_type.name}/{time_window.name}")
        for network in (baseline_network, modified_network):
            routing.travel_time_matrix(
                network,
                study_area,
                study_area,
                departure,
                time_window.duration,
            )


def build_study_area(city: CityConfig, analysis: AnalysisConfig) -> gpd.GeoDataFrame:
    """Build the hex grid covering everywhere within reach of a transit stop.

    Args:
        city: The city being analysed, supplying the OSM extract and the
            hexagon resolution.
        analysis: The scenario, supplying both GTFS feeds and the study area
            boundary.

    Returns:
        The hexagon grid for the study area, in EPSG:4326.
    """

    from backend import hexgrid, routing

    stops = gtfs.unique_stops(
        analysis.baseline_gtfs_filepath, analysis.modified_gtfs_filepath
    )

    network = routing.transport_network(
        city.osm_source, analysis.baseline_gtfs_filepath, city.elevation_filepath
    )

    # One representative calendar type and time window is enough to bound the
    # study area.
    boundary = analysis.travel_time_boundary
    calendar_type = analysis.calendar_types[0]
    time_window = analysis.time_windows[0]

    reachable = routing.isochrone(
        network,
        stops,
        travel_times=[pd.Timedelta(boundary.value, boundary.unit)],
        transport_modes=routing.modes(boundary.modes),
        departure=calendar_type.departure_at(time_window),
        departure_time_window=time_window.duration,
    )

    return hexgrid.generate(reachable, city.hexagon_resolution)
