/**
 * voiceClient — real voice pickup client for the Muse/Meta tool loop.
 *
 * Uploads the expo-audio .m4a recording to the backend `POST /transcribe`
 * endpoint (EXPO_PUBLIC_API_URL, same base the live MCP pin fetch uses),
 * which transcribes the audio with a local whisper.cpp model and routes the
 * resolved text through the pipeline's Muse native tool loop:
 *
 *   voice .m4a  ->  /transcribe  ->  whisper.cpp STT  ->  llm_intent (Muse)
 *               ->  constrained DayPlay tool plan -> zero-hallucination gate
 *               ->  { text, intent, pins }
 *
 * Resolution order on the backend (and mirrored here, offline-first):
 *   1. `text` — the client transcript, when the OS speech stack produced one.
 *   2. multipart `audio` file — real model transcription via whisper.cpp.
 *   3. `audio_base64` — inline audio bytes (fallback transport).
 *
 * No-backend fallback (never a hard blocker): when no backend URL resolves,
 * the query is NOT dropped — it goes straight to the live production
 * DayPlay MCP `search_smart` tool (direct cloud, hackathon credentials,
 * verified live 2026-11-04), which resolves the user's own words into
 * ranked, geo-verified rows. The client zero-hallucination gate still
 * re-validates every pin at render time.
 *
 * The caller decides nothing about correctness: every returned pin has
 * already passed the backend's zero-hallucination gate. On transport
 * failure the helper returns `ok: false` with a human-readable error and
 * the UI routes the raw client transcript (if any) through the normal
 * text-query path — it never invents a query.
 */

import { resolveApiUrl } from "./pinsClient.ts";
import { searchSmartResolve } from "./smartSearchClient.ts";
import type { RawPin } from "../components/PlacardOverlay.tsx";

/** Upload timeout: STT + Muse loop on a local whisper.cpp box is fast, but
 * a cold model load can take a few seconds — fail fast, never hang the UI. */
const TRANSCRIBE_TIMEOUT_MS = 15000;

/** Typed intent filters the Muse model resolves (backend `filters` block). */
export interface VoiceIntent {
  time_window?: string | null;
  radius_min?: number | null;
  neighborhood?: string | null;
  category?: string | null;
  vibe?: string | null;
}

/** Result of a voice pickup + transcription + Muse intent round-trip. */
export interface VoiceTranscribeResult {
  /** True when the backend resolved a transcript + verified pins. */
  ok: boolean;
  /** Final transcribed text (client transcript or backend STT result). */
  text: string;
  /** Whether `text` came from the client speech stack or backend whisper.cpp. */
  sttBackend: "client_text" | "whisper_cpp" | "none";
  /** Typed spatial intent the Muse model resolved for the transcript. */
  intent: VoiceIntent | null;
  /** Gate-verified pins ready for AR render ([] when ok is false). */
  pins: RawPin[];
  /** Human-readable failure note when ok is false. */
  error: string | null;
}

/**
 * Read the backend base URL from EXPO_PUBLIC_API_URL (set in .env or via
 * `EXPO_PUBLIC_API_URL=http://<mac-ip>:8000 npx expo start`). Null when
 * unset — transcribeRecording then falls back to the direct production-MCP
 * `search_smart` path (never a hard blocker).
 */
export function resolveBackendUrl(apiUrl?: string): string | null {
  return resolveApiUrl(apiUrl);
}

/**
 * Send a finished recording to the backend /transcribe endpoint.
 *
 * @param uri local file URI of the expo-audio .m4a recording
 * @param clientText optional client speech transcript (sent as `text`)
 * @param apiUrl optional backend base URL override
 */
export async function transcribeRecording(
  uri: string,
  clientText?: string,
  apiUrl?: string,
): Promise<VoiceTranscribeResult> {
  const base = resolveApiUrl(apiUrl);
  const trimmedClient = (clientText ?? "").trim();
  if (!base) {
    // Direct-cloud fallback: no local backend configured — resolve the
    // user's own query text against the live production MCP instead of
    // blocking. Never a hard error; never a fabricated transcript (only
    // the user's own words are resolved).
    return searchSmartResolve(trimmedClient, undefined, undefined);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  try {
    const form = new FormData();
    form.append("audio", { uri, name: "speech.m4a", type: "audio/m4a" } as unknown as Blob);
    if (trimmedClient.length > 0) {
      form.append("text", trimmedClient);
    }

    const res = await fetch(`${base}/transcribe`, {
      method: "POST",
      signal: controller.signal,
      body: form,
    });

    if (res.status === 422) {
      // Backend could not resolve any text (e.g. whisper.cpp offline and no
      // client transcript) — never fabricates a query on its side either.
      return finish(trimmedClient, "none", null, [], "backend could not transcribe audio (no STT backend reachable)");
    }
    if (!res.ok) {
      return finish(trimmedClient, "none", null, [], `transcribe HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      text?: unknown;
      intent?: unknown;
      pins?: unknown;
      stt_backend?: unknown;
    };
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (text.length === 0) {
      return finish(trimmedClient, "none", null, [], "backend returned empty transcript");
    }

    const intent = isVoiceIntent(data.intent) ? data.intent : null;
    const pins = Array.isArray(data.pins) ? (data.pins as RawPin[]) : [];
    const sttBackend =
      data.stt_backend === "whisper_cpp" ? "whisper_cpp" : data.stt_backend === "client_text" ? "client_text" : "none";

    return finish(text, sttBackend, intent, pins, null);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const aborted = message.includes("abort");
    return finish(trimmedClient, "none", null, [], aborted ? "transcribe timed out" : `transcribe failed: ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

function finish(
  text: string,
  sttBackend: VoiceTranscribeResult["sttBackend"],
  intent: VoiceIntent | null,
  pins: RawPin[],
  error: string | null,
): VoiceTranscribeResult {
  const ok = error === null && text.trim().length > 0;
  return { ok, text, sttBackend, intent, pins: ok ? pins : [], error };
}

function isVoiceIntent(value: unknown): value is VoiceIntent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const strFields = ["time_window", "neighborhood", "category", "vibe"];
  return strFields.every((k) => v[k] === undefined || v[k] === null || typeof v[k] === "string") &&
    (v.radius_min === undefined || v.radius_min === null || typeof v.radius_min === "number");
}
