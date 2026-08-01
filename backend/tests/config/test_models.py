from datetime import date, datetime, time, timedelta

import pydantic
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


def test_routing_parameters_default_to_two_hours_and_the_median():
    parameters = RoutingParameters()

    assert parameters.max_time == 120
    assert parameters.max_walk_time == 15
    assert parameters.percentiles == [50]


def test_routing_parameters_reject_more_than_five_percentiles():
    """R5 refuses more than five percentiles, so the config must too."""
    with pytest.raises(pydantic.ValidationError, match="at most 5 percentiles"):
        RoutingParameters(percentiles=[10, 25, 50, 75, 90, 95])


def test_routing_parameters_accept_exactly_five_percentiles():
    parameters = RoutingParameters(percentiles=[10, 25, 50, 75, 90])

    assert len(parameters.percentiles) == 5


def test_routing_parameters_reject_a_non_positive_max_time():
    with pytest.raises(pydantic.ValidationError):
        RoutingParameters(max_time=0)


def test_routing_parameters_no_longer_accept_unimplementable_fields():
    """r5py hard-codes monte carlo draws and has no transfer wait setting.

    Config that cannot take effect is worse than absent config, so the fields
    are gone rather than silently ignored.
    """
    assert "monte_carlo_draws" not in RoutingParameters.model_fields
    assert "transfer_wait_time" not in RoutingParameters.model_fields


def test_routing_parameters_rejects_non_positive_max_walk_time():
    with pytest.raises(ValidationError):
        RoutingParameters(max_walk_time=0)


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


def test_time_window_duration_is_the_span_between_start_and_end():
    window = TimeWindow(name="am_peak", start=time(7, 0), end=time(9, 30))

    assert window.duration == timedelta(hours=2, minutes=30)


def test_calendar_type_departure_at_combines_its_date_with_the_window_start():
    calendar_type = CalendarType(name="weekday", departure_date=date(2026, 8, 3))
    window = TimeWindow(name="am_peak", start=time(7, 0), end=time(9, 0))

    assert calendar_type.departure_at(window) == datetime(2026, 8, 3, 7, 0)
