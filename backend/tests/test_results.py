"""The storage layer. No r5py, no JVM, no fixtures on disk beyond tmp_path."""

import h3
import numpy as np
import pandas as pd
import pytest

from backend import results

# Three real, ascending resolution-9 cell ids. Derived from h3 rather than
# written as literals: an invented integer is not a valid cell id and will not
# round-trip to the fixed-width 15-character string the layout depends on.
HEX_IDS = np.array(
    sorted(
        h3.str_to_int(cell)
        for cell in h3.grid_disk(h3.latlng_to_cell(-43.53, 172.63, 9), 1)
    )[:3],
    dtype=np.uint64,
)


def _frame(pairs):
    """Build an r5py-shaped result frame from (from, to, minutes) triples."""
    return pd.DataFrame(
        {
            "from_id": np.array([p[0] for p in pairs], dtype=np.uint64),
            "to_id": np.array([p[1] for p in pairs], dtype=np.uint64),
            "travel_time": [p[2] for p in pairs],
        }
    )


def _full_frame(value=10.0):
    return _frame(
        [(origin, destination, value) for origin in HEX_IDS for destination in HEX_IDS]
    )


def test_max_time_within_a_byte_selects_uint8():
    assert results.element_dtype(120) == np.uint8
    assert results.element_dtype(254) == np.uint8


def test_max_time_beyond_a_byte_selects_uint16():
    """A six-hour max_time makes 360-minute journeys legitimate answers.

    Encoding them in a uint8 would flatten every one of them to 'unreachable'.
    """
    assert results.element_dtype(255) == np.uint16
    assert results.element_dtype(360) == np.uint16


def test_unreachable_is_the_largest_value_the_dtype_holds():
    assert results.unreachable(np.dtype(np.uint8)) == 255
    assert results.unreachable(np.dtype(np.uint16)) == 65535


def test_matrix_size_is_the_square_of_the_hex_count_times_the_width():
    assert results.matrix_size(4197, np.dtype(np.uint8)) == 4197 * 4197
    assert results.matrix_size(4197, np.dtype(np.uint16)) == 4197 * 4197 * 2


def test_written_file_is_exactly_the_expected_size(tmp_path):
    path = tmp_path / "baseline.p50.bin"

    results.write_matrix(
        _full_frame(), HEX_IDS, "travel_time", np.dtype(np.uint8), path
    )

    assert path.stat().st_size == results.matrix_size(3, np.dtype(np.uint8))


def test_values_round_trip_through_a_row_read(tmp_path):
    path = tmp_path / "baseline.p50.bin"
    frame = _frame(
        [
            (HEX_IDS[0], HEX_IDS[0], 0.0),
            (HEX_IDS[0], HEX_IDS[1], 17.0),
            (HEX_IDS[0], HEX_IDS[2], 254.0),
        ]
    )

    results.write_matrix(frame, HEX_IDS, "travel_time", np.dtype(np.uint8), path)
    row = results.read_row(path, 0, 3, np.dtype(np.uint8))

    assert list(row) == [0, 17, 254]


def test_unreached_pairs_become_the_sentinel(tmp_path):
    path = tmp_path / "baseline.p50.bin"
    frame = _frame([(HEX_IDS[0], HEX_IDS[0], 0.0), (HEX_IDS[0], HEX_IDS[1], np.nan)])

    results.write_matrix(frame, HEX_IDS, "travel_time", np.dtype(np.uint8), path)
    row = results.read_row(path, 0, 3, np.dtype(np.uint8))

    # Index 1 was explicitly NaN; index 2 was never mentioned at all.
    assert list(row) == [0, 255, 255]


def test_values_at_or_above_the_sentinel_are_clamped_and_counted(tmp_path):
    path = tmp_path / "baseline.p50.bin"
    frame = _frame(
        [
            (HEX_IDS[0], HEX_IDS[0], 254.0),
            (HEX_IDS[0], HEX_IDS[1], 255.0),
            (HEX_IDS[0], HEX_IDS[2], 900.0),
        ]
    )

    clamped = results.write_matrix(
        frame, HEX_IDS, "travel_time", np.dtype(np.uint8), path
    )

    assert clamped == 2
    assert list(results.read_row(path, 0, 3, np.dtype(np.uint8))) == [254, 255, 255]


