"""Spatial Pin Validation Gate. Enforces the zero-hallucination invariant.

Every pin served to the AR renderer MUST pass validate_pin(). Anything that
fails is dropped — never repaired, never guessed. A pin with no verified
listing behind it does not exist.

Fixture formats accepted: a bare JSON array of pins, or an object with a
"listings" key (either is normalized to a list).
"""
import json
from pathlib import Path
from typing import List, Dict, Any, Tuple

# San Francisco Bay Area bounding box [min_lat, max_lat, min_lng, max_lng]
SF_BOUNDS = (37.2, 38.0, -123.0, -121.6)

def _normalize(raw: Any) -> List[Dict[str, Any]]:
    """Accept either a bare array of pins or {"listings": [...]}."""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return raw.get("listings", [])
    return []

def validate_pin(pin: Dict[str, Any]) -> Tuple[bool, str]:
    """Validates an incoming pin against the contract."""
    # 1. listing_id present and non-empty
    lid = pin.get("listing_id")
    if not lid or not isinstance(lid, str) or not lid.strip():
        return False, "missing or invalid listing_id"

    # 2. name present and <= 80 chars
    name = pin.get("name")
    if not name or not isinstance(name, str) or len(name) > 80:
        return False, "name missing or exceeds 80 characters"

    # 3. lat/lng within bounds
    lat = pin.get("lat")
    lng = pin.get("lng")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return False, "lat/lng must be numeric"

    if not (SF_BOUNDS[0] <= lat <= SF_BOUNDS[1] and SF_BOUNDS[2] <= lng <= SF_BOUNDS[3]):
        return False, f"lat/lng ({lat}, {lng}) outside SF Bay Area bounds"

    # 4. kind check
    if pin.get("kind") not in ("saved", "event", "plan_stop"):
        return False, f"invalid kind: {pin.get('kind')}"

    return True, "ok"

def load_pins(fixture_path: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Loads a fixture file and returns (valid_pins, drop_reasons). Never raises on bad pins."""
    p = Path(fixture_path)
    if not p.exists():
        return [], [f"fixture not found: {p}"]
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return [], [f"fixture unreadable: {e}"]

    valid, reasons = [], []
    for item in _normalize(data):
        is_valid, reason = validate_pin(item)
        if is_valid:
            valid.append(item)
        else:
            lid = item.get("listing_id") if isinstance(item, dict) else item
            reasons.append(f"dropped {lid!r}: {reason}")
    return valid, reasons

def load_validated_corridor_pins(fixture_path: str = None) -> List[Dict[str, Any]]:
    """Back-compat wrapper: loads fixtures, runs validation gate, drops non-conforming items."""
    if fixture_path is None:
        fixture_path = str(Path(__file__).parent.parent / "eval" / "fixtures" / "corridor.json")
    valid, reasons = load_pins(fixture_path)
    for r in reasons:
        print(f"Validation {r}")
    return valid
