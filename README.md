# DayPlay AR — Spatial Pins for the Mission Corridor

**Meta Global AI Developer Hackathon** (Startup Track, *Build for Your World*).
DayPlay AR puts verified, real-world pins in a walkable AR corridor — Valencia St, San
Francisco — with a hard **zero-hallucination invariant**: every pin rendered in the scene
must trace back to a real DayPlay listing. The model plans and parses; it never invents
places.

## Architecture

```
                        ┌────────────────────────────┐
                        │   sim/index.html (FOV sim) │  static, no build step
                        │   placards by bearing/dist │
                        └─────────────┬──────────────┘
                                      │ /intent, /pins, /health
                        ┌─────────────▼──────────────┐
                        │   FastAPI (backend/main)   │
                        │   validator.py: pin gate   │◄── pins: eval/fixtures/corridor_real.json
                        │   (drop, never repair)     │      (DayPlay Supabase, anon REST)
                        └─────────────┬──────────────┘
                                      │ get_provider()
                        ┌─────────────▼──────────────┐
                        │  adapter.py (one protocol) │
                        └──┬─────────┬───────────┬───┘
                           │         │           │
                     ┌─────▼───┐ ┌───▼─────┐ ┌───▼────┐
                     │  meta   │ │ baseten │ │  mock  │
                     │ Muse    │ │ muse-   │ │ deter- │
                     │ Spark   │ │ spark   │ │ ministic
                     │ (BLOCKED)│ │(BLOCKED)│ │ offline│
                     └─────────┘ └─────────┘ └────────┘
```

- **sim** renders only pins that carry a `listing_id` — client-side re-check of the invariant.
- **validator** rejects anything outside SF bounds, malformed ids, or missing names. Failures are *dropped*, never repaired or guessed.
- **adapter** keeps providers swappable behind one interface; `mock` is deterministic and always works offline.

## Quickstart

```bash
git clone https://github.com/dayplayTeam/dayplay-ar-hackathon
cd dayplay-ar-hackathon
python3 -m venv .venv && . .venv/bin/activate
pip install fastapi uvicorn httpx

MODEL_PROVIDER=mock uvicorn backend.main:app --port 8000
# in a second shell (or use the built-in /sim mount):
open http://localhost:8000/sim/index.html
```

Endpoints:

| Route | What it does |
|---|---|
| `GET /health` | liveness + active provider |
| `POST /intent` | natural language → structured plan (mock parser for now) |
| `GET /pins?source=real` | 12 validator-passed pins from real DayPlay data (default) |
| `GET /pins?source=synthetic` | 8 schema-demo fixtures, dev-only |
| `/sim/*`, `/eval/*` | static mounts so the sim runs from one origin |

Rebuild the real-pin fixture any time (requires a local gitignored env file with
`SUPABASE_URL` + `SUPABASE_ANON_KEY`, publishable anon key only):

```bash
SUPABASE_ENV_FILE=/path/to/supabase.env python3 eval/build_real_fixture.py
```

## Zero-Hallucination Invariant

A pin exists **only if** a verified listing exists behind it. Concretely:

1. `listing_id` present, non-empty, and traceable to a real row in DayPlay's Supabase `entities` table (`source_tool: supabase_entities_anon`).
2. `lat`/`lng` inside SF Bay Area bounds (37.2–38.0, −123.0–−121.6) — no outlier placement.
3. `name` is the listing's own title — never model-generated, never paraphrased.
4. Anything failing validation is **dropped, not fixed**. An empty scene is acceptable; an invented one is not.

This is enforced in three places: at fixture build time (`validator.validate_pin`), at API
serve time (`/pins` only returns validator-passed pins), and client-side in the sim (refuses
any pin without `listing_id`).

## STATUS (as of 2026-10-31)

**Working**
- `mock` model provider (deterministic, offline, drives the sim end-to-end)
- Real pins: 12 validator-passed entries from DayPlay Supabase (anon REST, `entities` table, Mission-corridor bbox)
- Synthetic fixtures: 8 pins, dev-only schema demos (`FIX-SYN-*`, never in demo video)
- FOV corridor sim with bearing/distance placards

**Blocked**
| Item | Why | Unblock owner |
|---|---|---|
| DayPlay MCP (model-side tool calling) | `api.dayplay.io/mcp` returns 401 — OAuth-gated, trustedClientSecret not provisioned (re-verified 2026-10-31). Pin *sourcing* already works via anon Supabase REST, so this blocks live tool-calling, not the demo path. | DayPlay backend (provision trustedClientSecret) |
| `meta` provider | Meta Model API key cannot be created (key-creation bug in the developer portal). | Operator (Meta dev portal / hackathon support) |
| `baseten` provider | Partner credits not yet claimed; no API key available. | Operator (claim Baseten credits, generate key) |

**Note on pin sourcing:** the original plan pulled pins through DayPlay MCP. While MCP auth
is blocked, the same underlying data is reachable read-only via Supabase's publishable anon
key — so real pins ship today with zero hallucination risk. When MCP lands, `source_tool`
switches to the MCP tool name and everything else stays identical.
