import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RANGE_METERS,
  SF_BOUNDS,
  validatePin,
  validatePins,
  isValidatedPin,
} from '../zero_hallucination_gate.ts';
import type { SpatialPin } from '../types.ts';

const USER = { lat: 37.7601, lng: -122.4198 }; // backend CORRIDOR_ANCHOR

/** Real pin shape from eval/fixtures/corridor_real.json (verified listing). */
const REAL_PIN: SpatialPin = {
  listing_id: '282cf864-4476-48b5-889a-9065df76e148',
  name: 'Bachata Kizomba Sunday - Hello  Bachata/Kizomba Dance Party and Class',
  lat: 37.7632931,
  lng: -122.4079495,
  kind: 'saved',
  starts_at: '2026-11-08T23:00:00+00:00',
  source_tool: 'supabase_entities_anon',
};

/** Synthetic pin at 200 m due north, pipeline fixture shape. */
const NEARBY_PIN: SpatialPin = {
  listing_id: 'FIX-SYN-001',
  name: 'Demo pin A — replace with DayPlay MCP data',
  lat: 37.762345777937476,
  lng: -122.4198,
  kind: 'event',
  starts_at: '2026-10-29T20:00:00-07:00',
  source_tool: 'FIXTURE-SYNTHETIC',
};

// ------------------- happy path -------------------

test('accepts a real verified pin (client-side distance, user nearby)', () => {
  // User stands next to the venue (~10 m away) -> within the 1200 m default.
  const r = validatePin(REAL_PIN, { lat: 37.76329, lng: -122.40795 });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.pin.listing_id, REAL_PIN.listing_id);
});

test('accepts a nearby synthetic pin at ~250 m', () => {
  const r = validatePin(NEARBY_PIN, USER);
  assert.equal(r.ok, true);
});

test('accepts pin with explicit title field (no name)', () => {
  const r = validatePin({ ...NEARBY_PIN, name: undefined, title: 'Title Only Pin' }, USER);
  assert.equal(r.ok, true);
});

test('isValidatedPin type guard matches gate acceptance', () => {
  assert.equal(isValidatedPin(REAL_PIN), true);
  assert.equal(isValidatedPin({ ...REAL_PIN, listing_id: '' }), false);
  assert.equal(isValidatedPin(null), false);
  assert.equal(isValidatedPin('pin'), false);
});

// ------------------- listing_id gate -------------------

test('rejects missing listing_id', () => {
  const { listing_id, ...noLid } = REAL_PIN;
  const r = validatePin(noLid, USER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'missing_listing_id');
});

test('rejects empty-string listing_id', () => {
  const r = validatePin({ ...REAL_PIN, listing_id: '' }, USER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'missing_listing_id');
});

test('rejects whitespace-only listing_id', () => {
  const r = validatePin({ ...REAL_PIN, listing_id: '   ' }, USER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'missing_listing_id');
});

test('rejects non-string listing_id (number, object)', () => {
  assert.equal(validatePin({ ...REAL_PIN, listing_id: 12345 }, USER).ok, false);
  assert.equal(
    validatePin({ ...REAL_PIN, listing_id: { id: 'x' } }, USER).ok,
    false,
  );
});

// ------------------- title/name gate -------------------

test('rejects missing title (both name and title empty)', () => {
  const r = validatePin({ ...NEARBY_PIN, name: '', title: '' }, USER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'invalid_name');
});

test('rejects whitespace-only title', () => {
  const r = validatePin({ ...NEARBY_PIN, name: '   ' }, USER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'invalid_name');
});

test('rejects name longer than 80 chars (contract bound)', () => {
  const r = validatePin({ ...NEARBY_PIN, name: 'x'.repeat(81) }, USER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'invalid_name');
});

test('accepts name exactly 80 chars', () => {
  const r = validatePin({ ...NEARBY_PIN, name: 'x'.repeat(80) }, USER);
  assert.equal(r.ok, true);
});

test('rejects non-string name', () => {
  const r = validatePin({ ...NEARBY_PIN, name: 42 as unknown as string }, USER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'invalid_name');
});

// ------------------- lat/lng gate -------------------

test('rejects non-numeric lat', () => {
  const r = validatePin({ ...REAL_PIN, lat: '37.7' as unknown as number }, USER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'invalid_lat_lng');
});

test('rejects non-numeric lng', () => {
  const r = validatePin({ ...REAL_PIN, lng: null as unknown as number }, USER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'invalid_lat_lng');
});

test('rejects NaN and Infinity lat/lng', () => {
  assert.equal(validatePin({ ...REAL_PIN, lat: NaN }, USER).ok, false);
  assert.equal(validatePin({ ...REAL_PIN, lng: Infinity }, USER).ok, false);
});

test('rejects boolean lat (not coerced to number)', () => {
  const r = validatePin({ ...REAL_PIN, lat: true as unknown as number }, USER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'invalid_lat_lng');
});

// ------------------- geo bounds (server parity) -------------------

test('rejects pin far outside SF bounds (fabricated coordinates)', () => {
  const r = validatePin({ ...REAL_PIN, lat: 40.7128, lng: -74.006 }, USER); // NYC
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'lat_lng_out_of_bounds');
});

test('rejects lat outside bounds but lng inside', () => {
  const r = validatePin({ ...REAL_PIN, lat: 36.0 }, USER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'lat_lng_out_of_bounds');
});

test('rejects lng outside bounds but lat inside', () => {
  const r = validatePin({ ...REAL_PIN, lng: -120.0 }, USER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'lat_lng_out_of_bounds');
});

