"""Shared fixtures for backend.config tests."""

from pathlib import Path

import pytest

VALID_POLYGON = {
    "type": "Polygon",
    "coordinates": [
        [[172.6, -43.6], [172.7, -43.6], [172.7, -43.5], [172.6, -43.5], [172.6, -43.6]]
    ],
}


@pytest.fixture
def touch(tmp_path):
    """Return a factory that creates an empty placeholder file under tmp_path."""

    def _touch(name: str, content: bytes = b"placeholder") -> Path:
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    return _touch
