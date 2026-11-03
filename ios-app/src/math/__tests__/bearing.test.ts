import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearingDeg } from '../bearing.ts';
import { distanceMeters } from '../distance.ts';

const ANCHOR = { lat: 37.7601, lng: -122.4198 };

// Cardinal-direction targets, each exactly 100 equirectangular meters from
// the anchor along the cardinal axis (longitudes scaled by cos(lat), the
// same convention as backend/pipeline.py and sim/app.js).
const MPD_LAT = 111320.0;
const MPD_LNG = 111320.0 * Math.cos((ANCHOR.lat * Math.PI) / 180);
const N = { lat: ANCHOR.lat + 100 / MPD_LAT, lng: ANCHOR.lng };
const E = { lat: ANCHOR.lat, lng: ANCHOR.lng + 100 / MPD_LNG };
const S = { lat: ANCHOR.lat - 100 / MPD_LAT, lng: ANCHOR.lng };
const W = { lat: ANCHOR.lat, lng: ANCHOR.lng - 100 / MPD_LNG };

test('due north target: bearing 0', () => {
  assert.ok(Math.abs(bearingDeg(ANCHOR, N) - 0) < 1e-9, `got ${bearingDeg(ANCHOR, N)}`);
});

test('due east target: bearing 90 (great-circle deviation < 0.001 deg)', () => {
  // The initial great-circle bearing to a point due east along the parallel
  // is not exactly 90 deg (meridian convergence); at SF latitudes and 100 m
  // the deviation is ~3.5e-4 deg. Sub-millidegree is the correct contract.
  const b = bearingDeg(ANCHOR, E);
  assert.ok(Math.abs(b - 90) < 1e-3, `got ${b}`);
});

test('due south target: bearing 180', () => {
  const b = bearingDeg(ANCHOR, S);
  assert.ok(Math.abs(b - 180) < 1e-9, `got ${b}`);
});

test('due west target: bearing 270 (great-circle deviation < 0.001 deg)', () => {
  const b = bearingDeg(ANCHOR, W);
  assert.ok(Math.abs(b - 270) < 1e-3, `got ${b}`);
});

test('intercardinal NE target ~45 deg', () => {
  const NE = {
    lat: ANCHOR.lat + 100 / MPD_LAT,
    lng: ANCHOR.lng + 100 / MPD_LNG,
  };
  const b = bearingDeg(ANCHOR, NE);
  assert.ok(Math.abs(b - 45) < 0.5, `got ${b}`);
});

test('forward azimuth vs reciprocal: bearing(B->A) ~ bearing(A->B) + 180 (mod 360)', () => {
  const AB = bearingDeg(ANCHOR, E);
  const BA = bearingDeg(E, ANCHOR);
  const s = (((BA - AB) % 360) + 360) % 360; // signed diff in [0, 360)
  assert.ok(Math.abs(s - 180) < 0.01, `AB=${AB} BA=${BA} s=${s}`);
});

test('meridian special cases: due north/south poles axis', () => {
  // Due-north bearing from any point to a point exactly north stays 0;
  // crossing the pole flips to 180 (standard initial-bearing behavior).
  assert.equal(bearingDeg({ lat: 10, lng: 0 }, { lat: 20, lng: 0 }), 0);
  assert.equal(
    bearingDeg({ lat: 10, lng: 0 }, { lat: -20, lng: 0 }),
    180,
  );
});

test('result is always within [0, 360)', () => {
  for (let dLng = -180; dLng <= 180; dLng += 5) {
    const b = bearingDeg(ANCHOR, { lat: 37.77, lng: ANCHOR.lng + dLng / 111320 / Math.cos((ANCHOR.lat * Math.PI) / 180) });
    assert.ok(b >= 0 && b < 360, `got ${b}`);
  }
});

test('corridor pin bearing sanity (backend-verified distance)', () => {
  const BACHATA = { lat: 37.7632931, lng: -122.4079495 };
  const b = bearingDeg(ANCHOR, BACHATA);
  assert.ok(Math.abs(b - 71.175694025) < 1e-6, `got ${b}`);
  assert.ok(distanceMeters(ANCHOR, BACHATA) > 1000, 'expect >1 km');
});

test('degenerate same-point bearing is 0 (not NaN)', () => {
  assert.equal(bearingDeg(ANCHOR, ANCHOR), 0);
});
