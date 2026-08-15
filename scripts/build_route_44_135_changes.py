"""Build the modified GTFS feed for the ECan Metro Review 44/135 proposal.

Removes Route 135 entirely and edits Route 44: drops the Ravensdale Rise
loop and the Palms-Dallington tail, extends up Marshland Rd and Prestons
Park Drive, through Route 135's old Prestons subdivision turning loop, to a
new terminus deep in that loop, and infills weekend frequency to roughly
every 30 minutes with extended evening hours.

https://haveyoursay.ecan.govt.nz/metroreview44-135
"""

import json
import math
import zipfile
from pathlib import Path

import pandas as pd

GTFS_IN = Path("data/gtfs.zip")
GTFS_OUT = Path("data/route_44_135_changes.zip")
CORRIDOR_FILE = Path(__file__).with_name("route_44_prestons_corridor.json")

DIR5 = "44_6733_5_3"  # outbound: Westmorland -> Prestons
DIR6 = "44_6733_6_3"  # inbound: Prestons -> Westmorland
ROUTE_135_OUT, ROUTE_135_IN = "135_5805_7_3", "135_5805_8_3"

# Real stops along Marshland Rd, taken from Route 135's own stop pattern,
# from just past The Palms up to (but not including) the old Hercules St /
# Te Korari St loop -- reused as-is, since it's the same physical corridor.
MARSHLAND_RD_OUT = [13306, 12258, 12243, 12477, 12465, 46840]
MARSHLAND_RD_IN = [46903, 43954, 18521, 18647, 18610, 18288]  # Hercules St stop dropped

# New stops on Prestons Park Drive (rider-supplied coordinates), plus their
# opposite-carriageway pair for the inbound direction ("move the stops to
# the other side of the road, directly east").
NEW_STOP_A_ID, NEW_STOP_B_ID = 55890, 55891
NEW_STOP_A_EAST_ID, NEW_STOP_B_EAST_ID = 55892, 55893
NEW_STOP_A_COORD = (-43.484326, 172.668713)
NEW_STOP_B_COORD = (-43.477794, 172.669609)
EAST_OFFSET_LON = 0.0001  # ~8m at this latitude, opposite carriageway

# Route 135's old Prestons subdivision turning loop, off Te Korari St. Every
# 135 trip traversed it in this same order regardless of direction (it's a
# fixed physical turning loop, not a mirrored pair), so both directions of
# the new Route 44 reuse it identically: dir5 goes as far as the 54475/54481
# pair (the loop's cul-de-sac end) and terminates there; dir6 starts at the
# opposite side of that same pair and continues around the rest of the loop.
LOOP_STOPS = [54410, 54447, 54475, 54481, 54434, 54423]
TERMINUS_STOP_ID = 54475  # dir5's new terminus, deep in the loop

# Outbound stop sequence for the new segment, continuing after
# MARSHLAND_RD_OUT: two new Prestons Park Drive stops, then up to the
# terminus at the loop's cul-de-sac end.
NEW_SEGMENT_OUT = [NEW_STOP_A_ID, NEW_STOP_B_ID, *LOOP_STOPS[:3]]
# Inbound mirror: pick up the loop from its other side, finish it, then the
# same two Prestons Park Drive stops on the opposite side of the road,
# before re-joining MARSHLAND_RD_IN.
NEW_SEGMENT_IN = [*LOOP_STOPS[3:], NEW_STOP_B_EAST_ID, NEW_STOP_A_EAST_ID]

# Average speed (m/s) for the brand-new stretch with no donor schedule,
# calibrated from Route 135's own recorded pace over the equivalent
# Marshland Rd -> Prestons Rd -> Marshland School stretch it used to run
# (2408m in 296s = 29.3 km/h).
SYNTHETIC_SPEED_MPS = 2408 / 296

RAVENSDALE_LOOP = [53694, 54176, 54182]  # dir5 stops 2-4, removed
# dir5 stops 59-63, removed: "The Palms (New Brighton Rd)" (39527) is dropped
# from Route 44 entirely, plus the old Palms->Dallington tail.
DALLINGTON_TAIL = [39527, 39251, 36794, 36804, 51404]
DALLINGTON_HEAD = [51404, 37778, 37876, 39279, 39618]  # dir6 stops 1-5, removed
PALMS_OUTBOUND_ANCHOR = 39515  # dir5 stop 58: "Shirley Rd near Quinns Rd"
PALMS_INBOUND_ANCHOR = 43908  # dir6 stop 6: "The Palms (Shirley Rd)"


