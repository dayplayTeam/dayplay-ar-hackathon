# Web Deployment & Human-Review Readiness Dossier

**Date:** 2026-11-02  
**Repository:** `dayplayTeam/dayplay-ar-hackathon` (HEAD `212f260`)  
**Target:** Meta Global AI Developer Hackathon (Startup Track: *Build for Your World*)  
**Target Experience:** Live street-scale Web AR on iPhone Safari (camera passthrough + real positioning sensors) vs FOV Corridor Simulator.

---

## 1. Intent Dossier

### Hackathon Scope & Project Purpose
DayPlay AR demonstrates verified, street-scale AR discovery along San Francisco's Mission/Valencia corridor. Built for the Meta Global AI Developer Hackathon Startup Track (*Build for Your World*), the system solves generative place-hallucination in spatial computing by enforcing a strict **zero-hallucination invariant**: every rendered pin and placard must strictly trace back to a verified DayPlay Supabase listing (`source_tool: supabase_entities_anon`). The model reasons, parses user intent, and plans catalog tool calls, but is architecturally constrained from inventing venues, coordinates, or listing IDs.

### Architecture
- **Backend Service (`backend/main.py`):** FastAPI app exposing `/health`, `/intent`, `/pipeline`, `/ask`, and `/pins`, alongside static mounts `/sim` and `/eval` for single-origin execution.
- **Typed Intent & Tool Planning Pipeline (`backend/pipeline.py`, `backend/dayplay_tools.py`):** Natural language queries resolve to structured filters (`time_window`, `radius_min`, `neighborhood`, `category`, `vibe`), which deterministically map to constrained DayPlay tools (`live_now`, `happening_today`, `nearby`, `saved_places`, `build_itinerary`). Arguments are strictly clamped to schema boundaries.
- **Zero-Hallucination Gate (`backend/validator.py`, `backend/pipeline.py`):** 
  - Validator checks SF Bay Area bounds (37.2–38.0, −123.0–−121.6), non-empty IDs, and genuine names.
  - Failures are dropped and logged, never guessed or repaired.
  - Sourced dataset: 12 real Mission-corridor listings in `eval/fixtures/corridor_real.json` queried via DayPlay Supabase anon REST.
- **Swappable Model Adapter (`backend/adapter.py`):** Unified protocol for `meta` (Muse Spark), `baseten` (`muse-spark`), and `mock`. Because Meta Model API and Baseten partner keys are blocked without a card-on-file, the system runs deterministically offline via `mock` while maintaining exact Muse-ready tool-calling signatures.
- **Task Milestones (T1 → T4a):**
  - **T1:** Real DayPlay pin sourcing from Supabase entities table into `eval/fixtures/corridor_real.json` via publishable anon REST.
  - **T2:** Spatial pinning pipeline (`/pipeline`), constrained tool planner, zero-hallucination drop gate, and 20/20 mini-eval.
  - **T3 (Stage A & B):** Interactive FOV simulator rewrite (`sim/app.js`, `sim/index.html`), 62° HFOV geometry, walking telemetry along Mission/Valencia, 1920x1080 30fps captures, and latency export (`ops/hackathon/t3-latency.json`).
  - **T4a:** Real-camera passthrough (`sim/camera.js`) with `getUserMedia` rear-camera streaming, iOS Safari user-gesture tap button, and fallback to synthetic background.
- **Simulator Experience Today:** First-person 62° HFOV frustum, keyboard/interval corridor traversal (heading 35° NE along Mission), real-time distance countdowns, telemetry HUD (`LAT/LNG/HDG/SPEED`), and toggleable camera passthrough with synthetic fallback.

---

## 2. Human-Review Readiness

### Public Repo & Documentation Audit
- **README Accuracy vs Working Tree:** Stale on Task 4a. The README documents up through Task 2 (Oct 31) and lists the FOV simulator, but does **not** mention T4a camera passthrough (`sim/camera.js`, `<video id="camera-feed">`, or camera toggle button). README quickstart and endpoint tables are otherwise accurate.
- **Demo Walkthrough MP4s:** Present and committed directly in the git repository at `ops/hackathon/t3-walkthrough-slow.mp4` (271 KB) and `ops/hackathon/t3-walkthrough-fast.mp4` (292 KB). Both are verified 1920x1080 30fps H.264 without letterboxing.
- **Open TODOs / Stubs in Backend:**
  - Zero `TODO`, `FIXME`, or `XXX` comments in `backend/` (`grep -rn -E "TODO|FIXME" backend/` returned 0 matches).
  - Grounding module (`backend/grounding.py:80`) includes a deliberate, gated `NotImplementedError` for `backend == "sam"` pending Meta SAM-3.1 API keys. Mock grounding backend is active.

