/**
 * walkability.ts — pure walkable-vs-far classification & graduated distance
 * styling for AR placards.
 *
 * Presentation-layer decision logic:
 * - WALKABLE (true distance <= 1200 m): full vibrant opacity (0.95-1.0),
 *   vivid DayPlay coral stroke (#FF6B47, 2 px), clear "🚶 N MIN WALK" badge.
 *   1200 m ≈ a 15 min brisk walk (~80 m/min) — the classic walkable-
 *   neighborhood threshold (owner-set, 2026-11-04).
 * - FAR / info-only (true distance > 1200 m): GRADUATED opacity — never the
 *   old flat unreadable 0.35 ghost card. Opacity scales smoothly from 0.85
 *   (just past the radius) down to a 0.60 floor at 4.7 km+, over a readable
 *   rgba(28,27,26,0.85) background with a subtle depth border fading
 *   rgba(255,255,255,0.2) -> 0.1. Text stays high-contrast at every step.
 * - When NO card in view is walkable, the far band elevates to 0.95 -> 0.78
 *   so the closest available cards read as primary radar targets and the
 *   screen is never a sea of identical faint ghosts (MrMister, 2026-11-04).
 */

export const WALKABLE_RADIUS_M = 1200;

/** DEPRECATED: legacy flat far-card opacity from commit 2da5751. The renderer
 * no longer uses it (graduated styling replaced it); kept only so the
 * back-compat test suite can pin the historical value. */
export const FAR_OPACITY = 0.35;

/**
 * True when the pin is genuinely walkable: either no corridor remap happened
 * (distanceM is the real distance, inside the walk radius) or the real
 * distance is within the walk radius. Far / remapped citywide events are
 * NOT walkable — the placard renders them graduated-dim + info-only.
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

/**
 * Graduated distance opacity for far cards, driven by TRUE distance
 * (real_distance_m when corridor-remapped, else the projected distance):
 *   - walkable present in view: 0.85 at ~1200 m -> 0.60 at 4.7 km+.
 *   - nothing walkable in view: elevated 0.95 -> 0.78 band so the closest
 *     available cards stay prominent primary radar targets.
 * Walkable cards always return 1.0 (full vibrant).
 */
export function getGraduatedOpacity(
  realDistanceM: number | undefined,
  distanceM: number,
  isWalkable: boolean,
  hasAnyWalkableInView: boolean,
): number {
  if (isWalkable) return 1.0;

  const d = realDistanceM ?? distanceM;
  const baseFloor = hasAnyWalkableInView ? 0.60 : 0.78;
  const baseCeiling = hasAnyWalkableInView ? 0.85 : 0.95;

  // Smooth 0..1 ramp over 1200 m .. 4.7 km (floor = full depth at 4.7 km+).
  const t = Math.min(1, Math.max(0, (d - WALKABLE_RADIUS_M) / 3500));
  return baseCeiling - t * (baseCeiling - baseFloor);
}

/**
 * Graduated depth border: walkable cards get the vivid DayPlay coral stroke
 * (2 px); far cards get a subtle white hairline fading from 0.2 alpha just
 * past the radius to 0.1 at 4.7 km+ — depth cue, never illegibility.
 */
export function getGraduatedBorder(
  realDistanceM: number | undefined,
  distanceM: number,
  isWalkable: boolean,
): { borderColor: string; borderWidth: number } {
  if (isWalkable) {
    return {
      borderColor: "rgba(255, 107, 71, 0.95)", // Vivid DayPlay coral #FF6B47
      borderWidth: 2,
    };
  }
  const d = realDistanceM ?? distanceM;
  const t = Math.min(1, Math.max(0, (d - WALKABLE_RADIUS_M) / 3500));
  const alpha = 0.2 - t * 0.1;
  return {
    borderColor: `rgba(255, 255, 255, ${alpha.toFixed(2)})`,
    borderWidth: 1,
  };
}
