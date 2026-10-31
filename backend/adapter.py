"""Model adapter layer — swappable providers behind one interface.

Providers:
  meta     -> Muse Spark 1.3 via https://api.meta.ai/v1 (needs META_API_KEY; BLOCKED by Meta key-creation bug as of 2026-10-29)
  baseten  -> muse-spark-open-1026 via Baseten (open-weights; needs BASETEN_API_KEY; credits pending)
  mock     -> deterministic offline responses for simulator dev / tests

Env: MODEL_PROVIDER=meta|baseten|mock, META_API_KEY=..., BASETEN_API_KEY=...,
BASETEN_BASE_URL (optional override).

MUSE-READY TRANSPORT (Task 2): meta/baseten implement the SAME protocol as mock
(parse_intent / run_tools) and share the deterministic DayPlay tool schemas from
dayplay_tools. The HTTP hop is injected as `transport` so unit tests stub it —
no network call ever happens until a real key is present and the operator flips
MODEL_PROVIDER. run_tools() executes a native tool loop: model emits tool_calls,
the pipeline executor (injected) runs them against verified DayPlay data, results
go back as messages, loop until the model answers without tool calls.
"""
import json
import os
from typing import Any, Callable, Dict, List, Optional, Protocol

Transport = Callable[[str, Dict[str, str], Dict[str, Any]], Dict[str, Any]]

META_BASE_URL = "https://api.meta.ai/v1"
META_MODEL = "muse-spark-1.3"
BASETEN_MODEL = "meta-models/muse-spark-open-1026"

INTENT_SYSTEM_PROMPT = (
    "You are the intent parser for DayPlay AR. Convert the user's message into STRICT JSON "
    "with keys: time_window (one of: now, today, tonight), radius_min (integer walking minutes, 1-30), "
    "neighborhood (string or null), category (string or null), vibe (string or null). "
    "Never invent venues, tools, or fields beyond this schema."
)


class IntentProvider(Protocol):
    def parse_intent(self, text: str) -> dict: ...
    def run_tools(self, messages: list, tools: list) -> dict: ...


class MockProvider:
    """Offline provider: keyword parse + canned tool-call plan. 100% deterministic."""
    def parse_intent(self, text: str) -> dict:
        t = text.lower()
        return {
            "time_window": "now" if any(k in t for k in ("now", "live", "tonight")) else "today",
            "radius_min": 10 if "10-min" in t else 15,
            "neighborhood": "mission" if "mission" in t else None,
            "category": "gems" if "gem" in t else None,
            "vibe": "chill" if "chill" in t else None,
        }
    def run_tools(self, messages, tools):
        return {"provider": "mock", "tool_calls": [], "note": "mock: wire to DayPlay tool schemas in pipeline step"}


class MuseChatProvider:
    """Shared Muse transport for meta + baseten. Same protocol as MockProvider.

    `transport` is injectable for unit tests (stubbed, no network). In production
    it posts OpenAI-compatible chat-completions requests; Muse Spark supports
    native tool loops pointed at DayPlay tools (same schemas as fixture mode).
    """
    def __init__(self, provider_name: str, api_key: str, base_url: str, model: str,
                 transport: Optional[Transport] = None):
        if not api_key:
            raise RuntimeError(f"{provider_name} provider: no API key present (blocked status documented in README STATUS). Set the key env to enable.")
        self.provider_name = provider_name
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._transport = transport or self._httpx_transport

    # ---- transport ------------------------------------------------------
    @staticmethod
    def _httpx_transport(url: str, headers: Dict[str, str], payload: Dict[str, Any]) -> Dict[str, Any]:
        import httpx
        r = httpx.post(url, headers=headers, json=payload, timeout=60.0)
        if r.status_code >= 400:
            raise RuntimeError(f"{r.status_code} from model API: {r.text[:300]}")
        return r.json()

    def _post_chat(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        return self._transport(f"{self.base_url}/chat/completions", headers, payload)

    # ---- protocol -------------------------------------------------------
    def parse_intent(self, text: str) -> dict:
        """NL -> typed filters via one chat completion (JSON-mode prompt)."""
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": INTENT_SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0,
        }
        resp = self._post_chat(payload)
        content = resp["choices"][0]["message"]["content"]
        return json.loads(content)

    def run_tools(self, messages: List[dict], tools: List[dict],
                  tool_executor: Optional[Callable[[str, Dict[str, Any]], List[Dict[str, Any]]]] = None,
                  max_iters: int = 4) -> Dict[str, Any]:
        """Native tool loop: model tool_calls -> injected DayPlay executor ->
        tool result messages -> repeat until the model produces a final answer.

        tool_executor comes from pipeline.execute_tool_call — verified data only.
        The model NEVER executes tools itself and never invents tool output.
        """
        if tool_executor is None:
            return {"provider": self.provider_name, "tool_calls": [], "content": None,
                    "note": "no tool_executor injected — returned model tool_calls only"}
        convo = list(messages)
        all_calls: List[Dict[str, Any]] = []
        final_content: Optional[str] = None
        for _ in range(max_iters):
            payload = {"model": self.model, "messages": convo, "tools": tools, "temperature": 0}
            resp = self._post_chat(payload)
            msg = resp["choices"][0]["message"]
            calls = msg.get("tool_calls") or []
            if not calls:
                final_content = msg.get("content")
                break
            convo.append(msg)
            for call in calls:
                fn = call.get("function", {})
                name = fn.get("name", "")
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                result = tool_executor(name, args)
                all_calls.append({"name": name, "args": args})
                convo.append({
                    "role": "tool",
                    "tool_call_id": call.get("id", name),
                    "content": json.dumps(result),
                })
        return {"provider": self.provider_name, "tool_calls": all_calls, "content": final_content}


class MetaMuseProvider(MuseChatProvider):
    """Muse Spark 1.3 via Meta Model API (https://api.meta.ai/v1)."""
    def __init__(self, transport: Optional[Transport] = None):
        super().__init__("meta", os.getenv("META_API_KEY", ""), META_BASE_URL, META_MODEL, transport)


class BasetenMuseProvider(MuseChatProvider):
    """muse-spark-open-1026 (hackathon-specific deployment ID) via Baseten."""
    def __init__(self, transport: Optional[Transport] = None):
        base = os.getenv("BASETEN_BASE_URL", "https://inference.baseten.co/v1")
        super().__init__("baseten", os.getenv("BASETEN_API_KEY", ""), base, BASETEN_MODEL, transport)


def get_provider(name: str | None = None, transport: Optional[Transport] = None):
    name = name or os.getenv("MODEL_PROVIDER", "mock")
    if name == "mock":
        return MockProvider()
    if name == "meta":
        return MetaMuseProvider(transport=transport)
    if name == "baseten":
        return BasetenMuseProvider(transport=transport)
    raise ValueError(f"unknown provider {name}")
