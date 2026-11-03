/**
 * @dayplay/spatial-math — AR spatial pin math and frustum culling.
 *
 * Client-side port of the DayPlay AR spatial contract (Milestone M2):
 *   - distance.ts     haversine + equirectangular distance in meters
 *   - bearing.ts      forward azimuth (initial bearing), 0..360 True North
 *   - frustum.ts      62 deg HFOV culling and normalized screen X
 *   - zero_hallucination_gate.ts  render validation (drop, never repair)
 *
 * Imported directly by the Expo app (`ios-app`) and unit-tested with the
 * Node.js native test runner (`node --test`) — no Jest required.
 */
export {
  // distance
  EARTH_RADIUS_M,
  METERS_PER_DEGREE_LAT,
  distanceMeters,
  distanceMetersEquirectangular,
  // bearing
  bearingDeg,
  // frustum
  HFOV_DEG,
  HALF_FOV_DEG,
  relativeDeltaDeg,
  screenXNorm,
  isVisibleInFov,
  projectPin,
  // gate
  MAX_RANGE_METERS,
  SF_BOUNDS,
  validatePin,
  validatePins,
  isValidatedPin,
} from './internal.ts';
export type {
  LatLng,
  SpatialPin,
  ValidatedPin,
  GateResult,
  GateReason,
  HeadingDeg,
  ScreenXNorm,
  DeltaDeg,
} from './internal.ts';
