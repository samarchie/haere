"""Shared fixtures for backend.config tests."""

from pathlib import Path

import pytest


@pytest.fixture
def touch(tmp_path):
    """Return a factory that creates an empty placeholder file under tmp_path."""

    def _touch(name: str, content: bytes = b"placeholder") -> Path:
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    return _touch
