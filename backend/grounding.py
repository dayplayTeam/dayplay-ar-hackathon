"""Grounding scaffold — attach SAM-3.1 box geometry / Muse Image frames to pins.

BONUS LAYER per the Task-2 risk plan: ship intent+pipeline first; this module is
GATED (no network calls) and binds to a deterministic mock until sam-3.1 /
muse-image-1.0 keys land (Meta Model API key blocked by portal bug as of
2026-10-31; Baseten credits pending).

Model facts (verified 2026-10-29): grounding = sam-3.1 via Responses streaming,
geometry tokens `<|box;x1,y1,x2,y2|>` / `<|mask;...|>`; imagery = muse-image-1.0.
"""
import re
from typing import Any, Dict, List, Optional, Tuple

GeometryToken = re.compile(r"<\|box;([0-9.]+),([0-9.]+),([0-9.]+),([0-9.]+)\|>")


def parse_geometry_tokens(text: str) -> List[Tuple[float, float, float, float]]:
    """Parse SAM-3.1 `<|box;x1,y1,x2,y2|>` tokens into normalized box tuples."""
    boxes: List[Tuple[float, float, float, float]] = []
    for m in GeometryToken.finditer(text or ""):
        x1, y1, x2, y2 = (float(m.group(i)) for i in range(1, 5))
        boxes.append((min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)))
    return boxes


def mock_ground_image(image_ref: str, pins: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Deterministic mock grounding: pins matched to fixture metadata get a
    stable, schema-valid `grounding` object with confidence 0.0 (explicitly NOT
    a real model confidence). No API call. Swap point: _sam_ground().
    """
    grounded = 0
    out: List[Dict[str, Any]] = []
    for p in pins:
        g: Optional[Dict[str, Any]] = None
        if p.get("listing_id"):
            # Deterministic stand-in geometry: centered placard anchor.
            g = {
                "box": [0.40, 0.42, 0.60, 0.58],
                "confidence": 0.0,          # mock marker — never report as real
                "frame_ts": None,
                "backend": "mock_fixture_match",
            }
            grounded += 1
        q = dict(p)
        q["grounding"] = g
        out.append(q)
    return {"image_ref": image_ref, "pins": out, "grounded_count": grounded,
            "backend": "mock", "note": "BONUS layer: sam-3.1/muse-image binding pending API keys"}


def _sam_ground(image_ref: str, pins: List[Dict[str, Any]]) -> Dict[str, Any]:
    """SWAP-IN (not implemented): call sam-3.1 Responses streaming with the
    storefront frame, parse <|box;...|> tokens, attach per-pin boxes. Blocked by
    Meta Model API key-creation bug (2026-10-31). Raising keeps the gate honest."""
    raise NotImplementedError("sam-3.1 binding pending Meta Model API key (portal bug, 2026-10-31)")


def ground_image(image_ref: str, pins: List[Dict[str, Any]], backend: str = "mock") -> Dict[str, Any]:
    """Public gated interface. backend='mock' -> deterministic fixture matching;
    backend='sam' -> swap-in (raises while blocked). Never performs network I/O
    in mock mode."""
    if backend == "mock":
        return mock_ground_image(image_ref, pins)
    if backend == "sam":
        return _sam_ground(image_ref, pins)
    raise ValueError(f"unknown grounding backend: {backend}")
