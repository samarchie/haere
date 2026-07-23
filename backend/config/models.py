"""Pydantic models for city and analysis configuration."""

from datetime import date, time
from typing import Literal
from zoneinfo import available_timezones

from pydantic import BaseModel, Field, FilePath, HttpUrl, model_validator


class DataSource(BaseModel):
    """A single data source credited on an analysis (e.g. a GTFS feed)."""

    name: str
    url: HttpUrl | None = None
    published: date | None = None


class ScenarioMetadata(BaseModel):
    """Frontend-facing description of an intervention scenario."""

    title: str
    description: str
    sources: list[DataSource] = Field(default_factory=list)


class CalendarType(BaseModel):
    """One GTFS calendar type (e.g. weekday) and the date to route on."""

    name: str
    departure_date: date


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


class RoutingParameters(BaseModel):
    """Tunable r5py routing parameters, all defaulted to sensible values."""

    max_walk_time: int = Field(default=15, gt=0)
    transfer_wait_time: int = Field(default=5, ge=0)
    percentiles: list[int] = Field(default_factory=lambda: [50])
    monte_carlo_draws: int = Field(default=1, gt=0)

    @model_validator(mode="after")
    def _check_percentiles_in_range(self) -> "RoutingParameters":
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
    osm_source: HttpUrl | FilePath
    elevation_filepath: FilePath | None = None
    hexagon_resolution: int = 9

    @model_validator(mode="after")
    def _check_timezone(self) -> "CityConfig":
        if self.timezone not in available_timezones():
            raise ValueError(f"'{self.timezone}' is not a recognised IANA timezone")
        return self


class IsochroneBoundary(BaseModel):
    """The isochrone (by mode and duration/distance) that bounds an analysis's hexagons."""

    mode: Literal["driving", "cycling", "walking"] = "walking"
    metric: Literal["duration_mins", "distance_meters"] = "duration_mins"
    value: int | float = 20


class AnalysisConfig(BaseModel):
    """One baseline-vs-modified intervention scenario within a city."""

    schema_version: int = 1
    id: str
    metadata: ScenarioMetadata
    isochrone_boundary: IsochroneBoundary
    baseline_gtfs_filepath: FilePath
    modified_gtfs_filepath: FilePath
    calendar_types: list[CalendarType]
    time_windows: list[TimeWindow]
    routing_parameters: RoutingParameters = Field(default_factory=RoutingParameters)

    @model_validator(mode="after")
    def _check_unique_calendar_type_names(self) -> "AnalysisConfig":
        names = [calendar_type.name for calendar_type in self.calendar_types]
        if len(names) != len(set(names)):
            raise ValueError("duplicate calendar_types name")
        return self

    @model_validator(mode="after")
    def _check_unique_time_window_names(self) -> "AnalysisConfig":
        names = [window.name for window in self.time_windows]
        if len(names) != len(set(names)):
            raise ValueError("duplicate time_windows name")
        return self

    @model_validator(mode="after")
    def _check_valid_boundary_type(self) -> "AnalysisConfig":
        names = [window.name for window in self.time_windows]
        if len(names) != len(set(names)):
            raise ValueError("duplicate time_windows name")
        return self
