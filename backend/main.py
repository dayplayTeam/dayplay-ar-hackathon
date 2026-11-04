"""FastAPI surface for the AR client. Run: uvicorn backend.main:app --reload"""
import base64
import os
from pathlib import Path
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .adapter import get_provider
from .validator import load_pins
from .pipeline import run_pipeline, load_ground_truth
from .grounding import ground_image

app = FastAPI(title="DayPlay AR Hackathon Pipeline")

_REPO = Path(__file__).parent.parent
FIXTURES = {
    "real": _REPO / "eval" / "fixtures" / "corridor_real.json",
    "synthetic": _REPO / "eval" / "fixtures" / "corridor.json",
}

class AskBody(BaseModel):
    text: str
    source: str = "real"          # ground-truth fixture: real | synthetic
    ground_backend: Optional[str] = None  # BONUS: "mock" attaches mock grounding

def _pins_response(source: str) -> dict:
    path = FIXTURES[source]
    valid, drops = load_pins(str(path))
    if not path.exists():
        return {"pins": [], "source": source, "note": f"fixture missing: {path.name} — generate eval/fixtures/corridor_real.json (see README)"}
    notes = {
        "real": "pins sourced from DayPlay Supabase entities (anon REST, status=published), validated zero-hallucination gate",
        "synthetic": "DEV-ONLY synthetic fixtures (FIX-SYN-*), schema demos, never ship in demo video",
    }
    note = notes[source]
    if drops:
        note += f" | {len(drops)} dropped by validator"
    return {"pins": valid, "source": source, "note": note}

@app.get("/health")
def health():
    import os
    return {"ok": True, "provider": os.getenv("MODEL_PROVIDER", "mock"),
            "provider_mode": os.getenv("DAYPLAY_PROVIDER_MODE", "fixture")}

@app.post("/intent")
def intent(body: dict):
    from .pipeline import llm_intent
    return llm_intent(body.get("text", ""))

@app.get("/pins")
def pins(source: str = Query("real", pattern="^(real|synthetic)$")):
    """Returns validator-passed spatial pins from DayPlay data.

    source=real      -> eval/fixtures/corridor_real.json (DayPlay Supabase, anon REST)
    source=synthetic -> eval/fixtures/corridor.json (FIX-SYN-* dev-only schema demos)

    BLOCKED (not needed for pins anymore): DayPlay MCP auth (trustedClientSecret
    provisioning) — anon Supabase REST covers pin sourcing; see docs/spatial-contract.md.
    Every pin returned has passed validator.validate_pin — zero-hallucination gate.
    """
    return _pins_response(source)

@app.post("/pipeline")
def pipeline(body: AskBody):
    """Task-2 pipeline end-to-end (mock provider, fixture ground truth):
    intent -> constrained DayPlay tool plan -> pin resolution -> zero-hallucination gate.
    Every pin's listing_id is re-verified against the validator-passed ground truth
    on every run; anything else is dropped and recorded in `drops`."""
    source = body.source if body.source in FIXTURES else "real"
    return run_pipeline(body.text, str(FIXTURES[source]))

# ------------------------------------------------------------------ audio STT
# Voice -> text resolution order (deterministic, offline-first):
#   1. client_text   — Expo speech-to-text client transcript (authoritative).
#   2. whisper_cpp   — local whisper.cpp server (WHISPER_STT_URL; native
#                      /inference or OpenAI /v1/audio/transcriptions wire
#                      format) on the uploaded .m4a — real model
#                      transcription, zero network egress.
#   3. audio_base64  — inline WAV/PCM bytes, same whisper.cpp path.
# Never fabricates: if no text source resolves, the request fails with 422
# and a diagnostic — no canned "live music and drinks tonight" placeholder
# can masquerade as a transcription.
_WHISPER_STT_URL = os.getenv("WHISPER_STT_URL", "").strip()
_WHISPER_STT_MODEL = os.getenv("WHISPER_STT_MODEL", "whisper-1")
_FAKE_STT_MODELS = {"", "none", "mock", "stub"}


def _decode_audio_to_wav(raw: bytes) -> Optional[bytes]:
    """Decode an uploaded recording (m4a/aac/wav/mp3) to 16 kHz mono WAV
    bytes — the format the local whisper.cpp server accepts. Uses ffmpeg
    (macOS dev machines ship it via homebrew); returns None when ffmpeg is
    unavailable or the bytes are not decodable audio."""
    import shutil
    import subprocess
    import tempfile
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as src:
        src.write(raw)
        src_path = src.name
    wav_path = src_path + ".wav"
    try:
        proc = subprocess.run(
            [ffmpeg, "-y", "-i", src_path, "-ar", "16000", "-ac", "1",
             "-c:a", "pcm_s16le", wav_path],
            capture_output=True, timeout=30,
        )
        if proc.returncode != 0 or not Path(wav_path).exists():
            return None
        return Path(wav_path).read_bytes()
    except (subprocess.SubprocessError, OSError):
        return None
    finally:
        try:
            Path(src_path).unlink(missing_ok=True)
        except OSError:
            pass


