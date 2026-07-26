"""Encoding and file layout for published travel time results.

Results are static files a browser reads with HTTP range requests, so a matrix
is a headerless dense array addressed purely by position. Everything needed to
decode it lives in the manifest.

This module must never import r5py: keeping it JVM-free is what makes the whole
storage layer testable in milliseconds.
"""

from pathlib import Path

import numpy as np
import pandas as pd

from backend import log

logger = log.get_logger(__name__)

# The largest whole-minute travel time a uint8 can carry alongside a sentinel.
SINGLE_BYTE_LIMIT_MINUTES = 254

BYTE_ORDER = "<"


def element_dtype(max_time_minutes: int) -> np.dtype:
    """Pick the narrowest element type that can represent every valid value.

    `max_time` bounds what the routing engine may report, so it decides the
    width. A fixed uint8 would turn `max_time` into a setting that silently
    corrupts its own results once raised above 254.
    """
    if max_time_minutes <= SINGLE_BYTE_LIMIT_MINUTES:
        return np.dtype(np.uint8)
    return np.dtype(np.uint16)


def unreachable(dtype: np.dtype) -> int:
    """The sentinel meaning 'no route found', reserved from the value range."""
    return int(np.iinfo(dtype).max)


def matrix_size(hex_count: int, dtype: np.dtype) -> int:
    """The exact byte length of a complete matrix file."""
    return hex_count * hex_count * dtype.itemsize


def write_matrix(
    travel_times: pd.DataFrame,
    hex_ids: np.ndarray,
    column: str,
    dtype: np.dtype,
    path: Path,
) -> int:
    """Write one dense travel time matrix.

    Args:
        travel_times: One row per origin-destination pair, with `from_id`,
            `to_id` and `column`. Row order does not matter.
        hex_ids: Every hexagon in the study area, ascending. Position in this
            array is the row and column offset in the file.
        column: Which travel time column to encode, e.g. `travel_time` or
            `travel_time_p90`.
        dtype: From `element_dtype`.
        path: Destination. Parent directories are created.

    Returns:
        How many values were clamped to the unreachable sentinel.

    Raises:
        ValueError: If any pair references a hexagon outside `hex_ids`.
    """

    hex_count = len(hex_ids)
    sentinel = unreachable(dtype)

    lookup = pd.Index(hex_ids)
    rows = lookup.get_indexer(travel_times["from_id"])
    columns = lookup.get_indexer(travel_times["to_id"])
    if (rows < 0).any() or (columns < 0).any():
        raise ValueError(
            "travel times reference a hexagon outside the study area; "
            "the results and the study area do not belong together"
        )

    values = travel_times[column].to_numpy(dtype=float)

    # NaN compares False against everything, so unreachable pairs are not
    # counted as clamped. Only real values that overflow are.
    too_large = values >= sentinel
    clamped = int(np.count_nonzero(too_large))
    if clamped:
        logger.warning(
            f"Clamped {clamped} travel times at or above {sentinel} minutes to "
            f"unreachable while writing {path.name}. Raise max_time to widen "
            "the element type."
        )

    encoded = np.where(np.isnan(values) | too_large, sentinel, values).astype(dtype)

    matrix = np.full((hex_count, hex_count), sentinel, dtype=dtype)
    matrix[rows, columns] = encoded

    path.parent.mkdir(parents=True, exist_ok=True)
    # Write beside the target and rename, so an interrupted run never leaves a
    # file that looks complete to the resume check.
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(matrix.astype(dtype.newbyteorder(BYTE_ORDER)).tobytes())
    temporary.replace(path)

    return clamped


def read_row(path: Path, row: int, hex_count: int, dtype: np.dtype) -> np.ndarray:
    """Read one origin's travel times to every destination.

    This is the byte range the browser requests, so it doubles as the check
    that the published layout is what the frontend expects.
    """
    width = dtype.itemsize
    with path.open("rb") as file:
        file.seek(row * hex_count * width)
        buffer = file.read(hex_count * width)
    return np.frombuffer(buffer, dtype=dtype.newbyteorder(BYTE_ORDER))
