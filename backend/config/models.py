"""Pydantic models for city and analysis configuration."""

from datetime import date, time

from pydantic import BaseModel, Field, HttpUrl, model_validator


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
