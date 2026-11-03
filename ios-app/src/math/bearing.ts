/**
 * Bearing module — forward azimuth (initial bearing) on the unit sphere,
 * computed with the standard spherical-trigonometry formula:
 *
 *   theta = atan2( sin(dLng) * cos(lat2),
 *                  cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLng) )
 *
 * Result is normalized to the 0..360 (inclusive) True-North compass
 * convention: 0 = due North, 90 = due East, 180 = due South, 270 = due West.
 *
 * The user -> target forward azimuth is what the backend and web simulator
 * render against (sim/app.js rotates pins into user view space by heading),
 * so this is the value fed to the frustum delta calculation.
 */

import type { LatLng } from './distance';

const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

/**
 * Forward (initial) azimuth in degrees [0, 360] from `from` to `to`,
 * measured clockwise from True North. Antipodal/degenerate inputs return 0.
 */
export function bearingDeg(from: LatLng, to: LatLng): number {
  const lat1 = from.lat * TO_RAD;
  const lat2 = to.lat * TO_RAD;
  const dLng = (to.lng - from.lng) * TO_RAD;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const deg = Math.atan2(y, x) * TO_DEG;
  return (deg + 360) % 360;
}