def load_gtfs(path: Path) -> dict[str, pd.DataFrame]:
    with zipfile.ZipFile(path) as archive:
        return {
            name.removesuffix(".txt"): pd.read_csv(archive.open(name))
            for name in archive.namelist()
        }


def write_gtfs(tables: dict[str, pd.DataFrame], path: Path) -> None:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, df in tables.items():
            archive.writestr(f"{name}.txt", df.to_csv(index=False))


def to_seconds(series: pd.Series) -> pd.Series:
    """Parse `HH:MM:SS` GTFS times (hour may exceed 23) into seconds."""
    parts = series.str.split(":", expand=True).astype(int)
    return parts[0] * 3600 + parts[1] * 60 + parts[2]


def to_gtfs_time(seconds: pd.Series) -> pd.Series:
    seconds = seconds.astype(int)
    h, rem = seconds // 3600, seconds % 3600
    m, s = rem // 60, rem % 60
    return (
        h.astype(str).str.zfill(2)
        + ":"
        + m.astype(str).str.zfill(2)
        + ":"
        + s.astype(str).str.zfill(2)
    )


def remove_route_135(tables: dict[str, pd.DataFrame]) -> None:
    trips, routes = tables["trips"], tables["routes"]
    dead_trip_ids = trips.loc[
        trips.route_id.isin([ROUTE_135_OUT, ROUTE_135_IN]), "trip_id"
    ]
    dead_shape_ids = trips.loc[
        trips.route_id.isin([ROUTE_135_OUT, ROUTE_135_IN]), "shape_id"
    ].unique()

    tables["routes"] = routes[~routes.route_id.isin([ROUTE_135_OUT, ROUTE_135_IN])]
    tables["trips"] = trips[~trips.trip_id.isin(dead_trip_ids)]
    tables["stop_times"] = tables["stop_times"][
        ~tables["stop_times"].trip_id.isin(dead_trip_ids)
    ]
    tables["shapes"] = tables["shapes"][~tables["shapes"].shape_id.isin(dead_shape_ids)]


def build_delta_template(
    original_135: dict[str, pd.DataFrame],
    route_id: str,
    stop_ids: list[int],
    anchor_stop_id: int,
) -> dict[int, int]:
    """Seconds offset of each stop in `stop_ids` from `anchor_stop_id`'s time.

    Both come from one representative Route 135 trip on that route_id, so the
    deltas reflect real recorded running times along the shared corridor.
    """
    trips, stop_times = original_135["trips"], original_135["stop_times"]
    template_trip_id = trips.loc[trips.route_id == route_id, "trip_id"].iloc[0]
    st = stop_times[stop_times.trip_id == template_trip_id].sort_values("stop_sequence")
    st = st.set_index("stop_id")
    times = to_seconds(st["arrival_time"])
    anchor_time = times[anchor_stop_id]
    return {stop_id: int(times[stop_id] - anchor_time) for stop_id in stop_ids}


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = a
    lat2, lon2 = b
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dlmb = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    x = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(x))


def add_new_stops(tables: dict[str, pd.DataFrame]) -> None:
    """Add the rider-supplied Prestons Park Drive stops (and their east-side
    opposite-carriageway pair for the inbound direction) to stops.txt."""
    new_rows = pd.DataFrame(
        [
            (NEW_STOP_A_ID, "Prestons Park Drive near Mairehau Rd", *NEW_STOP_A_COORD),
            (NEW_STOP_B_ID, "Prestons Park Drive near Prestons Rd", *NEW_STOP_B_COORD),
            (
                NEW_STOP_A_EAST_ID,
                "Prestons Park Drive near Mairehau Rd",
                NEW_STOP_A_COORD[0],
                NEW_STOP_A_COORD[1] + EAST_OFFSET_LON,
            ),
            (
                NEW_STOP_B_EAST_ID,
                "Prestons Park Drive near Prestons Rd",
                NEW_STOP_B_COORD[0],
                NEW_STOP_B_COORD[1] + EAST_OFFSET_LON,
            ),
        ],
        columns=["stop_id", "stop_name", "stop_lat", "stop_lon"],
    )
    new_rows["stop_code"] = new_rows["stop_id"]
    new_rows["location_type"] = 0
    new_rows["wheelchair_boarding"] = 1
    tables["stops"] = pd.concat([tables["stops"], new_rows], ignore_index=True)


