/**
 * Internal shared exports for the DayPlay AR spatial math package.
 * Not part of the public import surface; import from './index' instead.
 */
export type {
  SpatialPin,
  ValidatedPin,
  GateResult,
  GateReason,
} from './types';
export {
  EARTH_RADIUS_M,
  METERS_PER_DEGREE_LAT,
  distanceMeters,
  distanceMetersEquirectangular,
} from './distance';
export type { LatLng } from './distance';
export { bearingDeg } from './bearing';
export {
  HFOV_DEG,
  HALF_FOV_DEG,
  relativeDeltaDeg,
  screenXNorm,
  isVisibleInFov,
  projectPin,
} from './frustum';
export type {
  HeadingDeg,
  ScreenXNorm,
  DeltaDeg,
} from './frustum';
export {
  MAX_RANGE_METERS,
  SF_BOUNDS,
  validatePin,
  validatePins,
  isValidatedPin,
} from './zero_hallucination_gate';
