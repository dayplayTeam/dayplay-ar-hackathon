/**
 * smartSearchClient — direct-cloud voice/text intent resolution.
 *
 * When no local backend URL is configured (EXPO_PUBLIC_API_URL unset — the
 * Expo Go demo default), voice queries resolve DIRECTLY against the live
 * DayPlay MCP at `https://api.dayplay.io/mcp` using the hackathon client
 * credentials (verified live 2026-11-04):
 *
 *   text -> search_smart (natural-language -> ranked rows + coords)
 *        -> mapMcpItemsToPins (bearing-preserving corridor map)
 *        -> returned pins are still re-validated by the client
 *           zero-hallucination gate at render time.
 *
 * No invented data: the query text is the user's own speech (or preset
 * chip); pins come only from the production catalog with verified geo.
 */

import {
  DAYPLAY_MCP_HEADERS,
  DAYPLAY_MCP_URL,
  mapMcpItemsToPins,
  parseMcpItems,
} from "./pinsClient.ts";
import type { VoiceIntent, VoiceTranscribeResult } from "./voiceClient.ts";
import type { RawPin } from "../components/PlacardOverlay.tsx";

/** Direct-cloud resolve timeout: search_smart measured ~4 s live; fail fast. */
const SEARCH_TIMEOUT_MS = 12000;

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

/**
 * Resolve a spoken/typed query through the live production MCP `search_smart`
 * (direct cloud — no local backend required).
 *
 * @param query the user's own words (voice preset, client transcript, typed query)
 * @param userCoords device/anchor position for personalized ranking
 * @param apiUrl optional MCP base URL override (tests only; production is
 *        always DAYPLAY_MCP_URL — EXPO_PUBLIC_API_URL deliberately does NOT
 *        redirect this path, it only configures the local backend /transcribe)
 */
export async function searchSmartResolve(
  query: string,
  userCoords?: { lat: number; lng: number },
  apiUrl?: string,
): Promise<VoiceTranscribeResult> {
  const text = query.trim();
  if (text.length === 0) {
    return finish("", "none", null, [], "empty query");
  }
  const lat = userCoords?.lat ?? 37.75815;
  const lng = userCoords?.lng ?? -122.41793;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const payload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: "search_smart",
        arguments: { query: text, user_lat: lat, user_lng: lng, radius_km: 20, max_results: 12 },
      },
    };
    const base = apiUrl && apiUrl.trim().length > 0 ? apiUrl.trim() : DAYPLAY_MCP_URL;
    const res = await fetch(base, {
      method: "POST",
      signal: controller.signal,
      headers: DAYPLAY_MCP_HEADERS,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return finish(text, "none", null, [], `direct cloud search HTTP ${res.status}`);
    }
    const data: unknown = await res.json();
    const items = parseMcpItems(data);
    const pins = mapMcpItemsToPins(items, lat, lng);
    // stt_backend "client_text": the query is the user's own words (no
    // server STT ran — search_smart resolved them straight to verified rows).
    return finish(text, "client_text", null, pins, null);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const aborted = message.includes("abort");
    return finish(text, "none", null, [], aborted ? "direct cloud search timed out" : `direct cloud search failed: ${message}`);
  } finally {
    clearTimeout(timer);
  }
}

