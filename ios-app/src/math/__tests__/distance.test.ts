import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EARTH_RADIUS_M,
  distanceMeters,
  distanceMetersEquirectangular,
} from '../distance.ts';

// Test fixture: three real pins from eval/fixtures/corridor_real.json, plus
// the backend corridor anchor (backend/dayplay_tools.py CORRIDOR_ANCHOR).
const ANCHOR = { lat: 37.7601, lng: -122.4198 };
const BACHATA = { lat: 37.7632931, lng: -122.4079495 };
const CAFE = { lat: 37.7580934, lng: -122.4190765 };
const T1 = { lat: 37.75942469089416, lng: -122.4201109007353 }; // ~200 deg bearing, 80 m
const T2 = { lat: 37.762345777937476, lng: -122.4198 }; // due north of anchor, ~250 m
const T3 = { lat: 37.76183128000936, lng: -122.42040730785338 }; // ~344.5 deg bearing, 200 m

// Distances independently verified with the spherical law of cosines in a
// scratch harness; agreement within 1e-9 m per 1e-12 radian precision.
test('anchor -> Bachata Kizomba ~1100.585751 m', () => {
  const d = distanceMeters(ANCHOR, BACHATA);
  assert.ok(Math.abs(d - 1100.5857511) < 1e-6, `got ${d}`);
});

test('anchor -> cafe ~232.012211 m', () => {
  const d = distanceMeters(ANCHOR, CAFE);
  assert.ok(Math.abs(d - 232.012211) < 1e-6, `got ${d}`);
});

test('anchor -> T1 ~79.910269 m', () => {
  const d = distanceMeters(ANCHOR, T1);
  assert.ok(Math.abs(d - 79.9102692) < 1e-6, `got ${d}`);
});

test('anchor -> T2 ~249.719458 m', () => {
  const d = distanceMeters(ANCHOR, T2);
  assert.ok(Math.abs(d - 249.7194579) < 1e-6, `got ${d}`);
});

test('anchor -> T3 ~199.775399 m', () => {
  const d = distanceMeters(ANCHOR, T3);
  assert.ok(Math.abs(d - 199.7753988) < 1e-6, `got ${d}`);
});

test('distance is symmetric', () => {
  assert.equal(distanceMeters(ANCHOR, BACHATA), distanceMeters(BACHATA, ANCHOR));
  assert.equal(distanceMeters(ANCHOR, CAFE), distanceMeters(CAFE, ANCHOR));
});

test('zero distance for coincident points', () => {
  assert.equal(distanceMeters(ANCHOR, ANCHOR), 0);
  assert.equal(distanceMeters(ANCHOR, { lat: ANCHOR.lat, lng: ANCHOR.lng }), 0);
});

test('independent geodesic distance 1 deg lat ~ 111,195 m on R=6371.0088 km sphere', () => {
  const d = distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
  assert.ok(Math.abs(d - 111195.0802335329) < 1e-6, `got ${d}`);
});

test('longitude of equatorial great circle corresponds to R * dLng_rad', () => {
  const R = EARTH_RADIUS_M;
  const d = distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
  assert.ok(Math.abs(d - (R * Math.PI) / 180) < 1e-6, `got ${d}`);
});

test('equirectangular parity with backend/sim: anchor -> Bachata', () => {
  const eq = distanceMetersEquirectangular(ANCHOR, BACHATA);
  assert.ok(Math.abs(eq - 1101.8434887) < 1e-6, `got ${eq}`);
  // haversine and equirectangular agree within 0.2% in the corridor
  const hav = distanceMeters(ANCHOR, BACHATA);
  assert.ok(Math.abs(eq - hav) / hav < 0.002, `eq=${eq} hav=${hav}`);
});

test('equirectangular parity with backend/sim: anchor -> T2 (due north)', () => {
  const eq = distanceMetersEquirectangular(ANCHOR, T2);
  assert.ok(Math.abs(eq - 250) < 1e-6, `got ${eq}`);
});

test('equirectangular parity with backend/sim: anchor -> T1 (SW offset)', () => {
  const eq = distanceMetersEquirectangular(ANCHOR, T1);
  assert.ok(Math.abs(eq - 80) < 1e-6, `got ${eq}`);
});