def synthetic_travel_times(ordered_coords: list[tuple[float, float]]) -> list[float]:
    """Seconds to travel between each consecutive pair of coordinates.

    Used only where no donor schedule exists (the brand-new Prestons Park
    Drive stops), at `SYNTHETIC_SPEED_MPS`.
    """
    return [
        haversine_m(a, b) / SYNTHETIC_SPEED_MPS
        for a, b in zip(ordered_coords, ordered_coords[1:])
    ]


def extend_deltas_forward(
    deltas: dict, stops_by_id: pd.DataFrame, from_stop_id: int, tail_stop_ids: list[int]
) -> None:
    """Extend `deltas` (in place) forward in time past `from_stop_id`."""
    coords = [
        tuple(stops_by_id.loc[s, ["stop_lat", "stop_lon"]])
        for s in [from_stop_id, *tail_stop_ids]
    ]
    cumulative = deltas[from_stop_id]
    for stop_id, dt in zip(tail_stop_ids, synthetic_travel_times(coords)):
        cumulative += dt
        deltas[stop_id] = int(cumulative)


def extend_deltas_backward(
    deltas: dict, stops_by_id: pd.DataFrame, to_stop_id: int, head_stop_ids: list[int]
) -> None:
    """Extend `deltas` (in place) backward in time before `to_stop_id`."""
    coords = [
        tuple(stops_by_id.loc[s, ["stop_lat", "stop_lon"]])
        for s in [*head_stop_ids, to_stop_id]
    ]
    travel = synthetic_travel_times(coords)
    cumulative = deltas[to_stop_id]
    for stop_id, dt in zip(reversed(head_stop_ids), reversed(travel)):
        cumulative -= dt
        deltas[stop_id] = int(cumulative)


def edit_route_44_stop_times(
    tables: dict[str, pd.DataFrame], deltas_out: dict, deltas_in: dict
) -> None:
    trips, stop_times, stops = tables["trips"], tables["stop_times"], tables["stops"]
    stop_name = stops.set_index("stop_id")["stop_name"]

    loop_stops_out = MARSHLAND_RD_OUT + NEW_SEGMENT_OUT
    loop_stops_in = NEW_SEGMENT_IN + MARSHLAND_RD_IN

    for (
        route_id,
        removed_head,
        removed_tail,
        anchor_id,
        loop_stops,
        deltas,
        prepend,
    ) in (
        (
            DIR5,
            RAVENSDALE_LOOP,
            DALLINGTON_TAIL,
            PALMS_OUTBOUND_ANCHOR,
            loop_stops_out,
            deltas_out,
            False,
        ),
        (
            DIR6,
            DALLINGTON_HEAD,
            [],
            PALMS_INBOUND_ANCHOR,
            loop_stops_in,
            deltas_in,
            True,
        ),
    ):
        trip_ids = trips.loc[trips.route_id == route_id, "trip_id"]
        edited_frames = []
        for trip_id in trip_ids:
            st = (
                stop_times[stop_times.trip_id == trip_id]
                .sort_values("stop_sequence")
                .copy()
            )
            st = st[~st.stop_id.isin(removed_head) & ~st.stop_id.isin(removed_tail)]

            if prepend:
                anchor_arrival = to_seconds(
                    st.loc[st.stop_id == anchor_id, "arrival_time"]
                ).iloc[0]
                new_rows = pd.DataFrame(
                    {
                        "trip_id": trip_id,
                        "stop_id": loop_stops,
                        "arrival_time": [
                            anchor_arrival + deltas[s] for s in loop_stops
                        ],
                        "stop_headsign": pd.NA,
                        "pickup_type": 0,
                        "drop_off_type": 0,
                        "shape_dist_traveled": pd.NA,
                        "timepoint": 1,
                    }
                )
                new_rows["arrival_time"] = to_gtfs_time(new_rows["arrival_time"])
                new_rows["departure_time"] = new_rows["arrival_time"]
                st = pd.concat([new_rows, st], ignore_index=True)
            else:
                anchor_departure = to_seconds(
                    st.loc[st.stop_id == anchor_id, "departure_time"]
                ).iloc[0]
                new_rows = pd.DataFrame(
                    {
                        "trip_id": trip_id,
                        "stop_id": loop_stops,
                        "arrival_time": [
                            anchor_departure + deltas[s] for s in loop_stops
                        ],
                        "stop_headsign": pd.NA,
                        "pickup_type": 0,
                        "drop_off_type": 0,
                        "shape_dist_traveled": pd.NA,
                        "timepoint": 1,
                    }
                )
                new_rows["arrival_time"] = to_gtfs_time(new_rows["arrival_time"])
                new_rows["departure_time"] = new_rows["arrival_time"]
                st = pd.concat([st, new_rows], ignore_index=True)

            st["stop_sequence"] = range(1, len(st) + 1)
            edited_frames.append(st)

        tables["stop_times"] = pd.concat(
            [
                tables["stop_times"][~tables["stop_times"].trip_id.isin(trip_ids)],
                *edited_frames,
            ],
            ignore_index=True,
        )

    # Terminus headsigns follow the new route ends.
    terminus_name = stop_name[TERMINUS_STOP_ID]
    trips.loc[trips.route_id == DIR5, "trip_headsign"] = terminus_name
    trips.loc[trips.route_id == DIR6, "trip_headsign"] = "Westmorland"
    tables["routes"].loc[
        tables["routes"].route_id.isin([DIR5, DIR6]), "route_long_name"
    ] = "Prestons/Westmorland"
    # Extending each trip by ~14 min at one end breaks the original vehicle
    # blocking (dir5/dir6 no longer meet where/when the old blocks assumed).
    # Re-blocking vehicles is an operational concern outside this analysis's
    # scope, so trips are left unblocked rather than guessing a new roster.
    trips.loc[trips.route_id.isin([DIR5, DIR6]), "block_id"] = pd.NA


