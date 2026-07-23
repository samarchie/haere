import json

import pytest
from pydantic import ValidationError

from backend.config.models import CityConfig
from backend.tests.config.conftest import VALID_POLYGON


def test_city_config_accepts_valid_paths_and_timezone(touch):
    osm_path = touch("city.osm.pbf")
    boundary_path = touch("boundary.geojson", json.dumps(VALID_POLYGON).encode())

    city = CityConfig(
        id="christchurch",
        name="Christchurch",
        timezone="Pacific/Auckland",
        osm_source=osm_path,
        boundary_source=boundary_path,
    )

    assert city.schema_version == 1
    assert city.hexagon_resolution == 9
    assert city.elevation_filepath is None


def test_city_config_rejects_invalid_timezone(touch):
    osm_path = touch("city.osm.pbf")
    boundary_path = touch("boundary.geojson", json.dumps(VALID_POLYGON).encode())

    with pytest.raises(ValidationError, match="not a recognised IANA timezone"):
        CityConfig(
            id="christchurch",
            name="Christchurch",
            timezone="Not/A_Timezone",
            osm_source=osm_path,
            boundary_source=boundary_path,
        )


@pytest.mark.parametrize("missing_field", ["osm_source", "boundary_source"])
def test_city_config_rejects_missing_file(touch, tmp_path, missing_field):
    kwargs = dict(
        id="christchurch",
        name="Christchurch",
        timezone="Pacific/Auckland",
        osm_source=touch("city.osm.pbf"),
        boundary_source=touch("boundary.geojson", json.dumps(VALID_POLYGON).encode()),
    )
    kwargs[missing_field] = tmp_path / "does_not_exist"

    with pytest.raises(ValidationError):
        CityConfig(**kwargs)


def test_city_config_accepts_optional_elevation_file(touch):
    osm_path = touch("city.osm.pbf")
    boundary_path = touch("boundary.geojson", json.dumps(VALID_POLYGON).encode())
    elevation_path = touch("elevation.tif")

    city = CityConfig(
        id="christchurch",
        name="Christchurch",
        timezone="Pacific/Auckland",
        osm_source=osm_path,
        boundary_source=boundary_path,
        elevation_filepath=elevation_path,
    )

    assert city.elevation_filepath == elevation_path
