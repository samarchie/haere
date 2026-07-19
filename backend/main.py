import click

import backend.validate as validate


@click.group
def cli():
    pass


@cli.command("validate")
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


if __name__ == "__main__":
    cli()
