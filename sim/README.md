# Corridor Simulator

Pure-static FOV simulator (no build step). Serves the demo corridor walkthrough:
placards anchored by bearing/distance from a GPS-simulated walk up Valencia St.

Run (from repo root):
    uvicorn backend.main:app --reload --port 8000
    # then open with any static server:
    python3 -m http.server 8100 --directory sim
    open http://localhost:8100

Notes:
- Renders ONLY pins with listing_id (refuses the rest) — no-hallucination invariant enforced client-side too.
- FIXTURE-SYNTHETIC pins are for dev only; NEVER in the demo video (swap to real DayPlay MCP data when auth lands).
- Camera-feed compositing + SAM 3.1 grounding boxes land next.
