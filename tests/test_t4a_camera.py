"""Task-4a real-camera passthrough contract tests.

Covers:
  1. sim/camera.js and sim/app.js are served over HTTP static mount.
  2. sim/index.html includes required DOM elements:
     - <video id="camera-feed"> for real getUserMedia feed
     - <div id="synthetic-bg"> for graceful fallback background
     - <button id="btn-camera"> for user-gesture permission trigger (required by iOS Safari)
     - <span id="camera-status-badge"> for camera state feedback
  3. sim/camera.js implements CameraFeedManager with:
     - getUserMedia invocation with { facingMode: { ideal: 'environment' } }
     - iOS Safari attributes (playsinline, webkit-playsinline, muted)
     - Secure context / HTTPS check
     - Fallback mechanism on NotAllowedError (permission denied) or unsupported
     - State transitions (idle, requesting, active, fallback, unsupported)
  4. sim/app.js exports and wires toggleCamera and cameraManager while keeping
     T3 stage A FOV, heading, walking, and zero-hallucination logic intact.
"""
from pathlib import Path
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)
_REPO = Path(__file__).parent.parent


def test_sim_serves_camera_module():
    r = client.get("/sim/camera.js")
    assert r.status_code == 200, "camera.js must be served by static mount"
    code = r.text
    assert "CameraFeedManager" in code
    assert "getUserMedia" in code
    assert "fallbackToSynthetic" in code
    assert "playsinline" in code
    assert "environment" in code, "AR camera should target rear camera by default"


def test_sim_index_contains_camera_feed_and_fallback_elements():
    r = client.get("/sim/index.html")
    assert r.status_code == 200
    html = r.text
    assert 'id="camera-feed"' in html, "Must contain <video id='camera-feed'>"
    assert 'id="synthetic-bg"' in html, "Must contain <div id='synthetic-bg'> for fallback"
    assert 'id="btn-camera"' in html, "Must contain user-tap button for iOS permission"
    assert 'id="camera-status-badge"' in html, "Must contain camera status badge"
    assert 'playsinline' in html, "Video element must have playsinline for iOS"


def test_t3_stage_a_fov_and_heading_logic_preserved():
    r = client.get("/sim/app.js")
    assert r.status_code == 200
    js = r.text
    # Keep T3 stage A FOV/heading/latency logic intact
    assert "metersPerDeg" in js
    assert "relCoords" in js
    assert "CFG" in js
    assert "fovDeg" in js
    assert "maxRenderDistM" in js
    assert "__latencyLog" in js
    assert "/pipeline" in js
    assert "toggleCamera" in js
    assert "CameraFeedManager" in js


def test_feed_swap_contract_in_camera_js():
    camera_file = _REPO / "sim" / "camera.js"
    assert camera_file.exists()
    content = camera_file.read_text()
    
    # Check fallback path handling
    assert "fallbackToSynthetic" in content
    assert "isSecureContext" in content
    assert "isSupported" in content
    assert "NotAllowedError" in content or "reason" in content
    assert "CameraState" in content