test('SF_BOUNDS match backend/validator.py', () => {
  assert.deepEqual(SF_BOUNDS, [37.2, 38.0, -123.0, -121.6]);
});

// ------------------- distance range gate -------------------

test('MAX_RANGE_METERS default is 1200 (walk radius)', () => {
  assert.equal(MAX_RANGE_METERS, 1200);
});

test('accepts the real corridor pin at ~1.1 km inside the 1200 m default', () => {
  // 1100 m away with the default 1200 m cap: within the walk radius now.
  const r = validatePin(REAL_PIN, USER);
  assert.equal(r.ok, true);
});

test('accepts the same pin when user is within range', () => {
  const r = validatePin(REAL_PIN, { lat: 37.7632, lng: -122.408 }); // ~10 m away
  assert.equal(r.ok, true);
});

test('respects custom max range (1100 m pin: accepted at 1200 cap, rejected at 1000)', () => {
  assert.equal(validatePin(REAL_PIN, USER, 1200).ok, true);
  assert.equal(validatePin(REAL_PIN, USER, 1000).ok, false);
});

test('edge: pin just beyond 1200 m is rejected, just within accepted', () => {
  // Degrees offset via the equirectangular parity constant (111,320 m/deg
  // lat); haversine and equirect agree to <0.2% in the corridor, and the
  // 2 m offsets here sit far from the 1200 m boundary either way.
  const dLat = 1210 / 111320; // ~1210 m due north: beyond the radius
  assert.equal(
    validatePin(
      { ...NEARBY_PIN, lat: USER.lat + dLat },
      USER,
    ).ok,
    false,
  );
  const dLatIn = 1190 / 111320; // ~1190 m due north: inside the radius
  assert.equal(
    validatePin(
      { ...NEARBY_PIN, lat: USER.lat + dLatIn },
      USER,
    ).ok,
    true,
  );
});

test('rejects pin without user position and without finite distance_m', () => {
  const { distance_m, ...pin } = { ...NEARBY_PIN } as SpatialPin & {
    distance_m?: number;
  };
  void distance_m;
  const r = validatePin(pin);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'distance_unavailable');
});

test('falls back to pin distance_m when no user position given', () => {
  const r = validatePin({ ...NEARBY_PIN, distance_m: 250 });
  assert.equal(r.ok, true);
});

test('rejects NaN distance_m fallback', () => {
  const r = validatePin({ ...NEARBY_PIN, distance_m: NaN });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'distance_unavailable');
});

test('rejects pin whose distance_m exceeds max range when no user position', () => {
  const r = validatePin({ ...NEARBY_PIN, distance_m: 1201 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'distance_out_of_range');
});

// ------------------- kind parity -------------------

test('rejects invalid kind (server-parity re-check)', () => {
  const r = validatePin({ ...NEARBY_PIN, kind: 'hallucinated' }, USER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'invalid_name');
});

test('accepts all three valid kinds', () => {
  for (const kind of ['saved', 'event', 'plan_stop'] as const) {
    assert.equal(validatePin({ ...NEARBY_PIN, kind }, USER).ok, true);
  }
});

// ------------------- malformed / fabricated input -------------------

test('rejects null, undefined, arrays, primitives', () => {
  assert.equal(validatePin(null).ok, false);
  assert.equal(validatePin(undefined).ok, false);
  assert.equal(validatePin([REAL_PIN] as unknown as SpatialPin).ok, false);
  assert.equal(validatePin('pin' as unknown as SpatialPin).ok, false);
  assert.equal(validatePin(42 as unknown as SpatialPin).ok, false);
});

test('first-failure-wins: bad listing_id reported even when coords also bad', () => {
  const r = validatePin(
    { ...REAL_PIN, listing_id: '', lat: 99, lng: 99 },
    USER,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, 'missing_listing_id');
});

// ------------------- batch API -------------------

test('validatePins filters a mixed batch with structured drops', () => {
  const batch = [
    { ...REAL_PIN, lat: 37.7751, lng: -122.4198 }, // ~1.7 km north: beyond the 1200 m radius -> rejected
    NEARBY_PIN, // ok
    { ...NEARBY_PIN, listing_id: '' }, // missing id
    { ...NEARBY_PIN, lat: 'x' }, // bad coords
    { ...NEARBY_PIN, name: '' }, // empty title
    null, // malformed
    'nonsense', // malformed
  ];
  const { accepted, rejected } = validatePins(batch, USER);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0]?.listing_id, NEARBY_PIN.listing_id);
  assert.equal(rejected.length, 6);
  assert.deepEqual(rejected[0], { index: 0, reason: 'distance_out_of_range' });
  assert.deepEqual(rejected[1], { index: 2, reason: 'missing_listing_id' });
  assert.deepEqual(rejected[2], { index: 3, reason: 'invalid_lat_lng' });
  assert.deepEqual(rejected[3], { index: 4, reason: 'invalid_name' });
  assert.deepEqual(rejected[4], { index: 5, reason: 'not_an_object' });
  assert.deepEqual(rejected[5], { index: 6, reason: 'not_an_object' });
});

test('validatePins on non-array input returns empty, never throws', () => {
  assert.deepEqual(validatePins(null, USER), { accepted: [], rejected: [] });
  assert.deepEqual(validatePins('pins', USER), { accepted: [], rejected: [] });
  assert.deepEqual(validatePins({}, USER), { accepted: [], rejected: [] });
});