### Test Suite Execution
- **System Python (`/usr/bin/python3` 3.9.6):** Failed with syntax error due to PEP 604 union types (`str | None` in `backend/adapter.py:160`).
- **Python 3.10+ Environment (`.venv/bin/pytest`):** **29/29 tests passed** in 0.22s (`tests/test_adapter_transport.py`, `tests/test_grounding.py`, `tests/test_pipeline.py`, `tests/test_t3_sim.py`, `tests/test_t4a_camera.py`).
- **Node Unit Suite:** `node tests/test_camera_sim_unit.mjs` **passed 3/3** tests (unsupported fallback, permission denial fallback, clean stream toggle).

---

## 3. Deployment Status

- **Fly.io Deployment State:** Assigned to Likith via Notion task `40bf28e2-2d4f-81c8-905f-ecd8f48f4089`. No live deployment is verified yet.
- **Repository Deploy Configuration Audit:**
  - `Dockerfile`: **MISSING** (not in repo root).
  - `fly.toml`: **MISSING** (not in repo root).
  - `Procfile`: **MISSING** (not in repo root).
  - `requirements.txt`: **MISSING** (not in repo root; dependencies only listed informally in `README.md`).
  - `.env.example`: **MISSING** (not in repo root).
- **Minimum Operational Boot Command:**
  ```bash
  pip install fastapi uvicorn httpx
  MODEL_PROVIDER=mock uvicorn backend.main:app --host 0.0.0.0 --port 8000
  ```
  *Note for live iPhone testing:* Deployer must ensure TLS termination (HTTPS) or Safari will reject `getUserMedia` and sensor permissions.

---

## 4. Verification Honesty Table

| Claim | Source Task | Working Tree Evidence | Re-Verification Status | Notes / Limitations |
|---|---|---|---|---|
| **12 Real Mission Corridor Pins** | T1 | `eval/fixtures/corridor_real.json` (12 entries), `eval/build_real_fixture.py` | **VERIFIED (Static & Runtime)** | Verified 12 records loaded by `validator.load_pins`. Anon Supabase REST sourcing verified; fixture build script present. |
| **Zero-Hallucination Gate (20/20)** | T2 | `backend/validator.py`, `eval/mini_eval.py`, `eval/results/mini_eval_results.json` | **VERIFIED (Static & Code Present)** | Logic verified in code; results JSON records 20/20 assert passes with 0 hallucinated pins under `mock` provider. Not re-executed against live Meta API. |
| **Sim Frustum & Walking HUD** | T3 (Stage A) | `sim/app.js`, `sim/index.html`, `tests/test_t3_sim.py` | **VERIFIED (Automated Test)** | 4/4 sim tests pass; FOV math (62° HFOV, `metersPerDeg`), reticle, and walk intervals verified. |
| **Walkthrough MP4s & Latency Log** | T3 (Stage B) | `ops/hackathon/t3-walkthrough-*.mp4`, `ops/hackathon/t3-latency.json` | **VERIFIED (File Inspection)** | Videos committed to repo; latency artifact shows 15ms p50 pipeline latency. Video captures trusted from Stage B artifact output. |
| **Camera Passthrough & Fallback** | T4a | `sim/camera.js`, `tests/test_t4a_camera.py`, `tests/test_camera_sim_unit.mjs` | **VERIFIED (Unit & Contract Test)** | 29/29 pytest and 3/3 node tests pass. Physical camera prompt on live iPhone requires HTTPS deployment. |
| **Real Street Positioning (GPS/Compass)** | Target Live | `sim/app.js`, `ops/hackathon/reviews/sensor-gap-analysis-2026-11-02.md` | **NOT IMPLEMENTED (Gap Documented)** | Zero sensor APIs in current repo; coordinates and heading (35°) remain synthetic. Gap analysis completed. |
