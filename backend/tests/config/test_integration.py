from pathlib import Path

import pytest

from backend.config.loader import find_scenarios, load_scenario

_CONFIGS_ROOT = Path(__file__).resolve().parents[3] / "configs"


@pytest.fixture
def canterbury_data():
    """Placeholders for the (gitignored) data files the example scenario references."""
    paths = [Path("data/gtfs.zip"), Path("data/chch.osm.pbf")]
    created = []
    for path in paths:
        if path.exists():
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"placeholder")
        created.append(path)
    yield
    for path in created:
        path.unlink()


def test_find_scenarios_lists_the_example_scenario():
    scenarios = find_scenarios(_CONFIGS_ROOT)

    assert [path.stem for path in scenarios] == ["remove-route-135"]


def test_load_scenario_loads_the_example_canterbury_scenario(canterbury_data):
    scenario_path = _CONFIGS_ROOT / "canterbury" / "analyses" / "remove-route-135.yaml"

    city, analysis = load_scenario(scenario_path)

    assert city.id == "canterbury"
    assert city.hexagon_resolution == 9
    assert analysis.id == "remove-route-135"
    assert len(analysis.calendar_types) == 3
    assert len(analysis.time_windows) == 4
