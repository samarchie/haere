"""Routing against an r5py transport network.

The only module in the backend that imports r5py. Everything here takes plain
paths, datetimes and timedeltas so that configuration models and the routing
engine never have to know about each other.
"""

from collections.abc import Iterable
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

import geopandas as gpd
import pandas as pd
import r5py
from shapely.geometry import MultiPolygon
from shapely.ops import polygonize

from backend import log

logger = log.get_logger(__name__)

TRANSPORT_MODES = {
    "transit": r5py.TransportMode.TRANSIT,
    "walking": r5py.TransportMode.WALK,
    "cycling": r5py.TransportMode.BICYCLE,
    "driving": r5py.TransportMode.CAR,
}


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


def _close_rings(geometry) -> MultiPolygon:
    """Close a collection of isochrone edge LineStrings into areas.

    The whole collection is polygonised in one call. Polygonising each
    LineString separately would find no closed ring whenever a single ring is
    split across several LineStrings, and would silently return no area.
    """
    return MultiPolygon(polygonize(geometry))


def isochrone(
    network: r5py.TransportNetwork,
    destinations: gpd.GeoDataFrame,
    max_travel_time: timedelta,
    transport_modes: list[r5py.TransportMode],
    departure: datetime,
    departure_time_window: timedelta,
) -> gpd.GeoDataFrame:
    """Return the area within `max_travel_time` of any destination.

    Args:
        network: The network to route over.
        destinations: Points to route to. Not modified; an `id` column is
            added to a copy if one is absent.
        max_travel_time: How far out to search.
        transport_modes: Modes to route with, from `modes()`.
        departure: When to depart.
        departure_time_window: How wide a spread of departure times to sample.

    Returns:
        The reachable area as polygons.
    """

    destinations = destinations.copy()
    if "id" not in destinations.columns:
        destinations["id"] = range(len(destinations))

    logger.info("Starting isochrone generation")
    isochrones: gpd.GeoDataFrame = r5py.Isochrones(
        network,
        destinations,
        isochrones=pd.TimedeltaIndex([max_travel_time]),
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
    transport_modes: list[r5py.TransportMode],
    departure: datetime,
    departure_time_window: timedelta,
) -> pd.DataFrame:
    """Return travel times between every origin and every destination."""

    return r5py.TravelTimeMatrix(
        transport_network=network,
        origins=origins,
        destinations=destinations,
        departure=departure,
        departure_time_window=departure_time_window,
        transport_modes=transport_modes,
    )  # type: ignore
