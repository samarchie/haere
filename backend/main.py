from pathlib import Path

import click
import geopandas as gpd
import pydantic
import yaml

from backend import gtfs, validate
from backend.config.loader import find_scenarios, load_scenario
from backend.config.models import AnalysisConfig, CityConfig

CONFIGS_ROOT = Path("configs")


@click.group
def cli():
    pass


@cli.command("validate-gtfs")
@click.argument("source", type=click.STRING)
@click.option(
    "--verbose",
    default=False,
    is_flag=True,
    flag_value=True,
    show_default=True,
    help="Show output from the validator",
)
def validate_cmd(source: str, verbose: bool):
    """Validate a GTFS feed (local file or URL)."""
    try:
        is_valid = validate.validate_gtfs(source, verbose)
        if is_valid:
            click.secho(f"GTFS file ({source}) is valid.", fg="green")
        else:
            click.secho(f"GTFS file ({source}) is not valid.", fg="red", err=True)
    except FileNotFoundError as e:
        raise click.FileError(source, hint=str(e))


@cli.command("run")
@click.argument("scenario", required=False, type=click.Path(path_type=Path))
def run_cmd(scenario: Path | None):
    """Load and validate a scenario, given a path or chosen interactively."""
    if scenario is None:
        scenarios = find_scenarios(CONFIGS_ROOT)
        if not scenarios:
            raise click.ClickException(f"No scenarios found under {CONFIGS_ROOT}")
        for index, path in enumerate(scenarios, start=1):
            click.echo(f"{index}. {path.stem}")
        choice = click.prompt(
            "Select a scenario", type=click.IntRange(1, len(scenarios))
        )
        scenario = scenarios[choice - 1]

    try:
        city, analysis = load_scenario(scenario)
    except (
        OSError,
        pydantic.ValidationError,
        yaml.YAMLError,
        TypeError,
        ValueError,
    ) as e:
        raise click.ClickException(f"Failed to load scenario {scenario}: {e}")
    click.echo(f"{analysis.metadata.title} ({city.name})")
    click.echo(analysis.metadata.description)

    build_study_area(city, analysis)


# ponytail: orchestration lives here until the travel-time loop lands, at which
# point it moves to backend/pipeline.py.
def build_study_area(city: CityConfig, analysis: AnalysisConfig) -> gpd.GeoDataFrame:
    """Build the hex grid covering everywhere within reach of a transit stop.

    Args:
        city: The city being analysed, supplying the OSM extract and the
            hexagon resolution.
        analysis: The scenario, supplying both GTFS feeds and the study area
            boundary.

    Returns:
        The hexagon grid for the study area, in EPSG:4326.
    """

    # Imported here rather than at module scope so that `--help`,
    # `validate-gtfs` and the CLI tests never pay for r5py starting a JVM.
    import pandas as pd

    from backend import hexgrid, routing

    stops = gtfs.unique_stops(
        analysis.baseline_gtfs_filepath, analysis.modified_gtfs_filepath
    )

    network = routing.transport_network(
        city.osm_source, analysis.baseline_gtfs_filepath, city.elevation_filepath
    )

    # One representative calendar type and time window is enough to bound the
    # study area; the full sweep belongs to the travel-time analysis.
    boundary = analysis.study_area_boundary
    calendar_type = analysis.calendar_types[0]
    time_window = analysis.time_windows[0]

    reachable = routing.isochrone(
        network,
        stops,
        max_travel_time=pd.Timedelta(boundary.value, boundary.unit),
        transport_modes=routing.modes(boundary.modes),
        departure=calendar_type.departure_at(time_window),
        departure_time_window=time_window.duration,
    )

    return hexgrid.generate(reachable, city.hexagon_resolution)


if __name__ == "__main__":
    cli()
