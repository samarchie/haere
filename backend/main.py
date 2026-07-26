from pathlib import Path

import click
import pydantic
import yaml

from backend import pipeline, validate
from backend.config.loader import find_scenarios, load_scenario

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
@click.option(
    "--only",
    multiple=True,
    metavar="CALENDAR_TYPE/TIME_WINDOW",
    help="Compute only these scenarios. Repeatable. Default: all of them.",
)
@click.option(
    "--force",
    is_flag=True,
    default=False,
    help="Discard existing output and start over.",
)
def run_cmd(scenario: Path | None, only: tuple[str, ...], force: bool):
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

    try:
        output = pipeline.run(city, analysis, only=only, force=force)
    except (pipeline.StaleOutputError, ValueError) as e:
        raise click.ClickException(str(e))

    click.secho(f"Wrote results to {output}", fg="green")


if __name__ == "__main__":
    cli()
