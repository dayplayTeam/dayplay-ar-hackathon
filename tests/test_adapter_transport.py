"""Muse-ready transport tests — stubbed transports, ZERO network calls."""
import json
import sys
from pathlib import Path
REPO = Path(__file__).parent.parent
sys.path.insert(0, str(REPO))

import pytest

from backend.adapter import (BASETEN_MODEL, META_MODEL, MockProvider,
                             MuseChatProvider, get_provider)
from backend.dayplay_tools import tool_schemas


def stub_transport_factory(responses):
    """Records (url, headers, payload); pops scripted responses. No network."""
    calls = []
    def transport(url, headers, payload):
        calls.append({"url": url, "headers": {k: ("***" if k == "Authorization" else v) for k, v in headers.items()}, "payload": payload})
        return responses.pop(0)
    return transport, calls


def test_meta_provider_intent_json_stubbed(monkeypatch):
    monkeypatch.setenv("META_API_KEY", "test-key-not-real")
    resp = {"choices": [{"message": {"content": json.dumps({"time_window": "now", "radius_min": 10, "neighborhood": "mission", "category": None, "vibe": None})}}]}
    transport, calls = stub_transport_factory([resp])
    p = get_provider("meta", transport=transport)
    f = p.parse_intent("what's live now near mission?")
    assert f["time_window"] == "now" and f["radius_min"] == 10
    assert calls[0]["url"].endswith("/chat/completions")
    assert calls[0]["payload"]["model"] == META_MODEL
    assert calls[0]["headers"]["Authorization"] == "***"  # key never leaked in test artifacts


def test_run_tools_native_loop_stubbed(monkeypatch):
    monkeypatch.setenv("BASETEN_API_KEY", "test-key-not-real")
    tool_call_msg = {"role": "assistant", "tool_calls": [
        {"id": "c1", "function": {"name": "live_now", "arguments": json.dumps({"lat": 37.7601, "lng": -122.4198, "radius_min": 10})}}]}
    final_msg = {"role": "assistant", "content": "2 verified pins"}
    responses = [
        {"choices": [{"message": tool_call_msg}]},
        {"choices": [{"message": final_msg}]},
    ]
    transport, calls = stub_transport_factory(responses)
    p = get_provider("baseten", transport=transport)

    executed = []
    def fake_executor(name, args):
        executed.append((name, args))
        return [{"listing_id": "verified-by-pipeline", "distance_m": 120}]

    tools = tool_schemas()
    assert {t["function"]["name"] for t in tools} >= {"live_now", "happening_today", "nearby"}
    outcome = p.run_tools(messages=[{"role": "user", "content": "what's live now?"}], tools=tools, tool_executor=fake_executor)
    assert outcome["provider"] == "baseten"
    assert outcome["tool_calls"][0]["name"] == "live_now"
    assert outcome["content"] == "2 verified pins"
    # tool result went back as a tool message
    second_payload = calls[1]["payload"]
    assert any(m.get("role") == "tool" for m in second_payload["messages"])
    assert executed and executed[0][0] == "live_now"
    assert calls[1]["payload"]["model"] == BASETEN_MODEL


def test_blocked_providers_raise_without_key(monkeypatch):
    monkeypatch.delenv("META_API_KEY", raising=False)
    monkeypatch.delenv("BASETEN_API_KEY", raising=False)
    with pytest.raises(RuntimeError):
        get_provider("meta")
    with pytest.raises(RuntimeError):
        get_provider("baseten")


def test_mock_provider_still_deterministic():
    p = get_provider("mock")
    assert isinstance(p, MockProvider)
    assert p.parse_intent("live now")["time_window"] == "now"
