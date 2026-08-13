"""Pydantic models for city and analysis configuration."""

from datetime import date, datetime, time, timedelta
from typing import Literal
from zoneinfo import available_timezones

from pydantic import BaseModel, Field, FilePath, HttpUrl, model_validator


class DataSource(BaseModel):
    """A single data source credited on an analysis (e.g. a GTFS feed)."""

    name: str
    url: HttpUrl | None = None
    published: date | None = None


class Consultation(BaseModel):
    """A public consultation this analysis models, if any."""

    closes_at: datetime
    url: HttpUrl


class ScenarioMetadata(BaseModel):
    """Frontend-facing description of an intervention scenario."""

    title: str
    description: str
    sources: list[DataSource] = Field(default_factory=list)
    consultation: Consultation


class CalendarType(BaseModel):
    """One GTFS calendar type (e.g. weekday) and the date to route on."""

    name: str
    departure_date: date

    def departure_at(self, time_window: "TimeWindow") -> datetime:
        """Return the moment this calendar type's date enters `time_window`."""
        return datetime.combine(self.departure_date, time_window.start)


class TimeWindow(BaseModel):
    """A representative time-of-day window (e.g. AM peak) to route within."""

    name: str
    start: time
    end: time

    @model_validator(mode="after")
    def _check_end_after_start(self) -> "TimeWindow":
        if self.end <= self.start:
            raise ValueError("end must be after start")
        return self

    @property
    def duration(self) -> timedelta:
        """How long the window lasts.

        The validator guarantees `end` is after `start`, so this never wraps
        past midnight and never goes negative.
        """
        return datetime.combine(date.min, self.end) - datetime.combine(
            date.min, self.start
        )


class RoutingParameters(BaseModel):
    """Tunable r5py routing parameters, all defaulted to sensible values.

    Only settings r5py can actually honour appear here. Its `RegionalTask`
    hard-codes monte carlo draws to 60 and exposes no transfer wait time, so
    neither is configurable.
    """

    max_walk_time: int = Field(default=15, gt=0)
    max_time: int = Field(default=120, gt=0)
    percentiles: list[int] = Field(default_factory=lambda: [50])

    @model_validator(mode="after")
    def _check_percentiles(self) -> "RoutingParameters":
        if len(self.percentiles) > 5:
            raise ValueError("R5 allows at most 5 percentiles")
        for percentile in self.percentiles:
            if not (1 <= percentile <= 100):
                raise ValueError(f"percentile {percentile} must be between 1 and 100")
        return self


class CityConfig(BaseModel):
    """City-level configuration shared across all analyses in that city."""

    schema_version: int = 1
    id: str
    name: str
    timezone: str
    osm_source: FilePath
    elevation_filepath: FilePath | None = None
    hexagon_resolution: int = 9

    @model_validator(mode="after")
    def _check_timezone(self) -> "CityConfig":
        if self.timezone not in available_timezones():
            raise ValueError(f"'{self.timezone}' is not a recognised IANA timezone")
        return self


class TravelTimeBoundary(BaseModel):
    """The isochrone (by mode and duration/distance) that bounds an analysis's hexagons to a given study area."""

    modes: list[Literal["transit", "driving", "cycling", "walking"]] = ["walking"]
    value: int | float = Field(default=20, gt=0)
    unit: Literal[
        "D",
        "day",
        "days",
        "h",
        "hour",
        "hours",
        "hr",
        "m",
        "micro",
        "micros",
        "microsecond",
        "microseconds",
        "milli",
        "millis",
        "millisecond",
        "milliseconds",
        "min",
        "minute",
        "minutes",
        "ms",
        "nano",
        "nanos",
        "nanosecond",
        "nanoseconds",
        "ns",
        "s",
        "sec",
        "second",
        "seconds",
        "us",
        "W",
    ] = "minutes"


class AnalysisConfig(BaseModel):
    """One baseline-vs-modified intervention scenario within a city."""

    schema_version: int = 1
    id: str
    metadata: ScenarioMetadata
    travel_time_boundary: TravelTimeBoundary
    baseline_gtfs_filepath: FilePath
    modified_gtfs_filepath: FilePath
    calendar_types: list[CalendarType] = Field(min_length=1)
    time_windows: list[TimeWindow] = Field(min_length=1)
    routing_parameters: RoutingParameters = Field(default_factory=RoutingParameters)

    @model_validator(mode="after")
    def _check_unique_names(self) -> "AnalysisConfig":
        for field_name, items in (
            ("calendar_types", self.calendar_types),
            ("time_windows", self.time_windows),
        ):
            names = [item.name for item in items]
            if len(names) != len(set(names)):
                raise ValueError(f"duplicate {field_name} name")
        return self
