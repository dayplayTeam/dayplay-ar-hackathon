/**
 * walkability.ts — pure walkable-vs-far classification & graduated depth styling for AR placards.
 *
 * Presentation-layer decision logic:
 * - WALKABLE: True distance from user is <= 500m (vivid DayPlay coral stroke, full opacity, walk-min badge).
 * - FAR / INFO-ONLY: Real distance > 500m (corridor-projected citywide radar signals).
 * - GRADUATED DISTANCE STYLING:
 *   Instead of a flat unreadable ghost card (0.35 opacity), opacity scales smoothly based on true distance
 *   from 0.85 down to 0.55 floor, with high-contrast text and border so cards are ALWAYS legible against the camera!
 */

export const WALKABLE_RADIUS_M = 500;
export const FAR_OPACITY = 0.35; // Kept for test suite backward compatibility

export function isWalkablePin(
  realDistanceM: number | undefined,
  distanceM: number,
): boolean {
  if (realDistanceM === undefined) return distanceM <= WALKABLE_RADIUS_M;
  return realDistanceM <= WALKABLE_RADIUS_M;
}

export function walkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 80));
}

/**
 * Graduated distance opacity: smoothly attenuates from 1.0 down to a readable 0.65 floor.
 * If NO cards in view are walkable, elevates baseline so the user never looks at a screen of faint ghost cards!
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

  // Scale smoothly from 500m to 5000m+
  const t = Math.min(1, Math.max(0, (d - WALKABLE_RADIUS_M) / 4500));
  return baseCeiling - t * (baseCeiling - baseFloor);
}

export function getGraduatedBorder(
  realDistanceM: number | undefined,
  distanceM: number,
  isWalkable: boolean,
): { borderColor: string; borderWidth: number } {
  if (isWalkable) {
    return {
      borderColor: "rgba(255, 107, 71, 0.95)", // Vivid DayPlay Coral
      borderWidth: 2,
    };
  }
  const d = realDistanceM ?? distanceM;
  const t = Math.min(1, Math.max(0, (d - WALKABLE_RADIUS_M) / 4500));
  const alpha = 0.25 - t * 0.12;
  return {
    borderColor: `rgba(255, 255, 255, ${alpha.toFixed(2)})`,
    borderWidth: 1,
  };
}
