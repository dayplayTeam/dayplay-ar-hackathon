"""Model adapter layer — swappable providers behind one interface.

Providers:
  meta     -> Muse Spark 1.3 via https://api.meta.ai/v1 (needs LLM_* key; BLOCKED by Meta key-creation bug as of 2026-10-29)
  baseten  -> muse-spark-open-1026 via Baseten (open-weights; $100 credits requested)
  mock     -> deterministic offline responses for simulator dev / tests

Env: MODEL_PROVIDER=meta|baseten|mock, META_API_KEY=..., BASETEN_API_KEY=...
"""
import os, json
from typing import Protocol

class IntentProvider(Protocol):
    def parse_intent(self, text: str) -> dict: ...
    def run_tools(self, messages: list, tools: list) -> dict: ...

class MockProvider:
    """Offline provider: keyword parse + canned tool-call plan. 100% deterministic."""
    def parse_intent(self, text: str) -> dict:
        t = text.lower()
        return {
            "time_window": "now" if any(k in t for k in ("now", "live", "tonight")) else "today",
            "radius_min": 10 if "10-min" in t else 15,
            "neighborhood": "mission" if "mission" in t else None,
            "category": "gems" if "gem" in t else None,
            "vibe": "chill" if "chill" in t else None,
        }
    def run_tools(self, messages, tools):
        return {"provider": "mock", "tool_calls": [], "note": "mock: wire to DayPlay tool schemas in pipeline step"}

def get_provider(name: str | None = None):
    name = name or os.getenv("MODEL_PROVIDER", "mock")
    if name == "mock":
        return MockProvider()
    if name == "meta":
        raise RuntimeError("meta provider: blocked on Meta API key creation bug (2026-10-29). See docs.")
    if name == "baseten":
        raise RuntimeError("baseten provider: pending $100 credit request + key. Wire meta-models/muse-spark-open-1026 here.")
    raise ValueError(f"unknown provider {name}")
