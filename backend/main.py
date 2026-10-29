"""FastAPI surface for the AR client. Run: uvicorn backend.main:app --reload"""
from fastapi import FastAPI
from .adapter import get_provider

app = FastAPI(title="DayPlay AR Hackathon Pipeline")

@app.get("/health")
def health():
    return {"ok": True, "provider": __import__("os").getenv("MODEL_PROVIDER", "mock")}

@app.post("/intent")
def intent(body: dict):
    return get_provider().parse_intent(body.get("text", ""))

@app.get("/pins")
def pins():
    """Returns validated spatial pins from DayPlay data.
    BLOCKED on DayPlay MCP auth (trustedClientSecret provisioning) — see docs/spatial-contract.md."""
    return {"pins": [], "note": "pending DayPlay MCP auth + fixtures", "source": "none"}
