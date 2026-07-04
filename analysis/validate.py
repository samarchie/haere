import json
import os
import subprocess
from pathlib import Path

import click

from analysis import constants, log

logger = log.get_logger(__name__)


@click.command
@click.argument(
    "filepath", type=click.Path(exists=True, file_okay=True, dir_okay=False)
)
def validate_gtfs(filepath: str) -> bool:

    fp = Path(filepath).resolve()
    if not fp.exists():
        raise FileNotFoundError(f"No file found at {filepath}")

    commands = [
        "docker",
        "run",
        "--rm",
        "--volume",
        f"{fp.parent}:/data",
        constants.GTFS_VALIDATOR_DOCKER_IMAGE,
        "-i",
        f"/data/{fp.name}",
        "-o",
        "/data",
    ]
    subprocess.run(commands, check=True)

    report_fp = os.path.join(fp.parent, "report.json")
    with open(report_fp) as file:
        report = json.load(file)

    logger.info(f"For more inforation on the results, consult `{report_fp}`")

    for notice in report["notices"]:
        if notice["severity"] == "ERROR":
            return False

    return True


if __name__ == "__main__":
    _ = validate_gtfs()