def _whisper_cpp_transcribe(raw: bytes, filename: str) -> Optional[str]:
    """Post audio to the local whisper.cpp server and return the transcript
    text. Accepts both wire formats, detected from the configured URL:
      - whisper.cpp native:  POST <url>/inference  {file, temperature,
        response_format} (whisper-server's documented dialect)
      - OpenAI-compatible:   POST <url>            {file, model}
        (works with whisper.cpp's OpenAI-drop-in builds and vLLM-style
        servers; `model` is only sent when a non-fake name is configured)
    Returns None on any failure (offline server, decode error, empty
    transcript) — the caller decides the next fallback, and no exception
    ever escapes with fabricated content."""
    if not _WHISPER_STT_URL or _WHISPER_STT_MODEL.lower() in _FAKE_STT_MODELS and "/inference" not in _WHISPER_STT_URL:
        return None
    import httpx
    wav = _decode_audio_to_wav(raw)
    if not wav:
        return None
    native = "/inference" in _WHISPER_STT_URL
    url = _WHISPER_STT_URL if native else _WHISPER_STT_URL.rstrip("/")
    try:
        if native:
            resp = httpx.post(
                url,
                files={"file": (filename or "speech.wav", wav, "audio/wav")},
                data={"temperature": "0.0", "response_format": "json"},
                timeout=60.0,
            )
        else:
            resp = httpx.post(
                url,
                files={"file": (filename or "speech.wav", wav, "audio/wav")},
                data={"model": _WHISPER_STT_MODEL},
                timeout=60.0,
            )
    except (httpx.HTTPError, OSError):
        return None
    if resp.status_code >= 400:
        return None
    try:
        text = str(resp.json().get("text", "")).strip()
    except ValueError:
        return None
    return text or None


@app.post("/transcribe")
def transcribe_speech(
    text: Optional[str] = Form(None, alias="text"),
    audio_base64: Optional[str] = Form(None, alias="audio_base64"),
    audio: Optional[UploadFile] = File(None),
    source: str = Form("real", alias="source"),
):
    """Real voice pickup -> Muse spatial-intent loop.

    Accepts (any combination, resolved in priority order):
      - multipart `audio` file (the Expo client's expo-av .m4a recording)
      - `audio_base64` inline audio (WAV/PCM or any ffmpeg-decodable format)
      - `text` — an already-transcribed client transcript (skips STT)

    The resolved text runs through the pipeline's Muse tool loop
    (llm_intent -> constrained DayPlay tool plan -> zero-hallucination pin
    gate) and returns `{ text, intent, pins }`. `intent` is the typed filter
    contract the Muse model resolved ({time_window, radius_min, neighborhood,
    category, vibe}); `pins` are gate-verified spatial pins ready for AR
    render. If no text resolves from any source, returns 422 — never a
    fabricated query.
    """
    source = source if source in FIXTURES else "real"
    client_text = (text or "").strip()
    transcript = client_text
    stt_backend = "client_text" if client_text else None
    notes: List[str] = []

    if not transcript and audio is not None:
        raw = audio.file.read()
        if raw:
            transcript = (_whisper_cpp_transcribe(raw, audio.filename or "speech.m4a") or "").strip() or None
            if transcript:
                stt_backend = f"whisper_cpp:{_WHISPER_STT_MODEL}"
            else:
                notes.append("whisper.cpp server unavailable or empty transcript")

    if not transcript and audio_base64:
        try:
            raw = base64.b64decode(audio_base64, validate=False)
        except (ValueError, TypeError):
            raw = b""
        if raw:
            transcript = (_whisper_cpp_transcribe(raw, "speech_inline.m4a") or "").strip() or None
            if transcript:
                stt_backend = f"whisper_cpp:{_WHISPER_STT_MODEL}"
            else:
                notes.append("whisper.cpp server unavailable or empty transcript")

    if not transcript:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "no_resolvable_text",
                "note": ("no transcribable audio and no client text; start the local "
                         "whisper.cpp server and set WHISPER_STT_URL, or send `text`"),
                "stt_backends_tried": notes,
            },
        )

    pipeline_res = run_pipeline(transcript, str(FIXTURES[source]))
    return {
        "text": transcript,
        "intent": pipeline_res.get("filters", {}),
        "pins": pipeline_res.get("pins", []),
        "provider": pipeline_res.get("provider"),
        "stt_backend": stt_backend,
        "zero_hallucination_assert": pipeline_res.get("zero_hallucination_assert"),
    }

@app.post("/ask")
def ask(body: AskBody):
    """Client-friendly alias of /pipeline. Adds the BONUS grounding layer (mock
    backend only while sam-3.1/muse-image keys are blocked) and a sim-ready
    placard summary."""
    source = body.source if body.source in FIXTURES else "real"
    result = run_pipeline(body.text, str(FIXTURES[source]))
    if body.ground_backend:
        result["grounding"] = ground_image("frame-0", result["pins"], backend=body.ground_backend)
    result["placards"] = [
        {"listing_id": p["listing_id"], "name": p["name"], "distance_m": p["distance_m"],
         "freshness": p["freshness"]} for p in result["pins"]]
    return result

# Static mounts so the sim runs from the same origin (no CORS, relative ../eval fetch works).
_SIM = _REPO / "sim"
_EVAL = _REPO / "eval"
if _SIM.exists():
    app.mount("/sim", StaticFiles(directory=str(_SIM)), name="sim")
if _EVAL.exists():
    app.mount("/eval", StaticFiles(directory=str(_EVAL)), name="eval")
