from datetime import date, time

import pytest
from pydantic import ValidationError

from backend.config.models import (
    AnalysisConfig,
    CalendarType,
    RoutingParameters,
    ScenarioMetadata,
    TimeWindow,
)


@pytest.fixture
def analysis_kwargs(touch):
    return dict(
        id="remove-route-135",
        metadata=ScenarioMetadata(title="Remove Route 135", description="..."),
        baseline_gtfs_filepath=touch("baseline.zip"),
        modified_gtfs_filepath=touch("modified.zip"),
        calendar_types=[CalendarType(name="weekday", departure_date=date(2026, 8, 3))],
        time_windows=[TimeWindow(name="am_peak", start=time(7, 0), end=time(9, 0))],
    )


def test_analysis_config_accepts_valid_input(analysis_kwargs):
    analysis = AnalysisConfig(**analysis_kwargs)

    assert analysis.schema_version == 1
    assert analysis.routing_parameters == RoutingParameters()


@pytest.mark.parametrize(
    "list_field, make_duplicate, match",
    [
        pytest.param(
            "calendar_types",
            lambda: [
                CalendarType(name="weekday", departure_date=date(2026, 8, 3)),
                CalendarType(name="weekday", departure_date=date(2026, 8, 10)),
            ],
            "duplicate calendar_types name",
            id="calendar_types",
        ),
        pytest.param(
            "time_windows",
            lambda: [
                TimeWindow(name="am_peak", start=time(7, 0), end=time(9, 0)),
                TimeWindow(name="am_peak", start=time(15, 0), end=time(18, 0)),
            ],
            "duplicate time_windows name",
            id="time_windows",
        ),
    ],
)
def test_analysis_config_rejects_duplicate_names(
    analysis_kwargs, list_field, make_duplicate, match
):
    analysis_kwargs[list_field] = make_duplicate()

    with pytest.raises(ValidationError, match=match):
        AnalysisConfig(**analysis_kwargs)


@pytest.mark.parametrize(
    "gtfs_field", ["baseline_gtfs_filepath", "modified_gtfs_filepath"]
)
def test_analysis_config_rejects_missing_gtfs_file(
    analysis_kwargs, tmp_path, gtfs_field
):
    analysis_kwargs[gtfs_field] = tmp_path / "does_not_exist.zip"

    with pytest.raises(ValidationError):
        AnalysisConfig(**analysis_kwargs)
