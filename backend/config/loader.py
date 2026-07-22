"""Loading city and analysis configs, and finding scenarios on disk."""

from pathlib import Path

import yaml

from backend.config.boundary import load_boundary
from backend.config.models import AnalysisConfig, CityConfig


def load_city(city_dir: Path) -> CityConfig:
    """Load a single city's `city.yaml`.

    Also validates that `boundary_filepath` contains a valid `Polygon` or
    `MultiPolygon` GeoJSON geometry (see `load_boundary`).

    Args:
        city_dir: Directory containing `city.yaml` (e.g. `configs/christchurch`).

    Returns:
        The validated `CityConfig`.

    Raises:
        FileNotFoundError: If `city_dir/city.yaml` doesn't exist.
        pydantic.ValidationError: If its contents don't match `CityConfig`, or
            if `boundary_filepath`'s contents aren't a valid boundary geometry.
    """
    with open(city_dir / "city.yaml") as file:
        data = yaml.safe_load(file)

    city = CityConfig(**data)
    load_boundary(city.boundary_filepath)
    return city


def load_analysis(filepath: Path) -> AnalysisConfig:
    """Load a single analysis YAML file.

    Args:
        filepath: Path to the analysis YAML file
            (e.g. `configs/christchurch/analyses/remove-route-135.yaml`).

    Returns:
        The validated `AnalysisConfig`.

    Raises:
        FileNotFoundError: If `filepath` doesn't exist.
        pydantic.ValidationError: If its contents don't match `AnalysisConfig`.
    """
    with open(filepath) as file:
        data = yaml.safe_load(file)

    return AnalysisConfig(**data)


def find_scenarios(configs_root: Path) -> list[Path]:
    """List every scenario YAML found under `configs_root`.

    A cheap filesystem glob only — nothing is parsed or validated, so this
    is safe to call even if some scenarios elsewhere are broken.

    Args:
        configs_root: Directory containing one subdirectory per city
            (e.g. `configs/`).

    Returns:
        Paths matching `<configs_root>/<city_id>/analyses/*.yaml`, sorted.
    """
    return sorted(configs_root.glob("*/analyses/*.yaml"))


def load_scenario(scenario_path: Path) -> tuple[CityConfig, AnalysisConfig]:
    """Load a scenario's city and analysis configs together.

    The city is inferred from the scenario's location on disk
    (`<city_dir>/analyses/<scenario>.yaml`), not from a field in the YAML.

    Args:
        scenario_path: Path to an analysis YAML file.

    Returns:
        A `(CityConfig, AnalysisConfig)` pair.

    Raises:
        FileNotFoundError: If the scenario file or its city's `city.yaml`
            doesn't exist.
        pydantic.ValidationError: If either file's contents are invalid.
    """
    city_dir = scenario_path.parent.parent
    return load_city(city_dir), load_analysis(scenario_path)
