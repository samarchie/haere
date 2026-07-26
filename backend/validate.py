"""
GTFS feed validation.

Runs a GTFS feed (local file or URL) through the MobilityData GTFS validator
via its official Docker image, and reports whether the feed passed (i.e. has
no ERROR-severity notices).

Requires Docker to be installed and running, and network access to pull
`GTFS_VALIDATOR_DOCKER_IMAGE` on first use.
"""

import json
import subprocess
from pathlib import Path

from backend import log

logger = log.get_logger(__name__)

GTFS_VALIDATOR_DOCKER_IMAGE = "ghcr.io/mobilitydata/gtfs-validator:latest"


def _report_passed(output_dir: Path) -> bool:
    """Read the validator's `report.json` and determine pass/fail.

    Args:
        output_dir: Directory the validator wrote `report.json` into.

    Returns:
        False if any notice in the report is ERROR-severity, True otherwise.

    Raises:
        FileNotFoundError: If the validator didn't write a report.json
            (e.g. it crashed before completing).
        KeyError: If report.json doesn't have the expected "notices" key
            (e.g. the validator's report schema has changed).
    """
    report_fp = output_dir / "report.json"
    with open(report_fp) as file:
        report = json.load(file)

    logger.info(f"For more information on the results, consult `{report_fp}`")

    for notice in report["notices"]:
        if notice["severity"] == "ERROR":
            return False

    return True


def _run_validator(output_dir: Path, source: str, verbose: bool = True) -> bool:
    """Run the MobilityData GTFS validator Docker image against a feed.

    Resolves how `source` is exposed to the container (bind-mounted local
    file vs. a URL fetched directly by the validator) so callers only need
    to provide the feed's original location — no container-internal path
    details leak out to them.

    Args:
        output_dir: Host directory to bind-mount into the container; the
            validator writes its report.json here, and — for a local feed —
            it's also the directory `source` must live directly inside of.
        source: The feed's original location: a URL, or a local filepath
            that resides directly inside `output_dir`.
        verbose: If True, stream the validator container's stdout/stderr to
            the console. If False, suppress it.

    Returns:
        Whether the feed passed validation (see `_report_passed`).

    Raises:
        subprocess.CalledProcessError: If the validator container itself
            fails to run (e.g. Docker isn't installed or isn't running).
    """
    if source.startswith("http"):
        # No local file to mount. The validator fetches the URL itself, so the
        # container only needs somewhere to write its report.
        mount_dir = "/output"
        input_path = source
    else:
        # Mounting output_dir at mount_dir puts the feed directly at
        # f"{mount_dir}/{filename}" inside the container — not at the
        # feed's original host path, which wouldn't exist in there.
        mount_dir = "/data"
        input_path = f"{mount_dir}/{Path(source).name}"

    logger.info(f"Starting validation of {input_path}")
    # Run the validator in a throwaway container (--rm) with the host
    # directory bind-mounted so the report.json it writes is readable
    # afterwards.
    args = [
        "docker",
        "run",
        "--rm",
        "--volume",
        f"{output_dir}:{mount_dir}",
        GTFS_VALIDATOR_DOCKER_IMAGE,
        "-i",
        input_path,
        "-o",
        mount_dir,
    ]
    subprocess.run(args, check=True, capture_output=not verbose)
    logger.info("Validation complete.")
    return _report_passed(output_dir)


def validate_gtfs(source: str, verbose: bool = True) -> bool:
    """Validate a GTFS feed (local file or URL) with the MobilityData GTFS
    validator.

    Args:
        source: A URL or local filepath pointing to the GTFS feed.
        verbose: If True, stream the validator container's stdout/stderr to
            the console. If False, suppress it.

    Raises:
        FileNotFoundError: If `source` is a local path that doesn't exist.
        subprocess.CalledProcessError: If the validator container itself
            fails to run (e.g. Docker isn't installed or isn't running).
    """
    if source.startswith("http"):
        # The validator can fetch the URL itself; it only needs a directory
        # to write its report.json into, so mount the current directory.
        return _run_validator(Path.cwd(), source, verbose)

    # For a local file, mount its parent directory so the container can
    # read the feed at the same relative path it's given.
    filepath = Path(source).resolve()
    if not filepath.exists():
        raise FileNotFoundError(f"Could not find GTFS file at {source}")
    return _run_validator(filepath.parent, str(filepath), verbose)
