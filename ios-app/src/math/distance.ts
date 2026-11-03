/**
 * Distance module — matches the DayPlay AR spatial contract.
 *
 * `distanceMeters` is the canonical haversine distance on a spherical Earth
 * with mean radius 6,371,008.8 m (IUGG mean radius R1).
 *
 * `distanceMetersEquirectangular` is the flat-earth approximation used by the
 * live backend (`backend/pipeline.py` `dist_m`) and the web simulator
 * (`sim/app.js` `relCoords`): meters/degree lat = 111,320 and meters/degree
 * lng = 111,320 * cos(lat). It is kept for parity with the served
 * `distance_m` values and sim-relative framing; both agree to <0.2% in the
 * demo corridor, so they are interchangeable at AR placard granularity.
 */

export const EARTH_RADIUS_M = 6_371_008.8;

/** Meters per degree of latitude (matches backend/sim constant). */
export const METERS_PER_DEGREE_LAT = 111_320.0;

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

const TO_RAD = Math.PI / 180;

/**
 * Great-circle distance in meters between two WGS-84 points (haversine,
 * spherical Earth). Uses the numerically stable asin(sqrt(h)) form.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const lat1 = a.lat * TO_RAD;
  const lat2 = b.lat * TO_RAD;
  const dLat = lat2 - lat1;
  const dLng = (b.lng - a.lng) * TO_RAD;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1.0, Math.sqrt(h)));
}

/**
 * Equirectangular (flat-earth) distance in meters — parity port of
 * `backend/pipeline.py::dist_m` / `sim/app.js::relCoords`:
 * hypot(dLat * 111320, dLng * 111320 * cos(lat)).
 */
export function distanceMetersEquirectangular(a: LatLng, b: LatLng): number {
  const metersPerDegLng = METERS_PER_DEGREE_LAT * Math.cos(a.lat * TO_RAD);
  const dLatM = (b.lat - a.lat) * METERS_PER_DEGREE_LAT;
  const dLngM = (b.lng - a.lng) * metersPerDegLng;
  return Math.hypot(dLatM, dLngM);
}