def nearest_shape_index(shape_df: pd.DataFrame, lat: float, lon: float) -> int:
    dist_sq = (shape_df.shape_pt_lat - lat) ** 2 + (shape_df.shape_pt_lon - lon) ** 2
    return int(dist_sq.values.argmin())


def edit_route_44_shapes(
    tables: dict[str, pd.DataFrame], original_135: dict[str, pd.DataFrame]
) -> None:
    trips, shapes, stops = tables["trips"], tables["shapes"], tables["stops"]
    stops_by_id = stops.set_index("stop_id")

    shape_id_5 = trips.loc[trips.route_id == DIR5, "shape_id"].iloc[0]
    shape_id_6 = trips.loc[trips.route_id == DIR6, "shape_id"].iloc[0]
    shape_5 = (
        shapes[shapes.shape_id == shape_id_5]
        .sort_values("shape_pt_sequence")
        .reset_index(drop=True)
    )
    shape_6 = (
        shapes[shapes.shape_id == shape_id_6]
        .sort_values("shape_pt_sequence")
        .reset_index(drop=True)
    )

    # dir5: drop the Ravensdale Rise deviation, reusing dir6's own
    # Sedgwick Way <-> Penruddock Rise geometry (reversed) as the direct
    # connector, since it's the same real street pair.
    penruddock_pt = stops_by_id.loc[54195]  # "Penruddock Rise near Francis Mill Grove"
    origin_pt = stops_by_id.loc[33485]  # "Sedgwick Way near Woodside Common"
    connector_start = nearest_shape_index(
        shape_6, origin_pt.stop_lat, origin_pt.stop_lon
    )
    connector_end = nearest_shape_index(
        shape_6, penruddock_pt.stop_lat, penruddock_pt.stop_lon
    )
    connector = shape_6.iloc[connector_end : connector_start + 1][::-1][
        ["shape_pt_lat", "shape_pt_lon"]
    ]

    ravensdale_end = nearest_shape_index(
        shape_5, penruddock_pt.stop_lat, penruddock_pt.stop_lon
    )
    shape_5 = pd.concat(
        [
            shape_5.iloc[:1][["shape_pt_lat", "shape_pt_lon"]],
            connector,
            shape_5.iloc[ravensdale_end:][["shape_pt_lat", "shape_pt_lon"]],
        ],
        ignore_index=True,
    )

    # dir5 tail: drop Palms->Dallington, reuse Route 135's own Marshland Rd
    # geometry up to the new Prestons Park Drive turn-off, then follow the
    # real road corridor (Mairehau Rd -> Prestons Park Drive -> Prestons Rd
    # -> Te Korari St, from OSM) to the new Marshland School terminus.
    palms_pt = stops_by_id.loc[PALMS_OUTBOUND_ANCHOR]
    marshland_pt_out = stops_by_id.loc[46840]
    palms_cut = nearest_shape_index(shape_5, palms_pt.stop_lat, palms_pt.stop_lon)
    shape_135_out = original_135["shapes"]
    shape_135_out_id = (
        original_135["trips"]
        .loc[original_135["trips"].route_id == ROUTE_135_OUT, "shape_id"]
        .iloc[0]
    )
    shape_135_out = (
        shape_135_out[shape_135_out.shape_id == shape_135_out_id]
        .sort_values("shape_pt_sequence")
        .reset_index(drop=True)
    )
    marshland_start = nearest_shape_index(
        shape_135_out, palms_pt.stop_lat, palms_pt.stop_lon
    )
    marshland_end = nearest_shape_index(
        shape_135_out, marshland_pt_out.stop_lat, marshland_pt_out.stop_lon
    )
    marshland_geom_out = shape_135_out.iloc[marshland_start : marshland_end + 1][
        ["shape_pt_lat", "shape_pt_lon"]
    ]

    corridor = pd.DataFrame(
        json.loads(CORRIDOR_FILE.read_text()), columns=["shape_pt_lat", "shape_pt_lon"]
    )  # 46840 -> Mairehau Rd -> Prestons Park Drive -> Prestons Rd -> Te Korari St -> 54410

    # The Prestons subdivision turning loop itself: reuse Route 135's real
    # recorded geometry (both its directions traversed this same fixed loop
    # in the same order). dir5 covers the loop's first half, up to the
    # cul-de-sac end; dir6 picks up the second half from the other side.
    loop_out_start = nearest_shape_index(
        shape_135_out, *stops_by_id.loc[LOOP_STOPS[0], ["stop_lat", "stop_lon"]]
    )
    loop_out_end = nearest_shape_index(
        shape_135_out, *stops_by_id.loc[TERMINUS_STOP_ID, ["stop_lat", "stop_lon"]]
    )
    loop_geom_out = shape_135_out.iloc[loop_out_start : loop_out_end + 1][
        ["shape_pt_lat", "shape_pt_lon"]
    ]
    loop_in_start = nearest_shape_index(
        shape_135_out, *stops_by_id.loc[LOOP_STOPS[3], ["stop_lat", "stop_lon"]]
    )
    loop_in_end = nearest_shape_index(
        shape_135_out, *stops_by_id.loc[LOOP_STOPS[5], ["stop_lat", "stop_lon"]]
    )
    loop_geom_in = shape_135_out.iloc[loop_in_start : loop_in_end + 1][
        ["shape_pt_lat", "shape_pt_lon"]
    ]

    shape_5 = pd.concat(
        [
            shape_5.iloc[: palms_cut + 1],
            marshland_geom_out,
            corridor.iloc[1:],
            loop_geom_out.iloc[1:],
        ],
        ignore_index=True,
    )
    shape_5["shape_id"] = shape_id_5
    shape_5["shape_pt_sequence"] = range(1, len(shape_5) + 1)
    shape_5["shape_dist_traveled"] = pd.NA

    # dir6: drop Dallington->Palms head, prepend the loop's second half, the
    # same corridor reversed, then Route 135's own Marshland Rd geometry
    # back down to The Palms.
    marshland_pt_in = stops_by_id.loc[46903]
    shape_135_in = original_135["shapes"]
    shape_135_in_id = (
        original_135["trips"]
        .loc[original_135["trips"].route_id == ROUTE_135_IN, "shape_id"]
        .iloc[0]
    )
    shape_135_in = (
        shape_135_in[shape_135_in.shape_id == shape_135_in_id]
        .sort_values("shape_pt_sequence")
        .reset_index(drop=True)
    )
    palms6_pt = stops_by_id.loc[PALMS_INBOUND_ANCHOR]
    marshland_start_in = nearest_shape_index(
        shape_135_in, marshland_pt_in.stop_lat, marshland_pt_in.stop_lon
    )
    marshland_end_in = nearest_shape_index(
        shape_135_in, palms6_pt.stop_lat, palms6_pt.stop_lon
    )
    marshland_geom_in = shape_135_in.iloc[marshland_start_in : marshland_end_in + 1][
        ["shape_pt_lat", "shape_pt_lon"]
    ]

    dallington_cut = nearest_shape_index(
        shape_6, palms6_pt.stop_lat, palms6_pt.stop_lon
    )
    shape_6 = pd.concat(
        [
            loop_geom_in,
            corridor.iloc[::-1].reset_index(drop=True),
            marshland_geom_in.iloc[1:],
            shape_6.iloc[dallington_cut:][["shape_pt_lat", "shape_pt_lon"]],
        ],
        ignore_index=True,
    )
    shape_6["shape_id"] = shape_id_6
    shape_6["shape_pt_sequence"] = range(1, len(shape_6) + 1)
    shape_6["shape_dist_traveled"] = pd.NA

    tables["shapes"] = pd.concat(
        [
            tables["shapes"][~tables["shapes"].shape_id.isin([shape_id_5, shape_id_6])],
            shape_5,
            shape_6,
        ],
        ignore_index=True,
    )


