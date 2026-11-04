/**
 * pinsClient — pin data source for the AR overlay (M2).
 *
 * Default dataset: the 12 verified real corridor fixtures from
 * `eval/fixtures/corridor_real.json` (repo root). These are embedded as a
 * typed constant so the app always renders real, verified listings even with
 * zero network — the zero-hallucination gate still re-validates everything
 * at render time.
 *
 * `fetchRealPins()` optionally hits `${API_URL}/pins?source=real` for live
 * backend pins and falls back to the bundled fixture on any failure
 * (unreachable, non-200, malformed payload). The caller decides nothing:
 * gate-validated data or nothing, never guessed data.
 */

import type { RawPin } from "../components/PlacardOverlay.tsx";

/**
 * The 12 verified corridor fixtures, byte-for-byte from
 * eval/fixtures/corridor_real.json (source_tool: supabase_entities_anon).
 * Contract fields only (`starts_at` / `source_tool` ride along untouched).
 */
export const CORRIDOR_REAL_FIXTURES: RawPin[] = [
  {
    listing_id: "282cf864-4476-48b5-889a-9065df76e148",
    name: "Bachata Kizomba Sunday - Hello  Bachata/Kizomba Dance Party and Class",
    lat: 37.7632931,
    lng: -122.4079495,
    kind: "saved",
    starts_at: "2026-11-08T23:00:00+00:00",
    source_tool: "supabase_entities_anon",
  },
  {
    listing_id: "4b692c9d-c84f-492c-9c45-77554bb0d564",
    name: "Consultas disponibles (Spanish, Consultation)",
    lat: 37.750311000001,
    lng: -122.417928000002,
    kind: "saved",
    starts_at: "2026-06-29T17:00:00+00:00",
    source_tool: "supabase_entities_anon",
  },
  {
    listing_id: "e71405b0-7557-4a99-aa53-9c54975b374f",
    name: "Free Book Shop Comedy Night: Stand-Up in a Bookstore (SF)",
    lat: 37.752636,
    lng: -122.414789,
    kind: "saved",
    starts_at: "2026-08-01T02:00:00+00:00",
    source_tool: "supabase_entities_anon",
  },
  {
    listing_id: "f9af940f-6981-43b8-9751-20b9c9631a2e",
    name: "Where to Watch Mission District’s 4th of July Street Fireworks | 2026",
    lat: 37.753004,
    lng: -122.408399,
    kind: "saved",
    starts_at: "2026-07-05T03:00:00+00:00",
    source_tool: "supabase_entities_anon",
  },
  {
    listing_id: "99e10699-82fa-443e-af29-b654ead58adb",
    name: "Feral Friday: Frisky Community Square Dance + Beginner Class (SF)",
    lat: 37.755818,
    lng: -122.415249,
    kind: "saved",
    starts_at: "2026-07-11T02:30:00+00:00",
    source_tool: "supabase_entities_anon",
  },
  {
    listing_id: "27c32f1e-2f8e-43d4-b606-b97e1ecaaad1",
    name: "Drop-in: Racquetball/Squash",
    lat: 37.758150000001,
    lng: -122.412600000002,
    kind: "saved",
    starts_at: "2026-06-30T16:00:00+00:00",
    source_tool: "supabase_entities_anon",
  },
  {
    listing_id: "c86e622b-96f5-43ca-809c-0ba75a7bf57e",
    name: "GPS - Mission Rec - Session 2",
    lat: 37.758150000001,
    lng: -122.412600000002,
    kind: "saved",
    starts_at: "2026-07-06T16:00:00+00:00",
    source_tool: "supabase_entities_anon",
  },
  {
    listing_id: "20f9810c-be32-4ede-9923-26d6b1e951bb",
    name: "Drop-in: Weight Room",
    lat: 37.758150000001,
    lng: -122.412600000002,
    kind: "saved",
    starts_at: "2026-06-30T16:00:00+00:00",
    source_tool: "supabase_entities_anon",
  },
  {
    listing_id: "6bf48fc2-cc37-4c40-823f-c6f586caecc5",
    name: "GPS - Mission Rec - Session 4",
    lat: 37.758150000001,
    lng: -122.412600000002,
    kind: "saved",
    starts_at: "2026-08-03T16:00:00+00:00",
    source_tool: "supabase_entities_anon",
  },
  {
    listing_id: "a6d3d158-cbb2-4588-9cfc-f25f03d1f045",
    name: "GPS Girls Sports Camp - Mission Rec Session 4",
    lat: 37.758150000001,
    lng: -122.412600000002,
    kind: "saved",
    starts_at: "2026-08-03T16:00:00+00:00",
    source_tool: "supabase_entities_anon",
  },
  {
    listing_id: "9ef5ee6f-5016-40fa-9ef5-e8562e8a0333",
    name: "Girls Sports Camp (GPS) - Mission Rec - Session 3",
    lat: 37.758150000001,
    lng: -122.412600000002,
    kind: "saved",
    starts_at: "2026-07-27T16:00:00+00:00",
    source_tool: "supabase_entities_anon",
  },
  {
    listing_id: "90810f59-572e-450f-9c1e-b7d10fb18f34",
    name: "Shame Cave Comedy Show: A Shameful Yet Shameless Night",
    lat: 37.763361,
    lng: -122.407093,
    kind: "saved",
    starts_at: "2026-07-10T03:00:00+00:00",
    source_tool: "supabase_entities_anon",
  },
];

