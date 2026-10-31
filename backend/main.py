"""FastAPI surface for the AR client. Run: uvicorn backend.main:app --reload"""
from pathlib import Path
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, Query
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .adapter import get_provider
from .validator import load_pins
from .pipeline import run_pipeline, load_ground_truth
from .grounding import ground_image

app = FastAPI(title="DayPlay AR Hackathon Pipeline")

_REPO = Path(__file__).parent.parent
FIXTURES = {
    "real": _REPO / "eval" / "fixtures" / "corridor_real.json",
    "synthetic": _REPO / "eval" / "fixtures" / "corridor.json",
}

class AskBody(BaseModel):
    text: str
    source: str = "real"          # ground-truth fixture: real | synthetic
    ground_backend: Optional[str] = None  # BONUS: "mock" attaches mock grounding

def _pins_response(source: str) -> dict:
    path = FIXTURES[source]
    valid, drops = load_pins(str(path))
    if not path.exists():
        return {"pins": [], "source": source, "note": f"fixture missing: {path.name} — generate eval/fixtures/corridor_real.json (see README)"}
    notes = {
        "real": "pins sourced from DayPlay Supabase entities (anon REST, status=published), validated zero-hallucination gate",
        "synthetic": "DEV-ONLY synthetic fixtures (FIX-SYN-*), schema demos, never ship in demo video",
    }
    note = notes[source]
    if drops:
        note += f" | {len(drops)} dropped by validator"
    return {"pins": valid, "source": source, "note": note}

@app.get("/health")
def health():
    import os
    return {"ok": True, "provider": os.getenv("MODEL_PROVIDER", "mock"),
            "provider_mode": os.getenv("DAYPLAY_PROVIDER_MODE", "fixture")}

@app.post("/intent")
def intent(body: dict):
    from .pipeline import llm_intent
    return llm_intent(body.get("text", ""))

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

@app.post("/pipeline")
def pipeline(body: AskBody):
    """Task-2 pipeline end-to-end (mock provider, fixture ground truth):
    intent -> constrained DayPlay tool plan -> pin resolution -> zero-hallucination gate.
    Every pin's listing_id is re-verified against the validator-passed ground truth
    on every run; anything else is dropped and recorded in `drops`."""
    source = body.source if body.source in FIXTURES else "real"
    return run_pipeline(body.text, str(FIXTURES[source]))

@app.post("/ask")
def ask(body: AskBody):
    """Client-friendly alias of /pipeline. Adds the BONUS grounding layer (mock
    backend only while sam-3.1/muse-image keys are blocked) and a sim-ready
    placard summary."""
    source = body.source if body.source in FIXTURES else "real"
    result = run_pipeline(body.text, str(FIXTURES[source]))
    if body.ground_backend:
        result["grounding"] = ground_image("frame-0", result["pins"], backend=body.ground_backend)
    result["placards"] = [
        {"listing_id": p["listing_id"], "name": p["name"], "distance_m": p["distance_m"],
         "freshness": p["freshness"]} for p in result["pins"]]
    return result

# Static mounts so the sim runs from the same origin (no CORS, relative ../eval fetch works).
_SIM = _REPO / "sim"
_EVAL = _REPO / "eval"
if _SIM.exists():
    app.mount("/sim", StaticFiles(directory=str(_SIM)), name="sim")
if _EVAL.exists():
    app.mount("/eval", StaticFiles(directory=str(_EVAL)), name="eval")
