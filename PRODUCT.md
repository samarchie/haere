# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: no frontend code exists yet. Deploy target is fixed (Cloudflare Pages, static site, no backend API — see Operating Context), so the frontend framework choice is deferred to when that work starts, constrained to whatever renders well as a static export (e.g. static HTML/CSS, or a static-export framework like Astro/Next-static/SvelteKit-static). Record the final choice here once made.

## Users

Members of the public affected by a proposed transit network change (first case: Environment Canterbury's Routes 44/135 review) who want to know concretely how the change affects their own trips — not aggregate ridership stats. Secondary audience: NZ councils and consultation processes more broadly, as a public-facing quantitative tool they could point residents to.

## Product Purpose

haere lets a person enter their address, define where they need to get to, model a proposed transit network change, and see how their accessibility (travel time, reachability) changes in plain terms. It exists because councils have the routing/GTFS data and modelling tools but the public does not, so consultation questions like "how does removing Route 135 affect you" go unanswered in any meaningful way for individuals.

## Positioning

A general-purpose tool for turning a transit network change plus GTFS/OSM data into person-level, plain-language accessibility comparisons — not just aggregate ridership numbers. The ECan Routes 44/135 review is the first real-world use case, not the permanent scope; the tool is meant to be reusable for other NZ transit consultations. At least one further intervention analysis, in a different city, is already planned — the product must present as a multi-city, multi-analysis tool from the first release, not a single-city one-off.

## Operating Context

- Backend is a Python CLI (`haere` via `backend/main.py`), driven by per-city YAML config (see `configs/canterbury/`) pointing at local OSM `.pbf` extracts and GTFS feeds (baseline + modified).
- Routing is computed via r5py (R5 on a JVM through jpype); JDK 21+ required.
- A run produces dense binary travel-time matrices per scenario/variant plus a `manifest.json` describing how to decode them, written to `output/<city>/<analysis>/`. Format is documented in `docs/superpowers/specs/2026-07-26-travel-time-results-design.md`. Runs resume/skip completed matrices.
- Planned deploy model: no live API. The frontend is a static site (Cloudflare Pages) that reads precomputed result data (travel-time matrices/manifests) from Cloudflare R2 object storage directly. All heavy computation happens offline via the CLI; the web app is a read-only viewer over its output.
- A new custom domain will be purchased for the public site.
- Site must list and support more than one intervention analysis (e.g. different cities/study areas, each with its own hex grid, scenarios, and manifest), not assume a single hardcoded analysis.

## Capabilities and Constraints

- No live backend/API in the deployed product — the frontend must work entirely from precomputed static data fetched from R2.
- OSM `.pbf` and GTFS inputs must already exist on disk for a run; remote URL fetching of OSM sources is not yet supported.
- Output format (dense binary matrices + manifest) is fixed by the existing pipeline; the frontend must decode that format client-side or via a build-time transform, not a server.
- Frontend framework: undecided (see Stack).
- Accessibility standard (e.g. WCAG level): undecided, not yet specified.

## Evidence on Hand

- Working end-to-end pipeline for the Canterbury/ECan Routes 44/135 case: config at `configs/canterbury/analyses/remove-route-135.yaml`, output already generated at `output/canterbury/remove-route-135/` (hex grid, study area, per-scenario/variant matrices).
- No frontend mockups, copy, branding, or visual assets exist yet.

## Product Principles

1. Answer the individual's question ("does this affect me, and how") rather than presenting aggregate ridership or network-level stats.
2. Keep the deployed product computation-free: all routing/modelling runs offline via the CLI; the live site only reads and presents precomputed results.
3. Build for reuse beyond the first consultation — avoid hard-coding assumptions specific to ECan/Canterbury into the product framing, even though the first shipped instance targets it.
4. Keep hosting costs minimal (static hosting + object storage, no server) since this supports public-interest consultations, not a funded product.

## Accessibility & Inclusion

Not yet established — no standard (e.g. WCAG level) has been confirmed. Record here once decided.
