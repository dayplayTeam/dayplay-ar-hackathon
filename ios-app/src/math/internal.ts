/**
 * Internal shared exports for the DayPlay AR spatial math package.
 * Not part of the public import surface; import from './index.ts' instead.
 */
export type {
  SpatialPin,
  ValidatedPin,
  GateResult,
  GateReason,
} from './types.ts';
export {
  EARTH_RADIUS_M,
  METERS_PER_DEGREE_LAT,
  distanceMeters,
  distanceMetersEquirectangular,
} from './distance.ts';
export type { LatLng } from './distance.ts';
export { bearingDeg } from './bearing.ts';
export {
  HFOV_DEG,
  HALF_FOV_DEG,
  relativeDeltaDeg,
  screenXNorm,
  isVisibleInFov,
  projectPin,
} from './frustum.ts';
export type {
  HeadingDeg,
  ScreenXNorm,
  DeltaDeg,
} from './frustum.ts';
export {
  MAX_RANGE_METERS,
  SF_BOUNDS,
  validatePin,
  validatePins,
  isValidatedPin,
} from './zero_hallucination_gate.ts';
