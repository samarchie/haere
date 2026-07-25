"""Reading stop locations out of GTFS zip archives."""

import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd

from backend import log

logger = log.get_logger(__name__)


def read_stops(gtfs_filepath: Path) -> gpd.GeoDataFrame:
    """Return every stop in a GTFS archive as points.

    Args:
        gtfs_filepath: Path to a GTFS zip archive containing `stops.txt`.

    Returns:
        The contents of `stops.txt` as a GeoDataFrame in EPSG:4326, with the
        original columns preserved alongside the point geometry.

    Raises:
        zipfile.BadZipFile: If `gtfs_filepath` is not a zip archive.
        KeyError: If the archive contains no `stops.txt`.
    """

    with zipfile.ZipFile(gtfs_filepath) as archive:
        with archive.open("stops.txt") as file:
            stops = pd.read_csv(file)

    logger.info(f"Found {len(stops)} stops in {gtfs_filepath}.")

    return gpd.GeoDataFrame(
        stops,
        geometry=gpd.points_from_xy(stops["stop_lon"], stops["stop_lat"]),
        crs=4326,
    )


def unique_stops(*gtfs_filepaths: Path) -> gpd.GeoDataFrame:
    """Return the stops of every given archive, deduplicated by location.

    Two feeds describing the same network share most of their stops. Routing
    to the same coordinate twice is wasted work, so identical geometries are
    collapsed to one row.

    Args:
        *gtfs_filepaths: One or more GTFS zip archives.

    Returns:
        The union of every feed's stops in EPSG:4326, without duplicate
        geometries.
    """

    feeds = [read_stops(filepath) for filepath in gtfs_filepaths]
    combined: gpd.GeoDataFrame = pd.concat(feeds, ignore_index=True)  # type: ignore
    deduplicated = combined.drop_duplicates("geometry")

    logger.info(
        f"Found {len(deduplicated)} unique stops across {len(feeds)} GTFS feeds."
    )

    return deduplicated
