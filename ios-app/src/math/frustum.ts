/**
 * Frustum module — horizontal view-space culling for AR placards.
 *
 * Contract (matches web simulator sim/app.js, normalized):
 *   delta       = signed relative angle target-vs-heading, in [-180, 180]
 *                 (positive = target clockwise / to the right of the
 *                 device's True-North forward axis)
 *   visible     = |delta| <= FOV / 2  (62 deg horizontal FOV -> +/-31 deg)
 *   screenXNorm = delta / (FOV / 2)   in [-1 (left edge), +1 (right edge)]
 *
 * screenXNorm is resolution-independent. The React Native renderer maps it
 * to the viewport with x_screen = (screenXNorm + 1) / 2 * viewportWidth,
 * which reproduces the simulator's `screenX_vw = 50 + hfov * 100`.
 *
 * Note: the simulator additionally culls `fwd < 1m` / `fwd > 600m` (near/far
 * planes) and applies a soft visual margin at |hfov| > 0.55; those are
 * presentation-layer choices, not the geometric frustum contract, so they
 * live in the renderer, not here. Distance-range culling is enforced by the
 * zero-hallucination gate (`zero_hallucination_gate.ts`).
 */

import { bearingDeg } from './bearing.ts';
import { distanceMeters } from './distance.ts';
import type { LatLng } from './distance.ts';

/** Horizontal field of view of the AR camera view, in degrees. */
export const HFOV_DEG = 62;

/** Half the horizontal FOV; the frustum culling bound (+/-31 deg). */
export const HALF_FOV_DEG = HFOV_DEG / 2;

/** Heading in degrees [0, 360), 0 = True North, clockwise (device true heading). */
export type HeadingDeg = number;

/** Normalized horizontal screen position: -1.0 = left viewport edge, +1.0 = right. */
export type ScreenXNorm = number;

/** Signed angular offset of a target from the device heading, [-180, 180]. */
export type DeltaDeg = number;

/**
 * Signed horizontal offset angle of the target from the device heading:
 *
 *   delta = ((bearing - heading + 540) % 360) - 180
 *
 * Wrap-safe: heading 350 with bearing 10 -> +20 (target 20 deg clockwise).
 * At the exact 180-degree behind case the sign depends on wrap parity and is
 * arbitrary; such targets are always culled anyway.
 */
export function relativeDeltaDeg(
  heading: HeadingDeg,
  targetBearingDeg: number,
): DeltaDeg {
  return (((targetBearingDeg - heading + 540) % 360) - 180);
}

/**
 * Normalized screen X position for a target bearing relative to the device
 * heading. Values outside [-1, +1] indicate the target is outside the
 * horizontal frustum (left of the left edge / right of the right edge) and
 * are returned clamped-free for the caller to cull via `isVisibleInFov`.
 */
export function screenXNorm(heading: HeadingDeg, targetBearingDeg: number): ScreenXNorm {
  return relativeDeltaDeg(heading, targetBearingDeg) / HALF_FOV_DEG;
}

/**
 * Frustum visibility test: the pin is horizontally inside the viewport iff
 * |delta| <= FOV / 2 (targets exactly on the edge are visible).
 */
export function isVisibleInFov(deltaDeg: DeltaDeg): boolean {
  return Math.abs(deltaDeg) <= HALF_FOV_DEG;
}

/**
 * One-shot spatial projection for a pin: computes bearing and distance from
 * the device position, the relative delta from the device heading, frustum
 * visibility, and the normalized screen X position.
 *
 * Pure and side-effect free; the renderer decides what to do with the result
 * (distance-range culling is the gate's job, not this function's).
 */
export function projectPin(
  user: LatLng & { heading: HeadingDeg },
  target: LatLng,
): {
  distanceM: number;
  bearingDeg: number;
  deltaDeg: DeltaDeg;
  visible: boolean;
  screenXNorm: ScreenXNorm;
} {
  const brg = bearingDeg(user, target);
  const dist = distanceMeters(user, target);
  const delta = relativeDeltaDeg(user.heading, brg);
  return {
    distanceM: dist,
    bearingDeg: brg,
    deltaDeg: delta,
    visible: isVisibleInFov(delta),
    screenXNorm: screenXNorm(user.heading, brg),
  };
}
