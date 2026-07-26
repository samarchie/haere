"""Routing against an r5py transport network."""

from collections.abc import Iterable
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

import geopandas as gpd
import pandas as pd
import r5py
from shapely.geometry import MultiLineString, MultiPolygon
from shapely.ops import polygonize

from backend import log
from backend.config.models import RoutingParameters

logger = log.get_logger(__name__)

TRANSPORT_MODES = {
    "transit": r5py.TransportMode.TRANSIT,
    "walking": r5py.TransportMode.WALK,
    "cycling": r5py.TransportMode.BICYCLE,
    "driving": r5py.TransportMode.CAR,
}

SNAP_TO_NETWORK = True


def modes(names: Iterable[str]) -> list[r5py.TransportMode]:
    """Map configuration mode names onto r5py's enum.

    Raises:
        KeyError: If a name is not one of `TRANSPORT_MODES`.
    """
    return [TRANSPORT_MODES[name] for name in names]


@lru_cache(maxsize=4)
def transport_network(
    osm_filepath: Path,
    gtfs_filepath: Path,
    elevation_filepath: Path | None = None,
) -> r5py.TransportNetwork:
    """Build a routable network, reusing it across calls.

    Building a network is expensive and an analysis routes over the same
    baseline and modified networks many times — once per calendar type and
    time window — so results are cached on the argument triple.
    """
    network = r5py.TransportNetwork(osm_filepath, gtfs_filepath, elevation_filepath)
    logger.info(f"Constructed transport network from {gtfs_filepath}")
    return network


def _close_rings(geometry: MultiLineString) -> MultiPolygon:
    """Close a collection of isochrone edge LineStrings into areas.

    The whole collection is polygonised in one call. Polygonising each
    LineString separately would find no closed ring whenever a single ring is
    split across several LineStrings, and would silently return no area.
    """
    return MultiPolygon(polygonize(geometry))


def _require_ids(frame: gpd.GeoDataFrame, name: str) -> None:
    """Fail loudly when a caller forgets ids.

    Defaulting to positional ids would silently misaddress every result, since
    row offsets in the output matrices are positions within the hexagon id
    list, not within whatever frame happened to be passed.
    """
    if "id" not in frame.columns:
        raise ValueError(f"{name} must have an 'id' column")


def isochrone(
    network: r5py.TransportNetwork,
    destinations: gpd.GeoDataFrame,
    travel_times: list[timedelta],
    transport_modes: list[r5py.TransportMode],
    departure: datetime,
    departure_time_window: timedelta,
) -> gpd.GeoDataFrame:
    """Return the area within `max_travel_time` of any destination.

    Args:
        network: The network to route over.
        destinations: Points to route to. Must carry an `id` column.
        travel_times: How far out to search. Each travel time is a row in the
            returned GeoDataFrame.
        transport_modes: Modes to route with, from `modes()`.
        departure: When to depart.
        departure_time_window: How wide a spread of departure times to sample.

    Returns:
        The reachable area as polygons.
    """

    _require_ids(destinations, "destinations")

    logger.info("Starting isochrone generation")
    isochrones: gpd.GeoDataFrame = r5py.Isochrones(
        network,
        destinations,
        isochrones=pd.TimedeltaIndex(travel_times),
        transport_modes=transport_modes,
        departure=departure,
        departure_time_window=departure_time_window,
    )  # type: ignore

    isochrones["geometry"] = isochrones["geometry"].apply(_close_rings)

    logger.info("Finished isochrone generation")
    return isochrones


def travel_time_matrix(
    network: r5py.TransportNetwork,
    origins: gpd.GeoDataFrame,
    destinations: gpd.GeoDataFrame,
    departure: datetime,
    departure_time_window: timedelta,
    parameters: RoutingParameters,
    transport_modes: list[r5py.TransportMode] | None = None,
) -> pd.DataFrame:
    """Return travel times between every origin and every destination.

    Args:
        network: The network to route over.
        origins: Places to route from. Must carry an `id` column.
        destinations: Places to route to. Must carry an `id` column.
        departure: When to depart.
        departure_time_window: How wide a spread of departure times to sample.
        parameters: Walk time, journey time and percentile settings.
        transport_modes: Modes to route with. Defaults to transit and walking.

    Returns:
        One row per origin-destination pair, with `from_id`, `to_id` and either
        `travel_time` (a single median percentile) or one
        `travel_time_p{n}` column per requested percentile.
    """

    _require_ids(origins, "origins")
    _require_ids(destinations, "destinations")

    if transport_modes is None:
        transport_modes = modes(["transit", "walking"])

    # Route from a point guaranteed to lie inside each polygon. A centroid can
    # fall outside a concave shape.
    origins = origins.copy()
    origins["geometry"] = origins["geometry"].representative_point()

    destinations = destinations.copy()
    destinations["geometry"] = destinations["geometry"].representative_point()

    return r5py.TravelTimeMatrix(
        network,
        origins,
        destinations,
        snap_to_network=SNAP_TO_NETWORK,
        departure=departure,
        departure_time_window=departure_time_window,
        transport_modes=transport_modes,
        max_time=timedelta(minutes=parameters.max_time),
        max_time_walking=timedelta(minutes=parameters.max_walk_time),
        percentiles=parameters.percentiles,
    )  # type: ignore
