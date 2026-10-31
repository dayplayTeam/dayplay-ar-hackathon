"""Task-2 pipeline unit tests (mock provider, fixture ground truth)."""
import sys
from pathlib import Path
REPO = Path(__file__).parent.parent
sys.path.insert(0, str(REPO))

import pytest
from backend.pipeline import (execute_tool_call, ground_truth_index, llm_intent,
                              load_ground_truth, resolve_pins, run_pipeline,
                              compute_freshness)
from backend.dayplay_tools import TOOL_NAMES, coerce_tool_args, plan_tools_from_filters, tool_schemas
from backend.adapter import get_provider, MockProvider
from backend.validator import load_pins


@pytest.fixture(scope="module")
def truth():
    pins, drops = load_ground_truth()
    assert len(pins) >= 10, f"expected >=10 real validated pins, got {len(pins)}"
    return pins

@pytest.fixture(scope="module")
def tindex(truth):
    return ground_truth_index(truth)


# ---- tool catalog ------------------------------------------------------------
def test_catalog_tools_are_constrained():
    names = set(TOOL_NAMES)
    assert {"live_now", "happening_today", "nearby", "saved_places", "build_itinerary"} <= names

def test_coerce_args_clamps_radius_and_drops_unknown_keys():
    out = coerce_tool_args("nearby", {"lat": 37.76, "lng": -122.41, "radius_min": 999, "evil_key": "x", "category": "comedy"})
    assert out["radius_min"] == 30  # clamped to schema max
    assert "evil_key" not in out
    assert out["category"] == "comedy"

def test_plan_tools_only_uses_catalog_names():
    for text in ("what's live now?", "pin my gems tonight", "coffee nearby"):
        f = llm_intent(text)
        for call in plan_tools_from_filters(f):
            assert call["name"] in TOOL_NAMES


# ---- intent (mock provider) ---------------------------------------------------
def test_intent_mock_parses_time_and_radius():
    p = get_provider("mock")
    f = p.parse_intent("what's live within a 10-min walk right now?")
    assert f["time_window"] == "now"
    assert f["radius_min"] == 10

def test_intent_mock_neighborhood():
    f = MockProvider().parse_intent("pin my Mission gems for tonight")
    assert f["neighborhood"] == "mission"


# ---- executor: returns only verified rows -------------------------------------
def test_executor_rows_always_from_ground_truth(truth):
    rows = execute_tool_call("nearby", {"lat": 37.7601, "lng": -122.4198, "radius_min": 15}, truth)
    truth_ids = {p["listing_id"] for p in truth}
    assert rows and all(r["listing_id"] in truth_ids for r in rows)

def test_executor_radius_filter(truth):
    rows = execute_tool_call("nearby", {"lat": 37.7601, "lng": -122.4198, "radius_min": 5}, truth)
    assert all(r["distance_m"] <= 5 * 80 for r in rows)


# ---- resolver: THE zero-hallucination gate ------------------------------------
def test_resolver_drops_unverified_ids_and_records_drop(tindex):
    fake = {"nearby": [{"listing_id": "FABRICATED-ID-123", "name": "Ghost Cafe", "lat": 37.76, "lng": -122.41, "distance_m": 100}]}
    pins, drops, _ = resolve_pins(fake, tindex, {"time_window": "today", "radius_min": 15})
    assert all(p["listing_id"] != "FABRICATED-ID-123" for p in pins)
    assert any(d["listing_id"] == "FABRICATED-ID-123" and "ground truth" in d["reason"] for d in drops)

def test_resolver_drops_outside_radius(tindex):
    fake = {"nearby": [{"listing_id": next(iter(tindex)), "distance_m": 9999}]}
    pins, drops, _ = resolve_pins(fake, tindex, {"time_window": "today", "radius_min": 10})
    assert not pins
    assert any("radius" in d["reason"] for d in drops)


# ---- freshness ----------------------------------------------------------------
def test_freshness_tiers_are_deterministic(truth):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    for p in truth:
        tier, _ = compute_freshness(p, now)
        assert tier in ("live", "scheduled", "standing", "stale")


# ---- end-to-end invariant ------------------------------------------------------
def test_pipeline_end_to_end_all_pins_verified():
    run = run_pipeline("what's live within a 10-min walk right now?")
    assert run["zero_hallucination_assert"] == "pass"
    truth_ids = {p["listing_id"] for p in load_ground_truth()[0]}
    assert all(p["listing_id"] in truth_ids for p in run["pins"])

def test_pipeline_never_emits_unverified_even_if_tools_were_fabricated(tindex):
    # Direct resolver attack: fabricated rows can never reach pins.
    fake = {"live_now": [{"listing_id": "INVENTED-999", "distance_m": 50}]}
    pins, drops, _ = resolve_pins(fake, tindex, {"time_window": "now", "radius_min": 10})
    assert pins == [] and drops

def test_pipeline_prompt_suite_smoke():
    for text in ("pin my Mission gems for tonight", "plan a 3-stop evening on Valencia",
                 "quiet bar for a first date, chill vibe, walkable"):
        run = run_pipeline(text)
        assert run["zero_hallucination_assert"] == "pass"


# ---- validator integration -----------------------------------------------------
def test_real_fixture_loads_through_validator_gate():
    pins, drops = load_pins(str(REPO / "eval" / "fixtures" / "corridor_real.json"))
    assert len(pins) >= 10 and not drops
    assert all(p["source_tool"] == "supabase_entities_anon" for p in pins)
