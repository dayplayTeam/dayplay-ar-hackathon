"""Voice pickup -> Muse tool-loop tests for POST /transcribe.

Locks the contract the AR client depends on:
  1. `text` path: client transcript routes through llm_intent + run_pipeline
     (Muse tool loop) and returns { text, intent, pins } with the
     zero-hallucination gate re-checked client-side.
  2. NEVER-FABRICATE: no text + no audio => HTTP 422 with a diagnostic —
     a canned placeholder query must never masquerade as a transcription.
  3. Whisper path: a real WAV upload hits the configured whisper.cpp server
     (stubbed transport — no network) and the returned transcript drives the
     pipeline.
  4. intent shape: the response exposes the typed-filter contract
     (time_window, radius_min, neighborhood, category, vibe) as `intent`.
"""
import io
import json
import sys
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).parent.parent
sys.path.insert(0, str(REPO))

import pytest
from fastapi.testclient import TestClient

from backend import main as backend_main
from backend.main import app

client = TestClient(app)
_REAL = REPO / "eval" / "fixtures" / "corridor_real.json"


def _real_ids() -> set:
    raw = json.loads(_REAL.read_text())
    return {p["listing_id"] for p in raw}


# ---- 1. client text path: full Muse tool-loop routing ------------------------
@pytest.mark.parametrize("query", [
    "what is live within a 10-min walk in the mission tonight",
    "comedy shows nearby",
])
def test_transcribe_text_routes_through_pipeline(query):
    r = client.post("/transcribe", data={"text": query})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["text"] == query
    assert body["stt_backend"] == "client_text"
    assert body["zero_hallucination_assert"] == "pass"
    # typed-intent contract surfaced as `intent`
    intent = body["intent"]
    assert {"time_window", "radius_min", "neighborhood", "category", "vibe"} <= set(intent)
    assert intent["time_window"] in ("now", "today", "tonight")
    assert 1 <= intent["radius_min"] <= 30
    # pins: gate-verified, real listing ids only
    truth = _real_ids()
    assert len(body["pins"]) >= 1, f"no pins for: {query}"
    for p in body["pins"]:
        assert p["listing_id"] in truth, f"UNVERIFIED listing_id: {p['listing_id']}"
        assert p["name"] and p["lat"] is not None and p["lng"] is not None


def test_transcribe_invalid_source_falls_back_to_real():
    r = client.post("/transcribe", data={"text": "what's live now?", "source": "bogus"})
    assert r.status_code == 200
    body = r.json()
    truth = _real_ids()
    assert len(body["pins"]) >= 1
    for p in body["pins"]:
        assert p["listing_id"] in truth


# ---- 2. never-fabricate: empty request => 422 --------------------------------
def test_transcribe_empty_request_is_rejected_not_fabricated():
    r = client.post("/transcribe", data={})
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert detail["error"] == "no_resolvable_text"
    assert "text" in detail["note"] or "WHISPER_STT_URL" in detail["note"]


def test_transcribe_whitespace_only_text_is_rejected():
    r = client.post("/transcribe", data={"text": "   "})
    assert r.status_code == 422


# ---- 3. whisper path: real WAV upload through a stubbed STT server -----------
def _tiny_wav() -> bytes:
    """A minimal valid 16-bit PCM WAV header + 0.1s of low-amplitude tone.
    Content does not matter — the STT server transport is stubbed; this only
    exercises the multipart plumbing and backend fallback logic."""
    import struct
    import wave
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"".join(struct.pack("<h", int(300 * (i % 32 < 16) - 150)) for i in range(1600)))
    return buf.getvalue()


def test_transcribe_audio_uses_configured_whisper_server(monkeypatch):
    monkeypatch.setattr(backend_main, "_WHISPER_STT_URL", "http://127.0.0.1:8791/inference")

    def fake_transcribe(raw: bytes, filename: str):
        assert raw == _tiny_wav()  # the uploaded bytes flow through untouched
        return " What is happening tonight? "

    with patch.object(backend_main, "_whisper_cpp_transcribe", side_effect=fake_transcribe) as spy:
        r = client.post(
            "/transcribe",
            files={"audio": ("speech.m4a", _tiny_wav(), "audio/x-m4a")},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert spy.call_count == 1
    assert body["text"] == "What is happening tonight?"  # stripped, no fabricated words
    assert body["stt_backend"] == "whisper_cpp:whisper-1"
    assert body["zero_hallucination_assert"] == "pass"
    intent = body["intent"]
    assert intent["time_window"] == "now"  # "tonight" maps through the mock parser
    truth = _real_ids()
    for p in body["pins"]:
        assert p["listing_id"] in truth


def test_transcribe_audio_falls_back_to_422_when_stt_fails(monkeypatch):
    monkeypatch.setattr(backend_main, "_WHISPER_STT_URL", "http://127.0.0.1:8791/inference")

    with patch.object(backend_main, "_whisper_cpp_transcribe", return_value=None):
        r = client.post(
            "/transcribe",
            files={"audio": ("speech.m4a", _tiny_wav(), "audio/x-m4a")},
        )
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert detail["error"] == "no_resolvable_text"
    assert any("whisper" in note.lower() for note in detail["stt_backends_tried"])


def test_transcribe_audio_base64_path(monkeypatch):
    monkeypatch.setattr(backend_main, "_WHISPER_STT_URL", "http://127.0.0.1:8791/inference")
    import base64
    encoded = base64.b64encode(_tiny_wav()).decode()

    with patch.object(backend_main, "_whisper_cpp_transcribe", return_value="comedy shows nearby") as spy:
        r = client.post("/transcribe", data={"audio_base64": encoded})
    assert r.status_code == 200, r.text
    body = r.json()
    assert spy.call_count == 1
    assert body["text"] == "comedy shows nearby"
    assert body["stt_backend"] == "whisper_cpp:whisper-1"


def test_transcribe_invalid_base64_falls_back_to_422(monkeypatch):
    monkeypatch.setattr(backend_main, "_WHISPER_STT_URL", "http://127.0.0.1:8791/inference")
    r = client.post("/transcribe", data={"audio_base64": "!!!not-base64!!!"})
    assert r.status_code == 422


# ---- 4. STT disabled: env unset means audio alone cannot transcribe ----------
def test_transcribe_audio_without_stt_config_fails_clean(monkeypatch):
    monkeypatch.setattr(backend_main, "_WHISPER_STT_URL", "")
    r = client.post(
        "/transcribe",
        files={"audio": ("speech.m4a", _tiny_wav(), "audio/x-m4a")},
    )
    assert r.status_code == 422  # no silent fabricated transcript


def test_transcribe_client_text_wins_over_stt(monkeypatch):
    """When both a client transcript and audio are present, the client text is
    authoritative (no STT call, no double-transcription)."""
    monkeypatch.setattr(backend_main, "_WHISPER_STT_URL", "http://127.0.0.1:8791/inference")
    with patch.object(backend_main, "_whisper_cpp_transcribe") as spy:
        r = client.post(
            "/transcribe",
            data={"text": "dance classes tonight"},
            files={"audio": ("speech.m4a", _tiny_wav(), "audio/x-m4a")},
        )
    assert r.status_code == 200
    body = r.json()
    assert spy.call_count == 0
    assert body["text"] == "dance classes tonight"
    assert body["stt_backend"] == "client_text"
