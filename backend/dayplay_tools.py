"""DayPlay MCP tool catalog — DETERMINISTIC tool schemas for the model tool-loop.

These schemas mirror DayPlay's MCP tool semantics (happening-today / live-now /
nearby / saved-places / itinerary-style). They are declared here in code — the
model NEVER invents tools or arguments: it may only select from this catalog and
fill constrained JSON-schema parameters. Venue identity always comes from tool
OUTPUT (verified DayPlay listings), never from model text.

SWAP-IN POINT (live MCP): when api.dayplay.io/mcp auth lands (trustedClientSecret
provisioning — blocked 401 as of 2026-10-31), replace the fixture executor in
backend/pipeline.py (`execute_tool_call`) with real MCP calls. The schemas below
stay identical, so the Muse Spark tool-loop needs zero prompt changes.
"""
from typing import Any, Callable, Dict, List

# Walking-time conversion used everywhere (matches sim/index.html: radius_min * 80 m).
METERS_PER_WALK_MIN = 80.0
# Corridor anchor: Valencia & 16th (same anchor the FOV sim boots at).
CORRIDOR_ANCHOR = {"lat": 37.7601, "lng": -122.4198}

Filter = Dict[str, Any]
Executor = Callable[[str, Dict[str, Any]], List[Dict[str, Any]]]


def _radius_schema(default: int = 15) -> Dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "radius_min": {
                "type": "integer",
                "minimum": 1,
                "maximum": 30,
                "default": default,
                "description": "Walking radius in minutes (1 min ~ 80 m).",
            },
            "lat": {"type": "number", "description": "User latitude (WGS84)."},
            "lng": {"type": "number", "description": "User longitude (WGS84)."},
            "category": {"type": "string", "description": "Optional category filter, e.g. comedy, dance, sports, food, drinks, coffee, arts."},
            "vibe": {"type": "string", "description": "Optional soft vibe filter, e.g. chill, lively, quiet."},
        },
        "required": ["lat", "lng", "radius_min"],
    }


TOOL_CATALOG: List[Dict[str, Any]] = [
    {
        "name": "live_now",
        "description": "DayPlay listings with something happening RIGHT NOW inside a walking radius.",
        "input_schema": _radius_schema(),
    },
    {
        "name": "happening_today",
        "description": "DayPlay events happening today (optionally tonight) inside a walking radius.",
        "input_schema": _radius_schema(),
    },
    {
        "name": "nearby",
        "description": "DayPlay saved places near the user, sorted by walking time.",
        "input_schema": _radius_schema(),
    },
    {
        "name": "saved_places",
        "description": "The user's saved DayPlay listings, optionally filtered by category/vibe.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string"},
                "vibe": {"type": "string"},
            },
        },
    },
    {
        "name": "build_itinerary",
        "description": "Assemble up to N verified DayPlay listings into an ordered plan (stops from nearby/live results only).",
        "input_schema": {
            "type": "object",
            "properties": {
                "stops": {"type": "integer", "minimum": 1, "maximum": 6, "default": 3},
                "listing_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Listing IDs returned by other DayPlay tools. NEVER fabricated.",
                },
                "theme": {"type": "string"},
            },
            "required": ["stops"],
        },
    },
]

TOOL_NAMES = [t["name"] for t in TOOL_CATALOG]
_TOOLS_BY_NAME = {t["name"]: t for t in TOOL_CATALOG}


def tool_schemas() -> List[Dict[str, Any]]:
    """OpenAI/Meta chat-completions `tools` payload (deterministic, from catalog)."""
    return [
        {"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}}
        for t in TOOL_CATALOG
    ]


def coerce_tool_args(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Clamp model-supplied arguments to the schema. Unknown keys are DROPPED,
    out-of-range values clamped — the model can tighten but never exceed the plan."""
    schema = _TOOLS_BY_NAME[tool_name]["input_schema"]
    props = schema.get("properties", {})
    out: Dict[str, Any] = {}
    for key, spec in props.items():
        if key not in args or args[key] is None:
            continue
        val = args[key]
        if spec.get("type") == "integer":
            try:
                val = int(val)
            except (TypeError, ValueError):
                continue
            val = max(spec.get("minimum", val), min(spec.get("maximum", val), val))
        elif spec.get("type") == "number":
            try:
                val = float(val)
            except (TypeError, ValueError):
                continue
        elif spec.get("type") == "array":
            if not isinstance(val, list):
                continue
            val = [str(v) for v in val]
        else:
            val = str(val)
        out[key] = val
    # Fill defaults declared by the schema (e.g. radius_min default 15, stops default 3).
    for key, spec in props.items():
        if key not in out and "default" in spec:
            out[key] = spec["default"]
    return out


def plan_tools_from_filters(filters: Filter) -> List[Dict[str, Any]]:
    """Deterministic constrained plan: which DayPlay tools to call, with which args.

    The model may only pick from this mapping — free-form planning is not allowed.
    Priority: live-now for "now", happening-today for today/tonight, nearby always
    as the venue backbone; saved_places when no geo window applies.
    """
    window = filters.get("time_window")
    lat, lng = CORRIDOR_ANCHOR["lat"], CORRIDOR_ANCHOR["lng"]
    base_args = {
        "lat": lat,
        "lng": lng,
        "radius_min": int(filters.get("radius_min") or 15),
        "category": filters.get("category"),
        "vibe": filters.get("vibe"),
    }
    calls: List[Dict[str, Any]] = []
    if window == "now":
        calls.append({"name": "live_now", "args": dict(base_args)})
    if window in ("today", "tonight", "now"):
        calls.append({"name": "happening_today", "args": dict(base_args)})
    calls.append({"name": "nearby", "args": dict(base_args)})
    if not calls:
        calls.append({"name": "saved_places", "args": {"category": filters.get("category"), "vibe": filters.get("vibe")}})
    return calls
