"""Spatial Pin Validation Gate. Enforces the zero-hallucination invariant."""
import json
from pathlib import Path
from typing import List, Dict, Any, Tuple

# San Francisco Bay Area bounding box [min_lat, max_lat, min_lng, max_lng]
SF_BOUNDS = (37.2, 38.0, -123.0, -121.6)

class ValidationError(ValueError):
    pass

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

def load_validated_corridor_pins(fixture_path: str = None) -> List[Dict[str, Any]]:
    """Loads fixtures, runs validation gate, drops non-conforming items."""
    if fixture_path is None:
        fixture_path = str(Path(__file__).parent.parent / "eval" / "fixtures" / "corridor.json")
    
    with open(fixture_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    raw_listings = data.get("listings", [])
    valid_pins = []
    
    for item in raw_listings:
        is_valid, reason = validate_pin(item)
        if is_valid:
            valid_pins.append(item)
        else:
            print(f"Validation dropped item: {item.get('listing_id')} - {reason}")
            
    return valid_pins
