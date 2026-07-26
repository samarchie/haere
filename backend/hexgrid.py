"""Building H3 hexagon grids that cover a boundary geometry."""

import math

import h3
from geopandas import GeoDataFrame
from shapely.geometry import Polygon

from backend import log

logger = log.get_logger(__name__)

# H3 returns only those cells whose centre falls inside the shape, so cells
# straddling the edge of the boundary are dropped. Growing the boundary
# outwards by a hexagon's inradius first pulls those centres inside. The extra
# 20% is slack, because the edge length H3 reports is an average across the
# resolution rather than an exact figure for any one cell.
_EDGE_LENGTH_SAFETY_FACTOR = 1.2


def _to_latlng_poly(geometry: Polygon) -> h3.LatLngPoly | None:
    """Convert a shapely Polygon into H3's (lat, lon)-ordered equivalent.

    Returns:
        The converted polygon, or None if `geometry` is empty, invalid, or has
        too few points for H3 to accept.
    """

    if geometry.is_empty or not geometry.is_valid:
        return None

    # Shapely stores coordinates as (lon, lat) and repeats the first point at
    # the end; H3 wants (lat, lon) and no repeat.
    exterior = [(lat, lon) for lon, lat in geometry.exterior.coords[:-1]]

    if len(exterior) < 3:
        logger.warning(f"Skipping polygon with only {len(exterior)} points")
        return None

    return h3.LatLngPoly(exterior)


def _buffered_outwards(boundary: GeoDataFrame, resolution: int) -> GeoDataFrame:
    """Grow a boundary by one hexagon's inradius, returned in EPSG:4326."""

    buffered = boundary.to_crs(3857)

    edge_length = _EDGE_LENGTH_SAFETY_FACTOR * h3.average_hexagon_edge_length(
        res=resolution, unit="m"
    )
    # The inradius r of a regular hexagon with edge length a is r = a * √3 / 2.
    inradius = edge_length * math.sqrt(3) / 2

    buffered["geometry"] = buffered.buffer(inradius)

    return buffered.to_crs(4326)


def generate(boundary: GeoDataFrame, resolution: int) -> GeoDataFrame:
    """Cover a boundary with disjoint H3 cells at the given resolution.

    Args:
        boundary: Geometry to cover, in any CRS that can be projected to
            EPSG:3857. Not modified.
        resolution: H3 resolution level, 0-15. Higher is finer.

    Returns:
        A GeoDataFrame of individual hexagon polygons in EPSG:4326, restricted
            to those that touch `boundary`.

    Raises:
        RuntimeError: If `boundary` yields no polygon H3 can work with.
    """

    buffered = _buffered_outwards(boundary.copy(deep=True), resolution)
    parts = buffered.explode(index_parts=False)

    # `is not None` is required: h3.LatLngPoly has no __len__, so a truthiness
    # test raises NotImplementedError.
    candidates = [_to_latlng_poly(geometry) for geometry in parts["geometry"]]
    polygons = [polygon for polygon in candidates if polygon is not None]

    if not polygons:
        raise RuntimeError(
            "No valid hexagons could be generated. This may be due to invalid "
            "geometries, empty input, or geometries too small for resolution "
            f"{resolution}."
        )

    shape = h3.LatLngMultiPoly(*polygons) if len(polygons) > 1 else polygons[0]
    cell_ids = h3.h3shape_to_cells(shape, resolution)

    # One call per cell id: passing them all at once returns a single unioned
    # polygon, and we need the cells to stay disjoint.
    grid = GeoDataFrame(
        geometry=[h3.cells_to_h3shape([cell_id]) for cell_id in cell_ids],
        crs=4326,
    )

    logger.info(f"Generated {len(grid)} hexagons at resolution {resolution}.")

    # Filter against the original boundary, not the buffered one. Testing
    # against the buffered shape is true by construction and removes nothing.
    return grid[grid.intersects(boundary.to_crs(4326).union_all(), align=False)]
