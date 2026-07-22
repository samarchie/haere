from pathlib import Path

from backend.config.loader import find_scenarios, load_scenario

_CONFIGS_ROOT = Path(__file__).resolve().parents[3] / "configs"


def test_find_scenarios_lists_the_example_scenario():
    scenarios = find_scenarios(_CONFIGS_ROOT)

    assert [path.stem for path in scenarios] == ["remove-route-135"]


def test_load_scenario_loads_the_example_christchurch_scenario():
    scenario_path = (
        _CONFIGS_ROOT / "christchurch" / "analyses" / "remove-route-135.yaml"
    )

    city, analysis = load_scenario(scenario_path)

    assert city.id == "christchurch"
    assert city.h3_resolution == 9
    assert analysis.id == "remove-route-135"
    assert len(analysis.calendar_types) == 3
    assert len(analysis.time_windows) == 4
