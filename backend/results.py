"""Encoding and file layout for published travel time results.

Results are static files a browser reads with HTTP range requests, so a matrix
is a headerless dense array addressed purely by position. Everything needed to
decode it lives in the manifest.

This module must never import r5py: keeping it JVM-free is what makes the whole
storage layer testable in milliseconds.
"""

import json
from pathlib import Path

import h3
import numpy as np
import pandas as pd

from backend import log
from backend.config.models import AnalysisConfig, CalendarType, CityConfig, TimeWindow

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


def write_hexes(hex_ids: np.ndarray, path: Path) -> None:
    """Publish the hexagon list the browser binary-searches for a row offset.

    Written as 15-character strings because JavaScript cannot hold a uint64 in
    a Number. H3 ids are fixed-width lowercase hex, so lexical order matches
    the numeric order the rows were laid out in.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([h3.int_to_str(int(cell)) for cell in hex_ids]))


def study_area_inputs(city: CityConfig, analysis: AnalysisConfig) -> dict:
    """The configuration that determines the study area grid.

    Recorded so a later run can tell whether reusing the stored grid is safe.
    """
    return {
        "osm_source": str(city.osm_source),
        "baseline_gtfs_filepath": str(analysis.baseline_gtfs_filepath),
        "modified_gtfs_filepath": str(analysis.modified_gtfs_filepath),
        "hexagon_resolution": city.hexagon_resolution,
        "travel_time_boundary": analysis.travel_time_boundary.model_dump(mode="json"),
    }


def routing_parameter_inputs(analysis: AnalysisConfig) -> dict:
    """The routing parameters that determine how results are encoded.

    Recorded so a later run can tell whether reusing the stored encoding is
    safe. `max_time` decides the matrix element dtype (`element_dtype`);
    `percentiles` decides which variants exist at all.
    """
    return {
        "max_time": analysis.routing_parameters.max_time,
        "percentiles": list(analysis.routing_parameters.percentiles),
    }


def new_manifest(
    city: CityConfig,
    analysis: AnalysisConfig,
    hex_ids: np.ndarray,
    dtype: np.dtype,
) -> dict:
    """Build an empty manifest describing how to decode this analysis."""
    return {
        "schema_version": 1,
        "city": {
            "id": city.id,
            "name": city.name,
            "timezone": city.timezone,
            "center": city.center.model_dump(mode="json") if city.center else None,
        },
        "analysis": {
            "id": analysis.id,
            "title": analysis.metadata.title,
            "description": analysis.metadata.description,
            "sources": [
                source.model_dump(mode="json") for source in analysis.metadata.sources
            ],
            "consultation": (
                analysis.metadata.consultation.model_dump(mode="json")
                if analysis.metadata.consultation
                else None
            ),
        },
        "hexagon_resolution": city.hexagon_resolution,
        "hex_count": len(hex_ids),
        "percentiles": list(analysis.routing_parameters.percentiles),
        "encoding": {
            "dtype": dtype.name,
            "bytes_per_value": dtype.itemsize,
            "byte_order": "little",
            "unit": "minutes",
            "unreachable": unreachable(dtype),
        },
        "study_area": {
            "file": "study_area.parquet",
            "inputs": study_area_inputs(city, analysis),
        },
        "routing_parameters": {
            "inputs": routing_parameter_inputs(analysis),
        },
        "scenarios": [],
    }


def record_matrix(
    manifest: dict,
    calendar_type: CalendarType,
    time_window: TimeWindow,
    variant: str,
    percentile: int,
    relative_path: str,
) -> None:
    """Note that one matrix is now on disk, creating its scenario if needed."""
    for scenario in manifest["scenarios"]:
        if (
            scenario["calendar_type"] == calendar_type.name
            and scenario["time_window"] == time_window.name
        ):
            break
    else:
        scenario = {
            "calendar_type": calendar_type.name,
            "calendar_type_label": calendar_type.display_label,
            "departure_date": calendar_type.departure_date.isoformat(),
            "time_window": time_window.name,
            "time_window_label": time_window.display_label,
            "start": time_window.start.isoformat(timespec="minutes"),
            "end": time_window.end.isoformat(timespec="minutes"),
            "variants": {},
        }
        manifest["scenarios"].append(scenario)

    scenario["variants"].setdefault(variant, {})[str(percentile)] = relative_path


def write_manifest(manifest: dict, path: Path) -> None:
    """Publish the manifest. Rewritten after every matrix, so it never
    describes a file that is not there."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(manifest, indent=2))
    temporary.replace(path)


def read_manifest(path: Path) -> dict:
    return json.loads(path.read_text())


def stale_fields(
    manifest: dict, city: CityConfig, analysis: AnalysisConfig
) -> list[str]:
    """Which study area or routing parameter inputs changed since the output
    was written.

    A changed study area input means every existing matrix is addressed
    against a hexagon list this run is no longer using. A changed routing
    parameter input means the existing matrices were encoded (dtype,
    percentile set) for settings this run no longer has.
    """
    recorded_study_area = manifest["study_area"]["inputs"]
    current_study_area = study_area_inputs(city, analysis)
    changed = [
        field
        for field, value in current_study_area.items()
        if recorded_study_area.get(field) != value
    ]

    recorded_routing = manifest.get("routing_parameters", {}).get("inputs")
    current_routing = routing_parameter_inputs(analysis)
    if current_routing != recorded_routing:
        changed.append("routing_parameters")

    return changed