def test_nothing_is_clamped_when_every_value_fits(tmp_path):
    path = tmp_path / "baseline.p50.bin"

    clamped = results.write_matrix(
        _full_frame(10.0), HEX_IDS, "travel_time", np.dtype(np.uint8), path
    )

    assert clamped == 0


def test_a_clamp_is_logged_with_its_count(tmp_path, caplog):
    """Truncation must never be silent."""
    path = tmp_path / "baseline.p50.bin"
    frame = _frame([(HEX_IDS[0], HEX_IDS[0], 900.0)])

    with caplog.at_level("WARNING"):
        results.write_matrix(frame, HEX_IDS, "travel_time", np.dtype(np.uint8), path)

    assert "1" in caplog.text
    assert "clamp" in caplog.text.lower()


def test_uint16_holds_values_a_byte_could_not(tmp_path):
    path = tmp_path / "baseline.p50.bin"
    frame = _frame([(HEX_IDS[0], HEX_IDS[1], 360.0)])

    clamped = results.write_matrix(
        frame, HEX_IDS, "travel_time", np.dtype(np.uint16), path
    )

    assert clamped == 0
    assert results.read_row(path, 0, 3, np.dtype(np.uint16))[1] == 360


def test_uint16_is_written_little_endian(tmp_path):
    """The browser reads these bytes; the manifest promises little-endian."""
    path = tmp_path / "baseline.p50.bin"
    frame = _frame([(HEX_IDS[0], HEX_IDS[0], 258.0)])

    results.write_matrix(frame, HEX_IDS, "travel_time", np.dtype(np.uint16), path)

    # 258 == 0x0102, so little-endian puts the low byte first.
    assert path.read_bytes()[:2] == b"\x02\x01"


def test_rows_follow_sorted_hex_id_order_regardless_of_input_order(tmp_path):
    """Row offsets are positions in the sorted id list, not arrival order."""
    path = tmp_path / "baseline.p50.bin"
    shuffled = _frame(
        [
            (HEX_IDS[2], HEX_IDS[0], 30.0),
            (HEX_IDS[0], HEX_IDS[0], 10.0),
            (HEX_IDS[1], HEX_IDS[0], 20.0),
        ]
    )

    results.write_matrix(shuffled, HEX_IDS, "travel_time", np.dtype(np.uint8), path)

    assert results.read_row(path, 0, 3, np.dtype(np.uint8))[0] == 10
    assert results.read_row(path, 1, 3, np.dtype(np.uint8))[0] == 20
    assert results.read_row(path, 2, 3, np.dtype(np.uint8))[0] == 30


def test_a_hexagon_outside_the_study_area_is_an_error(tmp_path):
    """Quietly dropping the row would leave a plausible-looking wrong matrix."""
    path = tmp_path / "baseline.p50.bin"
    stranger = _frame([(np.uint64(1), HEX_IDS[0], 10.0)])

    with pytest.raises(ValueError, match="outside the study area"):
        results.write_matrix(stranger, HEX_IDS, "travel_time", np.dtype(np.uint8), path)


def test_a_percentile_column_can_be_selected(tmp_path):
    """With several percentiles r5py emits travel_time_p50, travel_time_p90..."""
    path = tmp_path / "baseline.p90.bin"
    frame = _full_frame()
    frame = frame.rename(columns={"travel_time": "travel_time_p50"})
    frame["travel_time_p90"] = 42.0

    results.write_matrix(frame, HEX_IDS, "travel_time_p90", np.dtype(np.uint8), path)

    assert results.read_row(path, 0, 3, np.dtype(np.uint8))[0] == 42


def test_no_partial_file_is_left_behind_when_writing_fails(tmp_path):
    """A half-written file of the right length would pass the resume check."""
    path = tmp_path / "baseline.p50.bin"
    stranger = _frame([(np.uint64(1), HEX_IDS[0], 10.0)])

    with pytest.raises(ValueError):
        results.write_matrix(stranger, HEX_IDS, "travel_time", np.dtype(np.uint8), path)

    assert not path.exists()
    assert list(tmp_path.iterdir()) == []


def test_parent_directories_are_created(tmp_path):
    path = tmp_path / "weekday" / "am_peak" / "baseline.p50.bin"

    results.write_matrix(
        _full_frame(), HEX_IDS, "travel_time", np.dtype(np.uint8), path
    )

    assert path.exists()
