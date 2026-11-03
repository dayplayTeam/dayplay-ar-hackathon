import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { distanceMeters, distanceMetersEquirectangular } from '../distance.ts';
import { bearingDeg } from '../bearing.ts';
import { relativeDeltaDeg, screenXNorm, isVisibleInFov, projectPin } from '../frustum.ts';
import { validatePins } from '../zero_hallucination_gate.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_FIXTURE = join(HERE, '..', '..', '..', '..', 'eval', 'fixtures', 'corridor_real.json');

interface FixturePin {
  listing_id: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
  [key: string]: unknown;
}

const USER = { lat: 37.7601, lng: -122.4198, heading: 35 }; // corridor anchor, sim default heading

test('integration: full corridor_real.json pipeline projection + gate', () => {
  const pins = JSON.parse(readFileSync(REAL_FIXTURE, 'utf8')) as FixturePin[];
  assert.ok(Array.isArray(pins) && pins.length > 0, 'fixture pins present');

  const { accepted, rejected } = validatePins(pins, USER, 1500);
  // Every real pin must pass the structural gate; the demo uses a 1500 m
  // range so the full corridor is rendered on foot.
  assert.equal(rejected.length, 0, `unexpected rejections: ${JSON.stringify(rejected)}`);
  assert.equal(accepted.length, pins.length);

  for (const pin of accepted) {
    const p = projectPin(USER, pin);
    // equirectangular (backend/sim) vs haversine agreement < 0.5%
    const eq = distanceMetersEquirectangular(USER, pin);
    assert.ok(
      Math.abs(eq - p.distanceM) / p.distanceM < 0.005,
      `pin ${pin.listing_id}: hav=${p.distanceM} eq=${eq}`,
    );
    // delta/screenX always in contract ranges
    assert.ok(p.deltaDeg >= -180 && p.deltaDeg <= 180);
    // screenXNorm consistent with delta/HALF_FOV
    assert.ok(
      Math.abs(p.screenXNorm - p.deltaDeg / 31) < 1e-9,
      `pin ${pin.listing_id}: sx=${p.screenXNorm} delta=${p.deltaDeg}`,
    );
    // visibility consistent with |delta| <= 31
    assert.equal(p.visible, isVisibleInFov(p.deltaDeg));
  }
});

test('integration: heading pan sweeps each pin through the frustum once', () => {
  const pins = JSON.parse(readFileSync(REAL_FIXTURE, 'utf8')) as FixturePin[];
  for (const pin of pins) {
    const brg = bearingDeg(USER, pin);
    let visibleCount = 0;
    for (let h = 0; h < 360; h += 0.5) {
      const delta = relativeDeltaDeg(h, brg);
      if (isVisibleInFov(delta)) visibleCount++;
    }
    // ~62/0.5 = 124 heading steps show each pin; allow tolerance for
    // boundary discretization
    assert.ok(
      visibleCount >= 123 && visibleCount <= 125,
      `pin ${pin.listing_id}: ${visibleCount}`,
    );
    // exactly one heading step centers the pin at screenX 0
    const centered = relativeDeltaDeg(brg, brg);
    assert.equal(centered, 0);
    assert.equal(screenXNorm(brg, brg), 0);
  }
});

test('integration: backend-mirrored scenario — validator-passed rows render, malformed row dropped', () => {
  const pins = JSON.parse(readFileSync(REAL_FIXTURE, 'utf8')) as FixturePin[];
  const serverRows = pins.map((p) => ({ ...p, distance_m: Math.round(distanceMetersEquirectangular(USER, p)) }));
  // one fabricated row as an adversarial network injection
  const fabricated = { listing_id: 'FABRICATED-1', name: 'Ghost Venue', lat: 48.8566, lng: 2.3522, kind: 'event' };
  const { accepted, rejected } = validatePins([...serverRows, fabricated], USER, 1500);
  assert.equal(accepted.length, pins.length);
  assert.equal(rejected.length, 1);
  assert.deepEqual(rejected[0], { index: pins.length, reason: 'lat_lng_out_of_bounds' });
  // fabricated pin is not rendered and not repaired
  assert.ok(!accepted.some((p) => p.listing_id === 'FABRICATED-1'));
});
