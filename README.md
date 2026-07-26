**haere** (from te reo Māori: *travel, go, depart*) is a public web app for modelling proposed transit network changes and comparing accessibility outcomes against the current network.


## Why

Environment Canterbury is [currently proposing changes](https://haveyoursay.ecan.govt.nz/metroreview44-135) to Routes 44 and 135, including removing Route 135 entirely. They're asking the public how it affects them.

The problem is that most people can't answer that question in any meaningful way. They know their bus stop might disappear. They don't know whether the alternatives actually get them to work on time, or whether their suburb goes from well-served to poorly served. The council has the data and the modelling tools but the public doesn't.

`haere` is an attempt to close that gap. Enter your address, define where you need to get to, propose a change to the network, and see how your accessibility changes in plain terms

It's also a wider problem. NZ councils make decisions about routes, stop locations, and frequency without much public-facing quantitative tooling. Changes get justified by "limited funding" and aggregate ridership numbers. What's missing is a tool that answers the question from the other direction: *what does this change actually mean for the people who live here?*


## Dev setup

### Prerequisites

**[uv](https://docs.astral.sh/uv/getting-started/installation/)** for package management and Python installation.

**A JDK, version 21 or newer.** The routing engine is [r5py](https://r5py.readthedocs.io/), which runs R5 on a JVM via jpype. Anything older than 21 will not start.

```bash
sudo apt update
sudo apt install openjdk-21-jdk
```

### Install

```bash
uv sync                                 # create .venv and install deps
pre-commit install                      # ruff lint and format on commit
uv tool install --force --editable .    # put the `haere` CLI on your PATH
```

### Data

`osm_source` in a city's `city.yaml` must point at a local `.pbf` file that
already exists — remote URLs are not supported yet. Download the extract for
your region and put it where the config points, for example:

```bash
mkdir -p data
curl -L -o data/chch.osm.pbf \
  https://download.geofabrik.de/australia-oceania/new-zealand-latest.osm.pbf
```

GTFS feeds referenced by `baseline_gtfs_filepath` and `modified_gtfs_filepath`
must likewise already be on disk.

### Usage

```bash
haere run configs/canterbury/analyses/remove-route-135.yaml
haere run                    # pick a scenario interactively
haere validate-gtfs data/gtfs.zip
uv run pytest                # tests, parallel with coverage
```


## License

MIT — see [LICENSE](LICENSE).
