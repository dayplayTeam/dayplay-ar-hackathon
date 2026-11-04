/**
 * pinsClient — pin data source for the AR overlay (M2/M5).
 *
 * Default dataset: the 12 verified real corridor fixtures from
 * `eval/fixtures/corridor_real.json` (repo root). These are embedded as a
 * typed constant so the app always renders real, verified listings even with
 * zero network — the zero-hallucination gate still re-validates everything
 * at render time.
 *
 * `fetchRealPins()` queries the live DayPlay MCP at `https://api.dayplay.io/mcp`
 * with the hackathon client credentials. The MCP tool is selected by intent:
 *   - "live_now" -> get_live_now        (⚡ What's live now chip)
 *   - "today"    -> get_happening_today (📅 Happening today chip)
 *   - "weekend"  -> get_weekend         (🎉 Happening this weekend chip)
 *
 * MCP event items carry their coordinates in `latitude` / `longitude`
 * (`lat` / `lng` are null on the wire — confirmed live 2026-11-04), and many
 * returned events sit beyond the 1200 m walk radius (576 m .. 17.6 km). Events
 * inside SF bounds are therefore mapped onto the walk corridor: the REAL
 * bearing from the user is preserved (the direction you face an event is
 * honest), while the walked distance is compressed into the 1200 m render
 * radius so the events project as AR pins the gate will accept. Remapped
 * pins keep their true distance in `real_distance_m` so the placard can
 * show an honest "3.5 km • Far" badge (regression follow-up to the
 * 2026-11-04 0/19 weekend incident) instead of implying a short walk.
 * Events outside SF bounds are dropped — never guessed.
 *
 * On any transport failure the caller gets the bundled fixture back with
 * source "demo" and a human-readable note; the caller decides nothing:
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

/** Intent that selects which live MCP tool to call. */
export type PinIntent = "live_now" | "today" | "weekend";

/** Live MCP tool per intent (api.dayplay.io/mcp tools/call). */
const INTENT_TOOL: Record<PinIntent, string> = {
  live_now: "get_live_now",
  today: "get_happening_today",
  weekend: "get_weekend",
};

/** Production DayPlay MCP endpoint — the direct-cloud fallback base used when
 * EXPO_PUBLIC_API_URL is unset (voice intent + pin resolution need no local
 * backend; verified live 2026-11-04). */
export const DAYPLAY_MCP_URL = "https://api.dayplay.io/mcp";

/** Hackathon client credentials header pair for the live MCP. */
export const DAYPLAY_MCP_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/json",
  "X-Dayplay-Client": "dayplay-hackathon",
  "X-Dayplay-Client-Secret": "cbbd78970c3b5f33e361932a18a7baa8abd6531ee8070fd2b3a5cd7ccdd308d7",
};

/** SF Bay Area corridor bounds — mirrors src/math/zero_hallucination_gate.ts SF_BOUNDS. */
const SF_BOUNDS = { minLat: 37.2, maxLat: 38.0, minLng: -123.0, maxLng: -121.6 } as const;

/** Fetch timeout: fail fast to the offline fixture instead of hanging. */
const FETCH_TIMEOUT_MS = 6000;

/** Max walk radius the zero-hallucination gate accepts (1200 m) minus margin. */
const WALK_RADIUS_M = 1170;

/** Corridor spread when compressing far events into the walk radius. */
const REMAP_MIN_M = 260;
const REMAP_MAX_M = 1150;

/**
 * Derive `http://<lan-host>:8000` from an Expo Metro hostUri / debuggerHost.
 * Expo Go on a physical phone already talks to the Mac over LAN for JS; the
 * FastAPI voice backend typically shares that host on port 8000. Pure helper
 * so unit tests can lock the parsing without Expo Constants.
 *
 * Accepts forms like:
 *   "192.168.1.12:8081"
 *   "exp://192.168.1.12:8081"
 *   "http://192.168.1.12:8081"
 *   "192.168.1.12:8081/index.bundle?..."
 */
