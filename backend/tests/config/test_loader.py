from pathlib import Path

import pytest
import yaml

from backend.config.loader import (
    find_scenarios,
    load_analysis,
    load_city,
    load_scenario,
)

INVALID_POINT = {"type": "Point", "coordinates": [172.6, -43.6]}


@pytest.fixture
def make_city(tmp_path, touch):
    """Return a factory that writes a valid city directory under tmp_path."""

    def _make(city_id: str) -> Path:
        osm_path = touch(f"{city_id}/city.osm.pbf")
        city_yaml = tmp_path / city_id / "city.yaml"
        city_yaml.write_text(
            yaml.safe_dump(
                {
                    "id": city_id,
                    "name": city_id.title(),
                    "timezone": "Pacific/Auckland",
                    "osm_source": str(osm_path),
                }
            )
        )
        return city_yaml.parent

    return _make


@pytest.fixture
def add_analysis(touch):
    """Return a factory that writes a valid analysis YAML under a city dir."""

    def _add(city_dir: Path, analysis_id: str) -> Path:
        baseline_path = touch(f"{city_dir.name}/{analysis_id}-baseline.zip")
        modified_path = touch(f"{city_dir.name}/{analysis_id}-modified.zip")
        analysis_yaml = city_dir / "analyses" / f"{analysis_id}.yaml"
        analysis_yaml.parent.mkdir(parents=True, exist_ok=True)
        analysis_yaml.write_text(
            yaml.safe_dump(
                {
                    "id": analysis_id,
                    "metadata": {"title": analysis_id, "description": "..."},
                    "travel_time_boundary": {
                        "modes": ["walking"],
                        "value": 20,
                        "unit": "minutes",
                    },
                    "baseline_gtfs_filepath": str(baseline_path),
                    "modified_gtfs_filepath": str(modified_path),
                    "calendar_types": [
                        {"name": "weekday", "departure_date": "2026-08-03"}
                    ],
                    "time_windows": [
                        {"name": "am_peak", "start": "07:00", "end": "09:00"}
                    ],
                }
            )
        )
        return analysis_yaml

    return _add


def test_load_city_reads_yaml(make_city):
    city_dir = make_city("christchurch")

    city = load_city(city_dir)

    assert city.id == "christchurch"
    assert city.name == "Christchurch"


def test_load_analysis_reads_yaml(make_city, add_analysis):
    city_dir = make_city("christchurch")
    analysis_path = add_analysis(city_dir, "remove-route-135")

    analysis = load_analysis(analysis_path)

    assert analysis.id == "remove-route-135"


def test_find_scenarios_globs_every_analysis_across_every_city(
    tmp_path, make_city, add_analysis
):
    chch_dir = make_city("christchurch")
    add_analysis(chch_dir, "remove-route-135")
    wellington_dir = make_city("wellington")
    add_analysis(wellington_dir, "add-frequency-route-2")

    scenarios = find_scenarios(tmp_path)

    assert sorted(path.stem for path in scenarios) == [
        "add-frequency-route-2",
        "remove-route-135",
    ]


def test_find_scenarios_returns_empty_list_when_configs_root_is_empty(tmp_path):
    assert find_scenarios(tmp_path) == []


def test_load_scenario_infers_city_from_scenario_path(make_city, add_analysis):
    city_dir = make_city("christchurch")
    analysis_path = add_analysis(city_dir, "remove-route-135")

    city, analysis = load_scenario(analysis_path)

    assert city.id == "christchurch"
    assert analysis.id == "remove-route-135"
