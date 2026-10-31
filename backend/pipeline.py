"""DayPlay AR spatial pinning pipeline (Task 2).

Flow:  natural language
    -> typed intent filters        (model adapter: mock offline / Muse when key lands)
    -> CONSTRAINED DayPlay tool plan (only catalog tools from dayplay_tools.py;
                                      venue identity ALWAYS comes from tool output)
    -> tool execution               (fixture path today; live-MCP swap-in marked)
    -> ZERO-HALLUCINATION pin gate  (every emitted listing_id must exist in the
                                     verified ground-truth set or it is DROPPED
                                     and the drop is recorded — in code, every run)

Freshness tiers (deterministic, computed per pin against run time):
  live      -> starts_at within +/-6h of now              (eligible: every window)
  scheduled -> future start within 24h                    (eligible: today/tonight)
  standing  -> saved venue, stale-or-absent schedule      (eligible as venue
              availability for today/tonight/nearby; NEVER claimed "live now")
  stale     -> future start beyond 24h                    (dropped for near-term windows)

Fixture-mode note: category/vibe are SOFT signals (fixture has no structured
category metadata) — they rank results, they never drop verified pins. This is
recorded in the response as filter_mode, and swaps to hard filters when live MCP
category fields land.
"""
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .adapter import get_provider
from .dayplay_tools import (CORRIDOR_ANCHOR, METERS_PER_WALK_MIN, TOOL_NAMES,
                            coerce_tool_args, plan_tools_from_filters,
                            tool_schemas)
from .validator import load_pins

_REPO = Path(__file__).parent.parent
REAL_FIXTURE = _REPO / "eval" / "fixtures" / "corridor_real.json"
SYNTH_FIXTURE = _REPO / "eval" / "fixtures" / "corridor.json"

# DAYPLAY_PROVIDER_MODE: "fixture" (today: verified pins from the real fixture)
# or "live_mcp" (SWAP-IN when api.dayplay.io/mcp auth lands; executor raises until then).
PROVIDER_MODE = os.getenv("DAYPLAY_PROVIDER_MODE", "fixture")
VALID_KINDS = ("saved", "event", "plan_stop")
LIVE_WINDOW_S = 6 * 3600          # +/-6h counts as "live"
SCHEDULED_WINDOW_S = 24 * 3600    # upcoming events inside 24h are "scheduled"


# ---------------------------------------------------------------- ground truth

