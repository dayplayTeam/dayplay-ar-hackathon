"""Grounding scaffold tests (gated, mock backend only)."""
import sys
from pathlib import Path
REPO = Path(__file__).parent.parent
sys.path.insert(0, str(REPO))

import pytest
from backend.grounding import ground_image, parse_geometry_tokens
from backend.pipeline import load_ground_truth

def test_mock_grounding_attaches_boxes():
    pins, _ = load_ground_truth()
    out = ground_image("frame-0", pins[:3], backend="mock")
    assert out["backend"] == "mock" and out["grounded_count"] == 3
    for p in out["pins"]:
        assert p["grounding"]["box"] == [0.40, 0.42, 0.60, 0.58]
        assert p["grounding"]["confidence"] == 0.0  # explicit mock marker

def test_sam_geometry_token_parser():
    boxes = parse_geometry_tokens("found <|box;0.1,0.2,0.3,0.4|> and <|box;0.5,0.5,0.2,0.2|>")
    assert boxes == [(0.1, 0.2, 0.3, 0.4), (0.2, 0.2, 0.5, 0.5)]

def test_sam_backend_raises_while_blocked():
    with pytest.raises(NotImplementedError):
        ground_image("frame-0", [], backend="sam")