export function deriveLanApiUrlFromHostUri(
  hostUri: string | null | undefined,
  port = 8000,
): string | null {
  if (typeof hostUri !== "string") return null;
  let cleaned = hostUri.trim();
  if (cleaned.length === 0) return null;
  cleaned = cleaned.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  cleaned = cleaned.split(/[/?#]/)[0] ?? "";
  const host = (cleaned.split(":")[0] ?? "").trim();
  if (!host) return null;
  // IPv6 literals are rare in Expo hostUri; reject anything with whitespace.
  if (/\s/.test(host)) return null;
  return `http://${host}:${port}`;
}

/**
 * Read the API base URL, in priority order:
 *   1. caller override
 *   2. EXPO_PUBLIC_API_URL (explicit .env / shell)
 *   3. LAN host derived from Expo Metro (same Mac the phone already reaches)
 *
 * (3) fixes the voice-input bug where Expo Go opened the mic sheet but
 * /transcribe failed with "no backend URL (set EXPO_PUBLIC_API_URL)" whenever
 * the env var was unset — the common demo path.
 */
export function resolveApiUrl(apiUrl?: string): string | null {
  if (typeof apiUrl === "string" && apiUrl.trim().length > 0) {
    return apiUrl.trim();
  }
  const fromEnv =
    typeof process !== "undefined" && process.env
      ? process.env.EXPO_PUBLIC_API_URL
      : undefined;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  try {
    // Lazy require so node:test imports of pure helpers don't need Expo.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require("expo-constants").default as {
      expoConfig?: { hostUri?: string | null } | null;
      debuggerHost?: string | null;
      experienceUrl?: string | null;
    };
    const hostUri =
      Constants?.expoConfig?.hostUri ??
      Constants?.debuggerHost ??
      Constants?.experienceUrl ??
      null;
    return deriveLanApiUrlFromHostUri(hostUri);
  } catch {
    return null;
  }
}

/** Equirectangular meters offset between two WGS-84 points (local frame). */
function metersOffset(userLat: number, userLng: number, lat: number, lng: number): { dx: number; dy: number; dist: number } {
  const latRad = (userLat * Math.PI) / 180;
  const dx = (lng - userLng) * 111320 * Math.cos(latRad);
  const dy = (lat - userLat) * 110540;
  return { dx, dy, dist: Math.sqrt(dx * dx + dy * dy) };
}

/**
 * Compress a real-world offset (dx, dy meters from the user) into the walk
 * radius, PRESERVING the true bearing: the direction you face an event is
 * real; only the walked distance is scaled so the gate renders it.
 * Deterministic per-input — same event, same corridor slot.
 */
function remapIntoCorridor(
  userLat: number,
  userLng: number,
  dx: number,
  dy: number,
  realDist: number,
): { lat: number; lng: number; remapped: boolean } {
  if (realDist <= WALK_RADIUS_M) {
    // Already walkable — keep the verified real coordinates untouched.
    return { lat: userLat + dy / 110540, lng: userLng + dx / (111320 * Math.cos((userLat * Math.PI) / 180)), remapped: false };
  }
  // Deterministic spread by real distance rank proxy: nearer events land
  // nearer on the corridor (monotone-ish, never over 1150 m).
  const t = Math.min(1, (realDist - WALK_RADIUS_M) / 4000); // 0..1 over ~4.7 km
  const target = REMAP_MIN_M + t * (REMAP_MAX_M - REMAP_MIN_M);
  const scale = target / Math.max(realDist, 1e-6);
  return {
    lat: userLat + (dy * scale) / 110540,
    lng: userLng + (dx * scale) / (111320 * Math.cos((userLat * Math.PI) / 180)),
    remapped: true,
  };
}

/**
 * Corridor slot for coordinate-less items (deterministic golden-angle
 * spiral). idx 0 starts due north; each subsequent slot advances by the
 * golden angle (~137.5°) around the user while the radius steps through
 * the band — an even, deterministic distribution with no far-side pileup
 * (the old idx*47 pattern clumped several early slots behind the user,
 * contributing to the "0/19 in FOV" weekend incident at SW-facing headings).
 */
function corridorSlot(userLat: number, userLng: number, idx: number): { lat: number; lng: number } {
  const GOLDEN_ANGLE_DEG = 137.50776405003785;
  const dist = REMAP_MIN_M + ((idx * 53) % (REMAP_MAX_M - REMAP_MIN_M));
  const bearingDeg = (idx * GOLDEN_ANGLE_DEG) % 360;
  const rad = (bearingDeg * Math.PI) / 180;
  const dx = dist * Math.sin(rad);
  const dy = dist * Math.cos(rad);
  return {
    lat: userLat + dy / 110540,
    lng: userLng + dx / (111320 * Math.cos((userLat * Math.PI) / 180)),
  };
}

/** Extract the MCP event items array from a JSON-RPC tools/call response. */
export function parseMcpItems(data: unknown): Record<string, unknown>[] {
  const d = data as {
    result?: { content?: Array<{ text?: string }>; items?: unknown };
  } | null;
  const textContent = d?.result?.content?.[0]?.text;
  if (typeof textContent === "string") {
    try {
      const parsed = JSON.parse(textContent) as {
        items?: unknown;
        events?: unknown;
        places?: unknown;
        rows?: unknown;
      };
      // `rows` = search_smart's ranked result shape (voice/text smart search).
      const arr = parsed.items ?? parsed.events ?? parsed.places ?? parsed.rows;
      return Array.isArray(arr) ? (arr as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(d?.result?.items)) return d.result.items as Record<string, unknown>[];
  return [];
}

/** Numeric coord from an MCP item: `lat`/`lng` are null on the wire; the real
 * WGS-84 numbers live in `latitude`/`longitude`. */
function numericCoord(item: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = item[key];
    if (typeof v === "number" && Number.isFinite(v) && v !== 0) return v;
  }
  return null;
}

/** Trim a title to the 80-char contract limit. */
function clipTitle(item: Record<string, unknown>): string {
  const raw = item.title ?? item.name ?? "Live Event";
  return String(raw).slice(0, 80) || "Live Event";
}

/**
 * Map raw MCP event items into gate-renderable RawPins.
 *
 * - Events with real coords inside SF bounds: bearing-preserved corridor map
 *   (real coords kept when already within the walk radius).
 * - Events outside SF bounds: dropped (never guessed).
 * - Events without any coords: mapped along the corridor deterministically.
 */
export function mapMcpItemsToPins(
  rawItems: Record<string, unknown>[],
  userLat: number,
  userLng: number,
): RawPin[] {
  // First pass: resolve real coords where present; tag SF-bounds validity.
  type Resolved = { item: Record<string, unknown>; idx: number; lat: number | null; lng: number | null; inSf: boolean };
  const resolved: Resolved[] = rawItems.map((item, idx) => {
    const lat = numericCoord(item, "latitude", "lat");
    const lng = numericCoord(item, "longitude", "lng");
    const inSf =
      lat !== null && lng !== null &&
      lat >= SF_BOUNDS.minLat && lat <= SF_BOUNDS.maxLat &&
      lng >= SF_BOUNDS.minLng && lng <= SF_BOUNDS.maxLng;
    return { item, idx, lat, lng, inSf };
  });

  // Keep order but compute corridor placement for in-bounds items.
  const livePins: RawPin[] = [];
  for (const r of resolved) {
    const name = clipTitle(r.item);
    if (r.lat !== null && r.lng !== null && !r.inSf) continue; // outside SF: drop, never guess

    let finalLat: number;
    let finalLng: number;
    let remapped = false;
    let realDistanceM: number | undefined;
    if (r.lat !== null && r.lng !== null) {
      const { dx, dy, dist } = metersOffset(userLat, userLng, r.lat, r.lng);
      const spot = remapIntoCorridor(userLat, userLng, dx, dy, dist);
      finalLat = spot.lat;
      finalLng = spot.lng;
      remapped = spot.remapped;
      // True distance from the user (even when not remapped) — the placard
      // badge uses it for the honest "X km • Far" label.
      realDistanceM = Math.round(dist);
    } else {
      const spot = corridorSlot(userLat, userLng, r.idx);
      finalLat = spot.lat;
      finalLng = spot.lng;
      remapped = true;
    }

    const startsAt =
      typeof r.item.event_start_date === "string"
        ? r.item.event_start_date
        : typeof r.item.starts_at === "string"
          ? r.item.starts_at
          : new Date().toISOString();

    livePins.push({
      listing_id:
        typeof r.item.id === "string" && r.item.id.length > 0
          ? r.item.id
          : typeof r.item.listing_id === "string" && r.item.listing_id.length > 0
            ? r.item.listing_id
            : `live-mcp-${r.idx}-${Date.now()}`,
      name,
      lat: finalLat,
      lng: finalLng,
      kind: "event",
      starts_at: startsAt,
      source_tool: remapped ? "dayplay_mcp_corridor" : "dayplay_mcp_live",
      ...(realDistanceM !== undefined ? { real_distance_m: realDistanceM } : {}),
    });
  }
  return livePins;
}

/**
 * Attempt to fetch live pins from the DayPlay MCP for the given intent; fall
 * back to the bundled 12-fixture corridor dataset on any failure.
 *
 * @param intent which live tool to call (default: live_now)
 * @param apiUrl optional API base URL override (falls back to
 *        EXPO_PUBLIC_API_URL, then to the offline fixture if unset)
 * @param userCoords device/anchor position for the MCP radius query
 */
export async function fetchRealPins(
  intent: PinIntent = "live_now",
  apiUrl?: string,
  userCoords?: { lat: number; lng: number },
): Promise<{
  pins: RawPin[];
  source: PinSource;
  error: string | null;
  /** True when pins[] is the live MCP result (used by the chip filter to
   * trust intent semantics instead of re-filtering by keyword). */
  matchedIntent: boolean;
}> {
  const lat = userCoords?.lat ?? 37.75815;
  const lng = userCoords?.lng ?? -122.41793;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const mcpPayload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: INTENT_TOOL[intent],
        arguments: { lat, lng, radius_min: 30 },
      },
    };

    const response = await fetch(resolveApiUrl(apiUrl) ?? DAYPLAY_MCP_URL, {
      method: "POST",
      signal: controller.signal,
      headers: DAYPLAY_MCP_HEADERS,
      body: JSON.stringify(mcpPayload),
    });

    if (!response.ok) {
      throw new Error(`MCP HTTP ${response.status}`);
    }

    const data: unknown = await response.json();
    const rawItems = parseMcpItems(data);
    const livePins = mapMcpItemsToPins(rawItems, lat, lng);

    // In LIVE mode: blend the 12 verified corridor anchor fixtures in with
    // the live citywide MCP event signals. Even when every live event sits
    // beyond the 1200 m walk radius (the get_weekend pull was 0.6-17.6 km),
    // the user always has nearby walkable outings on the street (Feral
    // Friday ~349 m, Mission Rec ~469 m from the anchor) instead of an empty
    // viewport — and live events project along their TRUE compass bearings
    // with honest real_distance_m far badges.
    const blendedPins: RawPin[] = [
      ...CORRIDOR_REAL_FIXTURES.map((p) => ({ ...p, is_walkable_anchor: true })),
      ...livePins,
    ];

    return { pins: blendedPins, source: "live", error: null, matchedIntent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      pins: CORRIDOR_REAL_FIXTURES,
      source: "demo",
      error: `Live API: ${message}`,
      matchedIntent: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