def load_ground_truth(fixture_path: Optional[str] = None) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Load verified pins through the validator gate. This IS the ground truth:
    the only listing_ids a pipeline run may ever emit."""
    path = fixture_path or str(REAL_FIXTURE if REAL_FIXTURE.exists() else SYNTH_FIXTURE)
    pins, drops = load_pins(path)
    for d in drops:
        print(f"[ground-truth] validator {d}")
    return pins, drops


def ground_truth_index(pins: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {p["listing_id"]: p for p in pins}


# ------------------------------------------------------------------- LLM stage

def llm_intent(text: str) -> Dict[str, Any]:
    """NL -> typed filters {time_window, radius_min, neighborhood, category, vibe}.
    Consumes the Task-1 adapter. Mock parses offline; meta/baseten route to Muse
    Spark with the identical typed-filter contract (see adapter.INTENT_SYSTEM_PROMPT)."""
    provider = get_provider()
    filters = provider.parse_intent(text)
    filters.setdefault("time_window", "today")
    radius = filters.get("radius_min")
    try:
        filters["radius_min"] = max(1, min(30, int(radius or 15)))
    except (TypeError, ValueError):
        filters["radius_min"] = 15
    return filters


# ------------------------------------------------------------------- freshness

def _parse_ts(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def compute_freshness(pin: Dict[str, Any], now: datetime) -> Tuple[str, str]:
    """Deterministic freshness tier + human note. Used by executor AND resolver."""
    starts = _parse_ts(pin.get("starts_at"))
    kind = pin.get("kind")
    if starts is None:
        return "standing", "no schedule on file; treated as standing venue availability"
    delta = (starts - now).total_seconds()
    if abs(delta) <= LIVE_WINDOW_S:
        return "live", f"start {starts.isoformat()} within +/-6h of run time"
    if delta > 0:
        if delta <= SCHEDULED_WINDOW_S:
            return "scheduled", f"starts in {int(delta // 3600)}h (inside 24h)"
        return "stale", f"starts in {int(delta // 3600)}h — beyond the 24h scheduling horizon"
    if kind == "saved":
        return "standing", f"saved venue; last crawl {starts.date().isoformat()} (recurring/standing — not a live-event claim)"
    return "stale", f"event start {starts.date().isoformat()} already passed and not a standing venue"


def _soft_text_score(row: Dict[str, Any], category: Optional[str], vibe: Optional[str]) -> int:
    """Fixture-mode SOFT ranking: category/vibe match text, never drop pins."""
    hay = f"{row.get('name', '')} {row.get('kind', '')}".lower()
    score = 0
    for term, weight in ((category, 2), (vibe, 1)):
        if term and term.lower() in hay:
            score += weight
    return score


# --------------------------------------------------- tool execution (two paths)

def execute_tool_call(tool_name: str, args: Dict[str, Any],
                      ground_truth: List[Dict[str, Any]],
                      now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """Execute one catalog tool call; returns RAW tool rows (pre-resolution).

    FIXTURE PATH (active): deterministic filter/rank over validator-passed pins —
    a stand-in for the live MCP response with an IDENTICAL row shape.
    LIVE MCP PATH (SWAP-IN, not implemented): api.dayplay.io/mcp is 401
    OAuth-gated (re-verified 2026-10-31). When auth lands, replace this body's
    fixture branch with MCP calls using the SAME tool names/schemas from
    dayplay_tools.TOOL_CATALOG; nothing else in the pipeline changes.
    """
    if tool_name not in TOOL_NAMES:
        raise KeyError(f"tool not in DayPlay catalog: {tool_name}")
    if PROVIDER_MODE == "live_mcp":
        raise NotImplementedError(
            "live_mcp executor is a marked swap-in point; DayPlay MCP auth blocked (401). "
            "Run with DAYPLAY_PROVIDER_MODE=fixture.")
    if PROVIDER_MODE != "fixture":
        raise ValueError(f"unknown DAYPLAY_PROVIDER_MODE: {PROVIDER_MODE}")

    now = now or datetime.now(timezone.utc)
    lat = float(args.get("lat", CORRIDOR_ANCHOR["lat"]))
    lng = float(args.get("lng", CORRIDOR_ANCHOR["lng"]))
    radius_m = float(args.get("radius_min", 15)) * METERS_PER_WALK_MIN
    category = (args.get("category") or "").strip().lower() or None
    vibe = (args.get("vibe") or "").strip().lower() or None

    def dist_m(p: Dict[str, Any]) -> float:
        kpd = 111.320 * math.cos(math.radians(lat))
        return math.hypot((p["lat"] - lat) * 111.32, (p["lng"] - lng) * kpd) * 1000.0

    rows: List[Dict[str, Any]] = []
    for p in ground_truth:
        d = dist_m(p)
        row = dict(p)
        row["distance_m"] = round(d)
        row["_soft_score"] = _soft_text_score(row, category, vibe)
        tier, note = compute_freshness(p, now)
        row["_freshness"], row["_freshness_note"] = tier, note
        if tool_name in ("live_now", "happening_today", "nearby") and d > radius_m:
            continue
        if tool_name == "live_now" and tier != "live":
            continue  # strict: only starts within +/-6h of now
        if tool_name == "happening_today" and tier not in ("live", "scheduled", "standing"):
            continue
        if tool_name == "saved_places" and tier == "stale":
            continue
        rows.append(row)
    if tool_name == "saved_places":
        rows.sort(key=lambda r: (-r["_soft_score"], r["distance_m"]))
    else:
        rows.sort(key=lambda r: (-r["_soft_score"], r["distance_m"], r["_freshness_note"]))
    return rows


# -------------------------------------------------------------- pin resolution

def resolve_pins(tool_results: Dict[str, List[Dict[str, Any]]],
                 truth_index: Dict[str, Dict[str, Any]],
                 filters: Dict[str, Any],
                 now: Optional[datetime] = None) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    """Merge tool rows into renderable pins. THE zero-hallucination gate lives
    here and runs on every call: a listing_id absent from the verified
    ground-truth index is DROPPED and recorded — never repaired, never guessed.
    Returns (pins, drops, freshness_summary)."""
    now = now or datetime.now(timezone.utc)
    radius_min = float(filters.get("radius_min") or 15)
    radius_m = radius_min * METERS_PER_WALK_MIN
    window = filters.get("time_window")
    pins: List[Dict[str, Any]] = []
    drops: List[Dict[str, Any]] = []
    by_lid: Dict[str, Dict[str, Any]] = {}

    for tool_name in TOOL_NAMES:  # deterministic merge order: strictest tools first
        for row in tool_results.get(tool_name, []):
            lid = row.get("listing_id")
            if not lid:
                drops.append({"listing_id": None, "reason": "tool row missing listing_id", "tool": tool_name})
                continue
            if lid not in truth_index:
                drops.append({"listing_id": lid,
                              "reason": "listing_id NOT in verified ground truth — dropped (zero-hallucination gate)",
                              "tool": tool_name})
                continue
            entry = by_lid.setdefault(lid, {"truth": truth_index[lid], "tools": [], "row": row})
            if tool_name not in entry["tools"]:
                entry["tools"].append(tool_name)

    for lid, entry in by_lid.items():
        row, truth, tools = entry["row"], entry["truth"], sorted(entry["tools"])
        d = float(row.get("distance_m") or 0)
        if d > radius_m:
            drops.append({"listing_id": lid, "reason": f"outside requested walk radius ({int(radius_min)} min = {int(radius_min * METERS_PER_WALK_MIN)}m; pin at {int(d)}m)", "tool": ",".join(tools)})
            continue
        tier, note = compute_freshness(truth, now)
        eligible = {
            "now": ("live", "standing"),
            "today": ("live", "scheduled", "standing"),
            "tonight": ("live", "scheduled", "standing"),
        }.get(window, ("live", "scheduled", "standing"))
        if tier not in eligible:
            drops.append({"listing_id": lid, "reason": f"freshness tier '{tier}' not eligible for window={window}", "tool": ",".join(tools)})
            continue
        pins.append({
            "listing_id": truth["listing_id"],
            "name": truth["name"],
            "lat": truth["lat"],
            "lng": truth["lng"],
            "kind": truth.get("kind") if truth.get("kind") in VALID_KINDS else "saved",
            "starts_at": truth.get("starts_at"),
            "distance_m": round(d),
            "source_tool": f"dayplay:{tools[0]}",
            "via_tools": tools,
            "freshness": tier,
            "freshness_note": note,
        })
    pins.sort(key=lambda p: (p["distance_m"], p["listing_id"]))
    summary: Dict[str, Any] = {
        "by_tier": {},
        "window": window,
        "note": ("fixture-mode freshness: 'standing' = saved venue availability (stale/absent schedule), "
                 "never presented as a live event"),
    }
    for p in pins:
        summary["by_tier"][p["freshness"]] = summary["by_tier"].get(p["freshness"], 0) + 1
    return pins, drops, summary


# -------------------------------------------------------------------- pipeline

def run_pipeline(text: str, fixture_path: Optional[str] = None) -> Dict[str, Any]:
    """End-to-end. Deterministic on the mock provider; Muse-ready via run_tools.

    Mock path:  plan_tools_from_filters() plays the model's tool-decision role
    deterministically (the mock has no model).
    Muse path:  provider.run_tools(messages, tools=tool_schemas(), tool_executor)
    executes a native tool loop — same catalog, same executor, same resolver.
    """
    truth, truth_drops = load_ground_truth(fixture_path)
    truth_index = ground_truth_index(truth)
    filters = llm_intent(text)
    provider_name = os.getenv("MODEL_PROVIDER", "mock")
    tool_results: Dict[str, List[Dict[str, Any]]] = {}
    planner = "deterministic_plan_tools_from_filters"
    if provider_name == "mock":
        plan = plan_tools_from_filters(filters)
        for call in plan:
            args = coerce_tool_args(call["name"], call["args"])
            tool_results[call["name"]] = execute_tool_call(call["name"], args, truth)
    else:
        # Muse native tool loop (requires API key; unit tests inject a stub transport).
        provider = get_provider(provider_name)
        planner = f"{provider_name}:muse_native_tool_loop"
        system = (
            "You plan DayPlay AR pins. Call ONLY the provided DayPlay tools; never invent "
            "venues or listing IDs. Pick tools and arguments that match the user's request."
        )
        outcome = provider.run_tools(
            messages=[{"role": "system", "content": system}, {"role": "user", "content": text}],
            tools=tool_schemas(),
            tool_executor=lambda name, args: execute_tool_call(name, coerce_tool_args(name, args), truth),
        )
        tool_results = outcome.get("tool_results", {})
        plan = outcome.get("tool_calls", [])
    pins, drops, freshness = resolve_pins(tool_results, truth_index, filters)
    verified_ids = set(truth_index)
    # The assert that ships: re-verify EVERY emitted pin against ground truth.
    assert_holds = all(p["listing_id"] in verified_ids for p in pins)
    if not assert_holds:  # defense-in-depth; resolve_pins already drops these
        raise AssertionError("zero-hallucination invariant violated: unverified listing_id reached output")
    return {
        "query": text,
        "provider": provider_name,
        "provider_mode": PROVIDER_MODE,
        "planner": planner,
        "filters": filters,
        "tool_plan": plan,
        "tool_result_counts": {k: len(v) for k, v in tool_results.items()},
        "pins": pins,
        "drops": drops,
        "freshness_summary": freshness,
        "ground_truth_size": len(truth),
        "ground_truth_drops": truth_drops,
        "zero_hallucination_assert": "pass" if assert_holds else "FAIL",
    }
