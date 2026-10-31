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
                                      │ /intent, /pipeline, /ask, /pins
                        ┌─────────────▼──────────────┐
                        │   FastAPI (backend/main)   │
                        │   + pipeline.py (Task 2):  │
                        │     intent → constrained   │
                        │     DayPlay tool plan →    │
                        │     zero-hallucination pin │
                        │     gate (drop, record)    │
                    ┌───▼────────────────────────┐
                    │ validator.py: pin gate     │◄── pins: eval/fixtures/corridor_real.json
                    │ (drop, never repair)       │      (DayPlay Supabase, anon REST)
                    └─────────────┬──────────────┘
                                  │ get_provider()
                        ┌─────────▼───────────────┐
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
| `GET /health` | liveness + active provider + provider mode |
| `POST /intent` | natural language → typed filters (mock parser for now; Muse-ready contract) |
| `POST /pipeline` | **Task 2 end-to-end**: intent → constrained DayPlay tool plan → pins → zero-hallucination gate (drops recorded) |
| `POST /ask` | `/pipeline` + optional grounding layer + sim-ready placards |
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

## Spatial Pinning Pipeline (Task 2, 2026-10-31)

```
text ──► llm_intent()          typed filters {time_window, radius_min,
               │                neighborhood, category, vibe}  [adapter: mock now,
               │                                              Muse Spark when key lands]
               ▼
       plan_tools_from_filters()  CONSTRAINED plan: only catalog tools
               │                  (live_now / happening_today / nearby /
               │                   saved_places / build_itinerary). The model
               ▼                  selects; it never invents venues or IDs.
       execute_tool_call()        fixture path TODAY (validator-passed
               │                  corridor_real.json; identical row shape).
               │                  ┌─ SWAP-IN: live DayPlay MCP calls when the
               ▼                  │  401 auth gate is provisioned.
       resolve_pins()  ◄────────── ZERO-HALLUCINATION GATE (in code, every run):
               │                  every emitted pin.listing_id MUST exist in the
               ▼                  verified ground-truth set, else the pin is
       /pipeline, /ask            DROPPED and the drop recorded. Never repaired.
```

- **Freshness tiers** (deterministic, per run): `live` (starts within ±6 h of now) ·
  `scheduled` (future start ≤24 h) · `standing` (saved venue, stale/absent schedule —
  availability, never claimed "live now") · `stale` (dropped for near-term windows).
- **Constrained arguments**: model-supplied tool args are clamped to JSON-schema ranges;
  unknown keys are dropped (`coerce_args`). Free-form tool generation is impossible.
- **Muse-ready transport**: `meta`/`baseten` providers implement the same
  `parse_intent` / `run_tools` protocol with a native tool loop (model tool_call →
  DayPlay executor → tool result → loop). The HTTP hop is injectable, so tests run
  fully stubbed — zero network until an operator sets a real key. Same DayPlay tool
  schemas flow to Muse Spark; flipping `MODEL_PROVIDER=meta` needs no pipeline changes.
- **Grounding scaffold (BONUS, gated)**: `grounding.ground_image(image, pins)` with a
  deterministic mock backend (confidence stamped 0.0) and a `sam` backend that raises
  `NotImplementedError` until keys land. Parses SAM-3.1 `<|box;x1,y1,x2,y2|>` tokens.

### Mini-eval (20 prompts, pipeline vs text-only baseline)

Run: `python eval/mini_eval.py` → `eval/results/mini_eval_results.json` + `mini_eval_table.md`.
Mock-provider baseline (deterministic both sides; **not** a real Muse/MCP run):

| side | result |
|---|---|
| DayPlay pipeline | 20/20 prompts emit only verified listing IDs · 0 hallucinated pins · zero-hallucination assert 20/20 PASS |
| text-only baseline | 24 fabricated listing IDs · 20/20 prompts fully fabricated · 24 unverifiable venue names |

Rerun required on Muse once a Meta/Baseten key lands (same harness, `MODEL_PROVIDER=meta`).

## STATUS (as of 2026-10-31)

**Working**
- `mock` model provider (deterministic, offline, drives the sim end-to-end)
- Real pins: 12 validator-passed entries from DayPlay Supabase (anon REST, `entities` table, Mission-corridor bbox)
- Synthetic fixtures: 8 pins, dev-only schema demos (`FIX-SYN-*`, never in demo video)
- FOV corridor sim with bearing/distance placards
- **Task 2 pipeline**: intent → constrained DayPlay tool plan → zero-hallucination pin gate (`/pipeline`, `/ask`); 21 unit tests green; mini-eval 20/20 with 0 hallucinated pins vs baseline's 24 fabricated IDs (mock provider, see eval/results/)
- Muse-ready transport behind the adapter (meta/baseten `run_tools` with native tool loop, stub-tested; no network until keys land)
- Grounding scaffold, gated (mock backend + SAM-3.1 token parser; `sam` backend raises until keys land)

**Blocked**
| Item | Why | Unblock owner |
|---|---|---|
| DayPlay MCP (model-side tool calling) | `api.dayplay.io/mcp` returns 401 — OAuth-gated, trustedClientSecret not provisioned (re-verified 2026-10-31). Pin *sourcing* already works via anon Supabase REST, so this blocks live tool-calling, not the demo path. | DayPlay backend (provision trustedClientSecret) |
| `meta` provider | Meta Model API key cannot be created (key-creation bug in the developer portal). | Operator (Meta dev portal / hackathon support) |
| `baseten` provider | Partner credits not yet claimed; no API key available. | Operator (claim Baseten credits, generate key) |
| Grounding (sam-3.1 / muse-image) | Depends on the Meta key (BONUS layer; scaffold + token parser shipped, real grounding blocked). | Operator (Meta dev portal) |

**Note on pin sourcing:** the original plan pulled pins through DayPlay MCP. While MCP auth
is blocked, the same underlying data is reachable read-only via Supabase's publishable anon
key — so real pins ship today with zero hallucination risk. When MCP lands, `source_tool`
switches to the MCP tool name and everything else stays identical.
