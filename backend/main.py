"""FastAPI surface for the AR client. Run: uvicorn backend.main:app --reload"""
from pathlib import Path
from typing import List, Dict, Any

from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles

from .adapter import get_provider
from .validator import load_pins

app = FastAPI(title="DayPlay AR Hackathon Pipeline")

_REPO = Path(__file__).parent.parent
FIXTURES = {
    "real": _REPO / "eval" / "fixtures" / "corridor_real.json",
    "synthetic": _REPO / "eval" / "fixtures" / "corridor.json",
}

def _pins_response(source: str) -> dict:
    path = FIXTURES[source]
    valid, drops = load_pins(str(path))
    if not path.exists():
        return {"pins": [], "source": source, "note": f"fixture missing: {path.name} — generate eval/fixtures/corridor_real.json (see README)"}
    notes = {
        "real": "pins sourced from DayPlay Supabase entities (anon REST, status=published), validated zero-hallucination gate",
        "synthetic": "DEV-ONLY synthetic fixtures (FIX-SYN-*) — schema demos, never ship in demo video",
    }
    note = notes[source]
    if drops:
        note += f" | {len(drops)} dropped by validator"
    return {"pins": valid, "source": source, "note": note}

@app.get("/health")
def health():
    import os
    return {"ok": True, "provider": os.getenv("MODEL_PROVIDER", "mock")}

@app.post("/intent")
def intent(body: dict):
    return get_provider().parse_intent(body.get("text", ""))

@app.get("/pins")
def pins(source: str = Query("real", pattern="^(real|synthetic)$")):
    """Returns validator-passed spatial pins from DayPlay data.

    source=real      -> eval/fixtures/corridor_real.json (DayPlay Supabase, anon REST)
    source=synthetic -> eval/fixtures/corridor.json (FIX-SYN-* dev-only schema demos)

    BLOCKED (not needed for pins anymore): DayPlay MCP auth (trustedClientSecret
    provisioning) — anon Supabase REST covers pin sourcing; see docs/spatial-contract.md.
    Every pin returned has passed validator.validate_pin — zero-hallucination gate.
    """
    return _pins_response(source)

# Static mounts so the sim runs from the same origin (no CORS, relative ../eval fetch works).
_SIM = _REPO / "sim"
_EVAL = _REPO / "eval"
if _SIM.exists():
    app.mount("/sim", StaticFiles(directory=str(_SIM)), name="sim")
if _EVAL.exists():
    app.mount("/eval", StaticFiles(directory=str(_EVAL)), name="eval")
