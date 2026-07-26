from pathlib import Path

import pytest
import yaml
from click.testing import CliRunner

from backend.main import cli


def _make_scenario(tmp_path: Path, city_id: str, analysis_id: str) -> Path:
    city_dir = tmp_path / city_id
    osm_path = city_dir / "city.osm.pbf"
    baseline_path = city_dir / "baseline.zip"
    modified_path = city_dir / "modified.zip"
    for path in (osm_path, baseline_path, modified_path):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"placeholder")

    (city_dir / "city.yaml").write_text(
        yaml.safe_dump(
            {
                "id": city_id,
                "name": city_id.title(),
                "timezone": "Pacific/Auckland",
                "osm_source": str(osm_path),
            }
        )
    )

    analysis_path = city_dir / "analyses" / f"{analysis_id}.yaml"
    analysis_path.parent.mkdir(parents=True, exist_ok=True)
    analysis_path.write_text(
        yaml.safe_dump(
            {
                "id": analysis_id,
                "metadata": {"title": "Remove Route 135", "description": "..."},
                "travel_time_boundary": {
                    "modes": ["transit"],
                    "value": 30,
                    "unit": "minutes",
                },
                "baseline_gtfs_filepath": str(baseline_path),
                "modified_gtfs_filepath": str(modified_path),
                "calendar_types": [{"name": "weekday", "departure_date": "2026-08-03"}],
                "time_windows": [{"name": "am_peak", "start": "07:00", "end": "09:00"}],
            }
        )
    )
    return analysis_path


@pytest.fixture(autouse=True)
def stub_pipeline(monkeypatch):
    """Keep CLI tests off the routing engine.

    The pipeline needs a real OSM extract, a real GTFS feed and a JVM. These
    tests are about the command line, so record the call and return.
    """
    calls = []

    def _fake(city, analysis, only=(), force=False):
        calls.append({"city": city, "analysis": analysis, "only": only, "force": force})
        return Path("output") / city.id / analysis.id

    monkeypatch.setattr("backend.pipeline.run", _fake)
    return calls


def test_run_with_explicit_scenario_path(tmp_path):
    scenario_path = _make_scenario(tmp_path, "christchurch", "remove-route-135")

    result = CliRunner().invoke(cli, ["run", str(scenario_path)])

    assert result.exit_code == 0
    assert "Remove Route 135" in result.output
    assert "Christchurch" in result.output


def test_run_invokes_the_pipeline_with_the_loaded_scenario(tmp_path, stub_pipeline):
    scenario_path = _make_scenario(tmp_path, "christchurch", "remove-route-135")

    result = CliRunner().invoke(cli, ["run", str(scenario_path)])

    assert result.exit_code == 0
    assert len(stub_pipeline) == 1
    assert stub_pipeline[0]["city"].id == "christchurch"
    assert stub_pipeline[0]["analysis"].id == "remove-route-135"


def test_run_with_no_argument_lists_scenarios_and_prompts(tmp_path, monkeypatch):
    _make_scenario(tmp_path, "christchurch", "remove-route-135")
    monkeypatch.setattr("backend.main.CONFIGS_ROOT", tmp_path)

    result = CliRunner().invoke(cli, ["run"], input="1\n")

    assert result.exit_code == 0
    assert "remove-route-135" in result.output
    assert "Remove Route 135" in result.output


def test_run_reports_no_scenarios_found(tmp_path, monkeypatch):
    monkeypatch.setattr("backend.main.CONFIGS_ROOT", tmp_path)

    result = CliRunner().invoke(cli, ["run"])

    assert result.exit_code != 0
    assert "No scenarios found" in result.output


def test_run_with_missing_scenario_file_reports_clean_error(tmp_path):
    scenario_path = tmp_path / "does-not-exist.yaml"

    result = CliRunner().invoke(cli, ["run", str(scenario_path)])

    assert result.exit_code != 0
    assert "Traceback" not in result.output
    assert str(scenario_path) in result.output


def test_run_with_malformed_yaml_reports_clean_error(tmp_path):
    scenario_path = _make_scenario(tmp_path, "christchurch", "remove-route-135")
    scenario_path.write_text("key: [unclosed")

    result = CliRunner().invoke(cli, ["run", str(scenario_path)])

    assert result.exit_code != 0
    assert "Traceback" not in result.output
    assert str(scenario_path) in result.output


def test_run_with_invalid_scenario_reports_clean_error(tmp_path):
    scenario_path = _make_scenario(tmp_path, "christchurch", "remove-route-135")
    # Overwrite with content missing required fields.
    scenario_path.write_text(yaml.safe_dump({"id": "remove-route-135"}))

    result = CliRunner().invoke(cli, ["run", str(scenario_path)])

    assert result.exit_code != 0
    assert "Traceback" not in result.output
    assert str(scenario_path) in result.output


def test_only_is_passed_through_and_repeatable(tmp_path, stub_pipeline):
    scenario_path = _make_scenario(tmp_path, "christchurch", "remove-route-135")

    result = CliRunner().invoke(
        cli,
        [
            "run",
            str(scenario_path),
            "--only",
            "weekday/am_peak",
            "--only",
            "weekday/midday",
        ],
    )

    assert result.exit_code == 0
    assert stub_pipeline[0]["only"] == ("weekday/am_peak", "weekday/midday")


def test_force_is_passed_through(tmp_path, stub_pipeline):
    scenario_path = _make_scenario(tmp_path, "christchurch", "remove-route-135")

    result = CliRunner().invoke(cli, ["run", str(scenario_path), "--force"])

    assert result.exit_code == 0
    assert stub_pipeline[0]["force"] is True


def test_run_reports_the_output_directory(tmp_path, stub_pipeline):
    scenario_path = _make_scenario(tmp_path, "christchurch", "remove-route-135")

    result = CliRunner().invoke(cli, ["run", str(scenario_path)])

    assert "output/christchurch/remove-route-135" in result.output


def test_stale_output_reports_a_clean_error(tmp_path, monkeypatch):
    """A three-hour job must not end in a traceback."""
    from backend import pipeline

    scenario_path = _make_scenario(tmp_path, "christchurch", "remove-route-135")

    def _stale(city, analysis, only=(), force=False):
        raise pipeline.StaleOutputError("travel_time_boundary changed")

    monkeypatch.setattr("backend.pipeline.run", _stale)

    result = CliRunner().invoke(cli, ["run", str(scenario_path)])

    assert result.exit_code != 0
    assert "Traceback" not in result.output
    assert "travel_time_boundary changed" in result.output


def test_an_unmatched_only_reports_a_clean_error(tmp_path, monkeypatch):
    scenario_path = _make_scenario(tmp_path, "christchurch", "remove-route-135")

    def _unmatched(city, analysis, only=(), force=False):
        raise ValueError("--only matched no scenarios. Available: weekday/am_peak")

    monkeypatch.setattr("backend.pipeline.run", _unmatched)

    result = CliRunner().invoke(cli, ["run", str(scenario_path), "--only", "nope/nope"])

    assert result.exit_code != 0
    assert "Traceback" not in result.output
    assert "weekday/am_peak" in result.output
