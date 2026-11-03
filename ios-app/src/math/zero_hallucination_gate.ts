/**
 * Zero-Hallucination Gate — client-side render validation (final authority).
 *
 * Mirrors the server-side gate in `backend/validator.py::validate_pin` and
 * the documented contract in `docs/spatial-contract.md` v1. Any pin that
 * fails is DROPPED — never repaired, never guessed, never re-fetched. A pin
 * with no verified listing behind it does not exist.
 *
 * Enforced render requirements:
 *   1. valid non-empty `listing_id` (string, trimmed non-blank)
 *   2. numeric `lat` and `lng` (finite, not NaN, not boolean-coerced)
 *   3. non-empty `title` — accepted from `name` (contract field) or `title`
 *   4. `distance <= max_range_meters` (default 500 m)
 *
 * Additional server-parity checks applied here (defense in depth for the
 * untrusted network boundary — the server already enforces these, the client
 * re-checks because pins traverse user-controlled HTTPS replies):
 *   - lat/lng within the SF Bay Area demo-corridor bounds [37.2, 38.0] x
 *     [-123.0, -121.6] (backend/validator.py `SF_BOUNDS`)
 *   - `name`/`title` at most 80 characters
 *   - `kind` in {saved, event, plan_stop}
 */

import { distanceMeters } from './distance.ts';
import type { LatLng, GateReason, GateResult, SpatialPin, ValidatedPin } from './internal.ts';

/** Default maximum render range in meters. */
export const MAX_RANGE_METERS = 500.0;

/** SF Bay Area bounds, [minLat, maxLat, minLng, maxLng] — backend/validator.py SF_BOUNDS. */
export const SF_BOUNDS: readonly [number, number, number, number] = [
  37.2, 38.0, -123.0, -121.6,
] as const;

/** Valid pin kinds per docs/spatial-contract.md v1. */
const VALID_KINDS: ReadonlySet<string> = new Set(['saved', 'event', 'plan_stop']);

/** Maximum allowed title/name length per docs/spatial-contract.md v1. */
const MAX_NAME_CHARS = 80;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Type guard that a validated pin can be handed to the renderer as-is. */
export function isValidatedPin(v: unknown): v is ValidatedPin {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { listing_id?: unknown }).listing_id === 'string' &&
    (v as { listing_id: string }).listing_id.length > 0 &&
    isFiniteNumber((v as { lat?: unknown }).lat) &&
    isFiniteNumber((v as { lng?: unknown }).lng) &&
    typeof (v as { name?: unknown }).name === 'string' &&
    (v as { name: string }).name.length > 0 &&
    (v as { name: string }).name.length <= MAX_NAME_CHARS
  );
}

/**
 * Validate a single pin for AR rendering.
 *
 * @param pin candidate pin as received from the network (untrusted)
 * @param userPos optional device position; when provided, distance is
 *        recomputed client-side from lat/lng (distance_m from the server is
 *        advisory only); when omitted, a finite numeric `distance_m` on the
 *        pin is used instead.
 * @param maxRangeMeters render range bound; defaults to MAX_RANGE_METERS.
 */
export function validatePin(
  pin: unknown,
  userPos?: LatLng,
  maxRangeMeters: number = MAX_RANGE_METERS,
): GateResult {
  if (typeof pin !== 'object' || pin === null || Array.isArray(pin)) {
    return { ok: false, reason: 'not_an_object' };
  }

  // 1. listing_id: present, non-empty, non-blank
  const rawListingId = (pin as { listing_id?: unknown }).listing_id;
  if (typeof rawListingId !== 'string' || rawListingId.trim().length === 0) {
    return { ok: false, reason: 'missing_listing_id' };
  }

  // 3. non-empty title — the contract field is `name`; `title` is accepted
  //    as an alias because the task contract refers to it. (Empty-string
  //    fallback covers an explicit empty `name` paired with a filled
  //    `title`, e.g. from a transformed API row.)
  const rawName = (pin as { name?: unknown }).name;
  const rawTitle = (pin as { title?: unknown }).title;
  const title =
    typeof rawName === 'string' && rawName.length > 0
      ? rawName
      : typeof rawTitle === 'string'
        ? rawTitle
        : '';
  if (typeof title !== 'string' || title.trim().length === 0) {
    return { ok: false, reason: 'invalid_name' };
  }
  if (title.length > MAX_NAME_CHARS) {
    return { ok: false, reason: 'invalid_name' };
  }

  // 2. numeric lat/lng (reject NaN/Infinity; boolean is not a number)
  const rawLat = (pin as { lat?: unknown }).lat;
  const rawLng = (pin as { lng?: unknown }).lng;
  if (!isFiniteNumber(rawLat) || !isFiniteNumber(rawLng)) {
    return { ok: false, reason: 'invalid_lat_lng' };
  }

  // Server-parity geo bounds re-check (SF Bay Area demo corridor).
  if (
    rawLat < SF_BOUNDS[0] ||
    rawLat > SF_BOUNDS[1] ||
    rawLng < SF_BOUNDS[2] ||
    rawLng > SF_BOUNDS[3]
  ) {
    return { ok: false, reason: 'lat_lng_out_of_bounds' };
  }

  // 4. distance within render range. Client-side computed from lat/lng when
  //    the device position is supplied (preferred); server distance_m only
  //    trusted as a fallback and only if finite.
  let distanceM: number | null = null;
  if (userPos) {
    distanceM = distanceMeters(userPos, { lat: rawLat, lng: rawLng });
  } else if (isFiniteNumber((pin as { distance_m?: unknown }).distance_m)) {
    distanceM = (pin as { distance_m: number }).distance_m;
  }
  if (distanceM === null) {
    return { ok: false, reason: 'distance_unavailable' };
  }
  if (distanceM > maxRangeMeters) {
    return { ok: false, reason: 'distance_out_of_range' };
  }

  // Server-parity kind re-check.
  const kind = (pin as { kind?: unknown }).kind;
  if (typeof kind !== 'string' || !VALID_KINDS.has(kind)) {
    return { ok: false, reason: 'invalid_name' };
  }

  return { ok: true, pin: pin as ValidatedPin };
}

/**
 * Filter a server response down to only renderable pins, with structured
 * drop reasons for QA/telemetry. Never throws; malformed items are dropped.
 *
 * @param pins raw array as received from the network (untrusted)
 * @param userPos optional device position for client-side distance checks
 * @param maxRangeMeters render range bound (default MAX_RANGE_METERS)
 */
export function validatePins(
  pins: unknown,
  userPos?: LatLng,
  maxRangeMeters: number = MAX_RANGE_METERS,
): { accepted: ValidatedPin[]; rejected: Array<{ index: number; reason: GateReason }> } {
  const accepted: ValidatedPin[] = [];
  const rejected: Array<{ index: number; reason: GateReason }> = [];
  if (!Array.isArray(pins)) {
    return { accepted, rejected };
  }
  pins.forEach((item, index) => {
    const result = validatePin(item, userPos, maxRangeMeters);
    if (result.ok) {
      accepted.push(result.pin);
    } else {
      rejected.push({ index, reason: result.reason });
    }
  });
  return { accepted, rejected };
}