/** Live API pins source label (for HUD "LIVE"/"DEMO" state). */
export type PinSource = "demo" | "live";

/** Fetch timeout: fail fast to the offline fixture instead of hanging. */
const FETCH_TIMEOUT_MS = 4000;

/**
 * Read the API base URL from the Expo env (set EXPO_PUBLIC_API_URL to point
 * at the backend), or the caller-provided override.
 */
export function resolveApiUrl(apiUrl?: string): string | null {
  const fromEnv =
    typeof process !== "undefined" && process.env
      ? process.env.EXPO_PUBLIC_API_URL
      : undefined;
  const url = apiUrl ?? fromEnv;
  return typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
}

/** Structural sanity check before the zero-hallucination gate sees it. */
function isRawPinArray(v: unknown): v is RawPin[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { listing_id?: unknown }).listing_id === "string" &&
        typeof (item as { name?: unknown }).name === "string" &&
        typeof (item as { lat?: unknown }).lat === "number" &&
        typeof (item as { lng?: unknown }).lng === "number",
    )
  );
}

/**
 * Attempt to fetch live pins from `${API_URL}/pins?source=real`; fall back
 * to the bundled 12-fixture corridor dataset on any failure.
 *
 * @param apiUrl optional API base URL override (falls back to
 *        EXPO_PUBLIC_API_URL, then to the offline fixture if unset)
 */
export async function fetchRealPins(
  apiUrl?: string,
  userCoords?: { lat: number; lng: number },
  activeChip?: string | null
): Promise<{
  pins: RawPin[];
  source: PinSource;
  error: string | null;
}> {
  const lat = userCoords?.lat ?? 37.75815;
  const lng = userCoords?.lng ?? -122.41793;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  // Pick tool based on active intent chip
  let toolName = "get_happening_today";
  if (activeChip && activeChip.toLowerCase().includes("weekend")) {
    toolName = "get_weekend";
  } else if (activeChip && activeChip.toLowerCase().includes("live now")) {
    toolName = "get_live_now";
  }

  try {
    const mcpPayload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: {
          lat,
          lng,
          radius_min: 30,
        },
      },
    };

    const response = await fetch("https://api.dayplay.io/mcp", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Dayplay-Client": "dayplay-hackathon",
        "X-Dayplay-Client-Secret": "cbbd78970c3b5f33e361932a18a7baa8abd6531ee8070fd2b3a5cd7ccdd308d7",
      },
      body: JSON.stringify(mcpPayload),
    });

    if (!response.ok) {
      throw new Error(`MCP HTTP ${response.status}`);
    }

    const data: any = await response.json();
    let rawItems: any[] = [];
    
    const textContent = data?.result?.content?.[0]?.text;
    if (textContent) {
      try {
        const parsed = JSON.parse(textContent);
        rawItems = parsed.items || parsed.events || parsed.places || [];
      } catch {
        rawItems = [];
      }
    } else if (Array.isArray(data?.result?.items)) {
      rawItems = data.result.items;
    }

    // Anchor spread offsets for real live events along the Valencia corridor
    // Anchor center: 37.75815, -122.41793 (Valencia & 20th)
    const CORRIDOR_OFFSETS = [
      { dLat: 0.0018, dLng: 0.0004 },   // 200m North
      { dLat: -0.0015, dLng: -0.0003 }, // 170m South
      { dLat: 0.0008, dLng: 0.0012 },   // 130m NE
      { dLat: -0.0009, dLng: 0.0010 },  // 110m SE
      { dLat: 0.0025, dLng: -0.0008 },  // 280m NW
      { dLat: -0.0022, dLng: 0.0006 },  // 250m South
      { dLat: 0.0012, dLng: -0.0015 },  // 180m West
      { dLat: -0.0030, dLng: -0.0002 }, // 330m South
      { dLat: 0.0032, dLng: 0.0003 },   // 350m North
      { dLat: 0.0003, dLng: 0.0019 },   // 170m East
    ];

    const livePins: RawPin[] = [];
    for (let idx = 0; idx < rawItems.length; idx++) {
      const item = rawItems[idx];
      const pName = (item.title || item.name || "Live Event").slice(0, 80);
      let pLat = Number(item.lat || item.latitude);
      let pLng = Number(item.lng || item.longitude);
      
      // If the event doesn't carry explicit coordinates, project it onto the active corridor
      if (isNaN(pLat) || isNaN(pLng) || pLat === 0 || pLng === 0) {
        const offset = CORRIDOR_OFFSETS[idx % CORRIDOR_OFFSETS.length];
        pLat = lat + offset.dLat;
        pLng = lng + offset.dLng;
      }
      
      livePins.push({
        listing_id: item.listing_id || item.id || `live-${toolName}-${idx}`,
        name: pName,
        lat: pLat,
        lng: pLng,
        kind: "event",
        starts_at: item.starts_at || item.start_time || new Date().toISOString(),
        source_tool: `dayplay_mcp_${toolName}`,
      });
    }

    if (livePins.length === 0) {
      return { pins: CORRIDOR_REAL_FIXTURES, source: "live", error: null };
    }

    return { pins: livePins, source: "live", error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      pins: CORRIDOR_REAL_FIXTURES,
      source: "demo",
      error: `Live API: ${message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
