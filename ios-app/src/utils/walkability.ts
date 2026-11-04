/**
 * walkability.ts — pure walkable-vs-far classification for AR placards.
 *
 * Presentation-layer decision logic (no React / RN dependency): a venue is
 * WALKABLE when its TRUE distance from the user is inside the 500 m walk
 * radius; corridor-remapped citywide events (real distance beyond the radius
 * compressed into a render slot) are FAR / info-only radar signals. The
 * placard deck keys its visual differentiation off this: walkable cards get
 * the DayPlay coral stroke + vivid glass + walkable badge; far cards fade to
 * FAR_OPACITY with a muted hairline border and an honest "◇ FAR · INFO-ONLY"
 * chip (visual differentiation spec, 2026-11-04).
 */

/** Walk radius (meters) — mirrors the zero-hallucination gate MAX_RANGE_METERS.
 * A pin whose TRUE distance exceeds this is a citywide radar signal, not a
 * walkable outing. Kept in sync with src/math/zero_hallucination_gate.ts. */
export const WALKABLE_RADIUS_M = 500;

/** Opacity for far / info-only placards — deliberately faded so unwalkable
 * citywide signals read as "distant, harder to see" next to vivid walkable
 * cards (visual differentiation spec). */
export const FAR_OPACITY = 0.35;

/**
 * True when the pin is genuinely walkable: either no corridor remap happened
 * (distanceM is the real distance, inside the walk radius) or the real
 * distance is within the walk radius. Far / remapped citywide events are
 * NOT walkable — the placard renders them faded + info-only.
 */
export function isWalkablePin(
  realDistanceM: number | undefined,
  distanceM: number,
): boolean {
  if (realDistanceM === undefined) return distanceM <= WALKABLE_RADIUS_M;
  return realDistanceM <= WALKABLE_RADIUS_M;
}

/** Brisk-walk minutes for a distance in meters (~80 m/min). */
export function walkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 80));
}