def infill_and_extend_frequency(tables: dict[str, pd.DataFrame]) -> None:
    """Roughly double weekend frequency and push the last trip later.

    For each weekend service (Saturday=2, Sunday=3) and direction, a new
    trip is inserted at the midpoint of every existing headway gap, then
    the same tail-end cadence continues until the terminus can still be
    reached by 11pm Saturday / 10pm Sunday.
    """
    trips, stop_times = tables["trips"], tables["stop_times"]
    close_time = {2: 23 * 3600, 3: 22 * 3600}
    next_trip_id = int(trips.trip_id.max()) + 1
    new_trips, new_stop_times = [], []

    for route_id in (DIR5, DIR6):
        for service_id in (2, 3):
            route_trips = trips[
                (trips.route_id == route_id) & (trips.service_id == service_id)
            ]
            if route_trips.empty:
                continue
            template_trip_id = route_trips.trip_id.iloc[0]
            template = stop_times[stop_times.trip_id == template_trip_id].sort_values(
                "stop_sequence"
            )

            starts = sorted(
                to_seconds(
                    stop_times[stop_times.trip_id.isin(route_trips.trip_id)]
                    .sort_values("stop_sequence")
                    .groupby("trip_id")
                    .first()["departure_time"]
                )
            )

            new_starts = [int((a + b) / 2) for a, b in zip(starts, starts[1:])]
            new_headway = (starts[-1] - starts[-2]) / 2
            next_start = starts[-1] + new_headway
            while next_start <= close_time[service_id]:
                new_starts.append(int(next_start))
                next_start += new_headway

            for start in new_starts:
                offset = start - int(to_seconds(template.departure_time).iloc[0])
                clone = template.copy()
                clone["trip_id"] = next_trip_id
                clone["arrival_time"] = to_gtfs_time(
                    to_seconds(clone.arrival_time) + offset
                )
                clone["departure_time"] = to_gtfs_time(
                    to_seconds(clone.departure_time) + offset
                )
                new_stop_times.append(clone)

                trip_row = (
                    route_trips[route_trips.trip_id == template_trip_id].iloc[0].copy()
                )
                trip_row["trip_id"] = next_trip_id
                trip_row["block_id"] = pd.NA
                new_trips.append(trip_row)
                next_trip_id += 1

    tables["trips"] = pd.concat([trips, pd.DataFrame(new_trips)], ignore_index=True)
    tables["stop_times"] = pd.concat([stop_times, *new_stop_times], ignore_index=True)


