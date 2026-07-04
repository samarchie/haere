"""
Centralised logging configuration.

Import `get_logger` in any module to get a pre-configured logger::

    import log
    logger = log.get_logger(__name__)
"""

import logging

import constants


def setup_logging() -> None:
    """Configure the root logger with a console handler and optional file handlers.

    Idempotent: subsequent calls are no-ops so modules can call this safely
    without duplicating handlers.

    Args:
        filepaths: Paths to log files to write to in addition to stdout.
    """

    if hasattr(setup_logging, "is_setup"):
        return

    logging.basicConfig(
        level=constants.LOGGING_LEVEL,
        handlers=[logging.StreamHandler()],
        format="%(asctime)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S %Z",
    )

    setattr(setup_logging, "is_setup", True)


def get_logger(name: str) -> logging.Logger:
    """Return a named logger.

    Intended to be called at module level::

        logger = log.get_logger(__name__)
    """
    setup_logging()
    return logging.getLogger(name)
