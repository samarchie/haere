"""Shared fixtures for the backend tests."""

import os
import tempfile

import pytest

# Must run at import time, before any test or fixture can trigger r5py's
# Config().CACHE_DIR: a process-wide singleton whose CACHE_DIR is a
# functools.cached_property, resolved from os.environ exactly once per
# process and never re-evaluated. A per-test monkeypatch is too late if
# anything reads it first — the JVM can only start once per process, so
# every JVM test shares this one process. Setting the real env var here,
# before pytest even begins collecting, is the only point guaranteed to
# run first, and keeps the whole session off the developer's real
# ~/.cache/r5py.
os.environ["XDG_CACHE_HOME"] = tempfile.mkdtemp(prefix="r5py-test-cache-")


def pytest_collection_modifyitems(config, items):
    """Skip the `jvm` tier unless explicitly requested.

    Filtering with `-m` on the real command line is unsafe in this repo:
    r5py's own argument parser also claims `-m` (for `--max-memory`) and reads
    the process's actual `sys.argv` at import time, so `pytest -m jvm` crashes
    before test selection ever happens, regardless of the marker expression's
    value. Gating on an environment variable instead means `-m` never has to
    appear on a real command line.
    """
    if os.environ.get("RUN_JVM_TESTS") == "1":
        return

    skip_jvm = pytest.mark.skip(
        reason="JVM tier skipped by default; set RUN_JVM_TESTS=1 to run"
    )
    for item in items:
        if "jvm" in item.keywords:
            item.add_marker(skip_jvm)


@pytest.fixture
def isolated_r5py_cache():
    """Reset routing's in-process network cache around a JVM test.

    Disk-cache isolation from the developer's real ~/.cache/r5py is handled
    once, at module import time, above — a per-test env var override would be
    too late, since Config().CACHE_DIR only ever reads it once per process.
    This fixture instead clears `transport_network`'s `lru_cache`, which is
    unrelated to that disk cache: it's an in-process memo keyed on its
    argument triple, and would otherwise hand one test a network object built
    for a different test's inputs.
    """
    from backend import routing

    routing.transport_network.cache_clear()
    yield
    routing.transport_network.cache_clear()
