**haere** (from te reo Māori: *travel, go, depart*) models proposed transit network changes and shows how they affect accessibility, in plain terms, for a given address.

It's a personal portfolio project: a working end-to-end pipeline plus a public-facing web app, built to demonstrate transit modelling and full-stack delivery, not a production tool for councils.


## Why

Environment Canterbury is [currently proposing changes](https://haveyoursay.ecan.govt.nz/metroreview44-135) to Routes 44 and 135, including removing Route 135 entirely. They're asking the public how it affects them.

Most people can't answer that question in any real way. They know their bus stop might disappear. They don't know if the alternatives get them to work on time, or whether their suburb goes from well-served to poorly served. Councils have the data and the modelling tools. The public doesn't.

`haere` closes that gap. Enter an address, pick where you need to get to, propose a network change, and see how your accessibility shifts.

It's a wider problem too. NZ councils decide on routes, stops, and frequency without much public-facing quantitative tooling. Changes get justified with "limited funding" and aggregate ridership numbers. What's missing is a tool that answers the question from the other direction: what does this change mean for the people who live here?


## How it works

Two halves, split cleanly:

- **Backend**: a Python CLI that runs offline. It takes a city's OSM extract and GTFS feeds (baseline and modified), computes travel-time matrices with a real routing engine, and writes the results to disk.
- **Frontend**: a static React site with no server and no live API. It reads the backend's precomputed output and lets someone explore it interactively, city and address.

All the routing computation happens ahead of time via the CLI. The deployed site only reads results.


## Backend

Python, driven by per-city YAML config (see `configs/canterbury/`). Routing runs on [r5py](https://r5py.readthedocs.io/) (R5 on a JVM via jpype), which needs a real JDK.

### Prerequisites

**[uv](https://docs.astral.sh/uv/getting-started/installation/)** for package management and Python installation.

**A JDK, version 21 or newer.**

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

`osm_source` in a city's `city.yaml` must point at a local `.pbf` file that already exists; remote URLs aren't supported yet. Download the extract for your region and put it where the config points, for example:

```bash
mkdir -p data
curl -L -o data/chch.osm.pbf \
  https://download.geofabrik.de/australia-oceania/new-zealand-latest.osm.pbf
```

GTFS feeds referenced by `baseline_gtfs_filepath` and `modified_gtfs_filepath` must also already be on disk.

### Usage

```bash
haere run configs/canterbury/analyses/remove-route-135.yaml
haere run --only weekday/am_peak     # just one scenario
haere run --force                    # discard existing output and start over
haere run                            # pick a scenario interactively
haere validate-gtfs data/gtfs.zip
uv run pytest                        # fast tests, with coverage
RUN_JVM_TESTS=1 uv run pytest backend/tests/test_jvm.py --no-cov
                                      # slow tests against a real routing engine
```

Results land in `output/<city>/<analysis>/` as dense binary travel-time matrices plus a `manifest.json` describing how to decode them. Runs resume: a matrix already on disk at the right size gets skipped.

The JVM tier starts a real R5 routing engine against r5py's bundled Helsinki sample data. It's skipped by default (`RUN_JVM_TESTS` unset). Filtering it with pytest's `-m` flag on a real command line isn't safe in this repo, since r5py's own argument parser also claims `-m` (for `--max-memory`) and reads the process's actual command line at import time. So the tier is gated by an environment variable and selected by path instead.


## Frontend

React + TypeScript, built with Vite, deployed as a static site on Cloudflare Pages (Workers assets). No backend API in production: it fetches precomputed travel-time data straight from object storage.

### Prerequisites

Node 22+.

### Install and run

```bash
cd frontend
npm install
npm run dev         # local dev server
npm run build        # production build + prerender
npm run test         # vitest
npm run typecheck    # tsc --noEmit
npm run lint          # biome check
```

By default the app reads data from `/data` locally. In production, `VITE_DATA_BASE_URL` is set as a Cloudflare Pages build environment variable to point at the hosted result data, so no `.env` file is needed for local dev.


## License

MIT — see [LICENSE](LICENSE).
