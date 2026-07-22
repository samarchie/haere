from datetime import date, time

import pytest
from pydantic import ValidationError

from backend.config.models import (
    CalendarType,
    DataSource,
    RoutingParameters,
    ScenarioMetadata,
    TimeWindow,
)


def test_time_window_accepts_valid_range():
    window = TimeWindow(name="am_peak", start=time(7, 0), end=time(9, 0))
    assert window.name == "am_peak"
    assert window.start == time(7, 0)
    assert window.end == time(9, 0)


@pytest.mark.parametrize(
    "start, end",
    [
        pytest.param(time(9, 0), time(7, 0), id="end_before_start"),
        pytest.param(time(9, 0), time(9, 0), id="end_equals_start"),
    ],
)
def test_time_window_rejects_non_positive_range(start, end):
    with pytest.raises(ValidationError, match="end must be after start"):
        TimeWindow(name="am_peak", start=start, end=end)


def test_data_source_defaults_are_optional():
    source = DataSource(name="Environment Canterbury GTFS")
    assert source.url is None
    assert source.published is None


def test_scenario_metadata_defaults_to_no_sources():
    metadata = ScenarioMetadata(title="Remove Route 135", description="...")
    assert metadata.sources == []


def test_calendar_type_requires_name_and_date():
    calendar_type = CalendarType(name="weekday", departure_date=date(2026, 8, 3))
    assert calendar_type.name == "weekday"
    assert calendar_type.departure_date == date(2026, 8, 3)


def test_routing_parameters_defaults():
    params = RoutingParameters()
    assert params.max_walk_time == 15
    assert params.transfer_wait_time == 5
    assert params.percentiles == [50]
    assert params.monte_carlo_draws == 1


@pytest.mark.parametrize(
    "field, value",
    [
        pytest.param("max_walk_time", 0, id="max_walk_time_zero"),
        pytest.param("transfer_wait_time", -1, id="transfer_wait_time_negative"),
        pytest.param("monte_carlo_draws", 0, id="monte_carlo_draws_zero"),
    ],
)
def test_routing_parameters_rejects_out_of_range_scalar(field, value):
    with pytest.raises(ValidationError):
        RoutingParameters(**{field: value})


@pytest.mark.parametrize(
    "percentiles",
    [
        pytest.param([0], id="below_range"),
        pytest.param([101], id="above_range"),
    ],
)
def test_routing_parameters_rejects_out_of_range_percentile(percentiles):
    with pytest.raises(ValidationError):
        RoutingParameters(percentiles=percentiles)