def main() -> None:
    tables = load_gtfs(GTFS_IN)
    original_135 = load_gtfs(GTFS_IN)  # untouched copy to source the 135 corridor from

    add_new_stops(tables)
    stops_by_id = tables["stops"].set_index("stop_id")

    # Anchors are Route 135's own stops nearest The Palms in each direction
    # (135 doesn't share Route 44's stop_ids there), so deltas measure real
    # recorded running time from "just past the Palms" to each Marshland Rd
    # stop. The brand-new Prestons Park Drive stops have no donor schedule,
    # so their times extend that real timeline using estimated travel time.
    deltas_out = build_delta_template(
        original_135, ROUTE_135_OUT, MARSHLAND_RD_OUT, 24439
    )
    extend_deltas_forward(deltas_out, stops_by_id, 46840, NEW_SEGMENT_OUT)

    deltas_in = build_delta_template(original_135, ROUTE_135_IN, MARSHLAND_RD_IN, 18288)
    extend_deltas_backward(deltas_in, stops_by_id, 46903, NEW_SEGMENT_IN)

    remove_route_135(tables)
    edit_route_44_stop_times(tables, deltas_out, deltas_in)
    edit_route_44_shapes(tables, original_135)
    infill_and_extend_frequency(tables)

    write_gtfs(tables, GTFS_OUT)
    print(f"Wrote {GTFS_OUT}")


if __name__ == "__main__":
    main()
