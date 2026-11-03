/**
 * format.ts — shared display formatters for the AR overlay and HUD.
 *
 * Pure functions, no React dependency, so they can be unit-tested and reused
 * by both the placard deck and the HUD.
 */

/** Compass cardinal sector names, 8-wind rose, indexed by heading/45. */
const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** "42" -> "042", "7.4" -> "007" — fixed-width compass badge. */
export function formatBearing(bearingDeg: number): string {
  const deg = Math.round(((bearingDeg % 360) + 360) % 360) % 360;
  return `${String(deg).padStart(3, "0")}°`;
}

/**
 * Heading + cardinal sector for the HUD compass chip: 96 -> "096° E".
 * Sector width = 45°, sector center at 22.5° offsets (so 0-22 -> N,
 * 22-67 -> NE, 67-112 -> E, ...).
 */
export function formatHeadingCardinal(headingDeg: number): string {
  const deg = Math.round(((headingDeg % 360) + 360) % 360) % 360;
  const sector = Math.floor(((deg + 22.5) % 360) / 45);
  return `${formatBearing(deg)} ${CARDINALS[sector]}`;
}

/** "142.3" -> "142 m", "1234" -> "1.2 km" — compact distance indicator. */
export function formatDistance(meters: number): string {
  const m = Math.round(meters);
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

/**
 * "2026-07-06T16:00:00+00:00" -> "Sun Jun 7 · 9:00 AM" style short label.
 * Renders in the device locale; falls back to the raw ISO string when the
 * timestamp is absent or unparseable (never fabricated).
 */
export function formatStartsAt(iso: unknown): string | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}
