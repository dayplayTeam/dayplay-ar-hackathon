"""Task-3 sim/overlay contract tests. Exercises the SHIPPED HTTP surface only
(backend pipeline is consumed via HTTP; no pipeline internals touched).

Covers:
  1. POST /pipeline returns >=1 verified pin for the demo queries, and every
     emitted listing_id exists in the validated corridor_real fixture
     (zero-hallucination invariant, re-checked client-side here).
  2. /sim serves the Task-3 app (app.js wired to /pipeline, not the mock
     /intent filter path).
  3. Latency-log artifact plumbing: sim/app.js writes window.__latencyLog.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)
_REPO = Path(__file__).parent.parent
_REAL = _REPO / "eval" / "fixtures" / "corridor_real.json"

DEMO_QUERIES = [
    "what is live within a 10-min walk in the mission tonight",
    "saved places for a chill afternoon in the mission",
]


def _real_ids() -> set:
    raw = json.loads(_REAL.read_text())
    return {p["listing_id"] for p in raw}


@pytest.mark.parametrize("query", DEMO_QUERIES)
def test_pipeline_demo_queries_return_verified_pins(query):
    r = client.post("/pipeline", json={"text": query, "source": "real"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provider"] == "mock"
    assert body["zero_hallucination_assert"] == "pass"
    assert len(body["pins"]) >= 1, f"no pins for: {query}"
    truth = _real_ids()
    for p in body["pins"]:
        assert p["listing_id"] in truth, f"UNVERIFIED listing_id emitted: {p['listing_id']}"
        for k in ("name", "kind", "lat", "lng", "distance_m"):
            assert k in p


def test_sim_app_js_wired_to_pipeline():
    r = client.get("/sim/app.js")
    assert r.status_code == 200
    js = r.text
    assert "/pipeline" in js, "sim app must consume POST /pipeline"
    assert "__latencyLog" in js, "sim app must record render latency"
    assert "placard" in js, "sim app must render placards"
    # The old mock path (client-side radius filter over /intent) must be gone.
    assert "/intent" not in js, "legacy mock /intent selection must not ship"


def test_sim_index_loads():
    r = client.get("/sim/index.html")
    assert r.status_code == 200
    assert "app.js" in r.text
