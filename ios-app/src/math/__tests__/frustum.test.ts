import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters } from '../distance.ts';
import {
  HFOV_DEG,
  HALF_FOV_DEG,
  relativeDeltaDeg,
  screenXNorm,
  isVisibleInFov,
  projectPin,
} from '../frustum.ts';

test('HFOV constants: 62 deg FOV -> +/-31 deg half-angle', () => {
  assert.equal(HFOV_DEG, 62);
  assert.equal(HALF_FOV_DEG, 31);
});

test('relativeDeltaDeg: basics and wrap-around', () => {
  assert.equal(relativeDeltaDeg(0, 0), 0); // facing target
  assert.equal(relativeDeltaDeg(0, 90), 90); // target 90 right
  assert.equal(relativeDeltaDeg(0, 270), -90); // target 90 left
  assert.equal(relativeDeltaDeg(90, 0), -90); // target 90 left
  assert.equal(relativeDeltaDeg(10, 350), -20); // wrap: target across 0
  assert.equal(relativeDeltaDeg(350, 10), 20); // wrap: other direction
  assert.equal(relativeDeltaDeg(180, 270), 90);
  assert.equal(relativeDeltaDeg(45, 45), 0);
  assert.equal(relativeDeltaDeg(350, 180), -170);
  assert.equal(relativeDeltaDeg(100, 80), -20);
});

test('relativeDeltaDeg output stays within [-180, 180]', () => {
  for (let h = 0; h < 360; h += 7) {
    for (let b = 0; b < 360; b += 11) {
      const d = relativeDeltaDeg(h, b);
      assert.ok(
        d >= -180 && d <= 180,
        `heading=${h} bearing=${b} delta=${d}`,
      );
    }
  }
});

test('frustum bounds: +31 deg visible (right edge), +31.5 culled', () => {
  assert.equal(isVisibleInFov(31), true, 'right edge inside');
  assert.equal(isVisibleInFov(31.5), false, 'just past right edge');
});

test('frustum bounds: -31 deg visible (left edge), -31.5 culled', () => {
  assert.equal(isVisibleInFov(-31), true, 'left edge inside');
  assert.equal(isVisibleInFov(-31.5), false, 'just past left edge');
});

test('frustum bounds: center and near-center visible, wide angles culled', () => {
  assert.equal(isVisibleInFov(0), true);
  assert.equal(isVisibleInFov(15), true);
  assert.equal(isVisibleInFov(-15), true);
  assert.equal(isVisibleInFov(90), false);
  assert.equal(isVisibleInFov(-90), false);
  assert.equal(isVisibleInFov(180), false);
});

test('screenXNorm: center 0, right edge +1, left edge -1', () => {
  assert.equal(screenXNorm(0, 0), 0);
  assert.ok(Math.abs(screenXNorm(0, 31) - 1) < 1e-12);
  assert.ok(Math.abs(screenXNorm(0, -31) + 1) < 1e-12);
});

test('screenXNorm: quarter-points map to +/-0.5', () => {
  assert.ok(Math.abs(screenXNorm(0, 15.5) - 0.5) < 1e-12);
  assert.ok(Math.abs(screenXNorm(0, -15.5) + 0.5) < 1e-12);
});

test('screenXNorm: out-of-frustum angles extrapolate beyond ±1 (cull, no clamp)', () => {
  assert.ok(screenXNorm(0, 45) > 1); // off right edge
  assert.ok(screenXNorm(0, -45) < -1); // off left edge
  assert.ok(screenXNorm(0, 90) > 1);
  assert.ok(screenXNorm(0, -180) <= 1); // behind: within returned range but culled by isVisibleInFov
});

test('screenXNorm direction convention: clockwise/right is positive', () => {
  // heading north (0), target bearing 90 (east) -> right side of view
  assert.ok(screenXNorm(0, 90) > 0);
  // heading east (90), target bearing 0 (north) -> left side of view
  assert.ok(screenXNorm(90, 0) < 0);
});

test('projectPin end-to-end geometry on corridor fixtures', () => {
  // user at backend CORRIDOR_ANCHOR facing due north
  const user = { lat: 37.7601, lng: -122.4198, heading: 0 };
  const northPin = { lat: 37.762345777937476, lng: -122.4198 };
  const p = projectPin(user, northPin);
  assert.ok(Math.abs(p.bearingDeg - 0) < 1e-9, `bearing ${p.bearingDeg}`);
  assert.ok(Math.abs(p.distanceM - 249.7194579) < 1e-6, `dist ${p.distanceM}`);
  assert.equal(p.visible, true);
  assert.ok(Math.abs(p.screenXNorm - 0) < 1e-9);
});

test('projectPin: pin at 31 deg bearing, 200 m -> right edge, visible', () => {
  const user = { lat: 37.7601, lng: -122.4198, heading: 0 };
  const pin = { lat: 37.76164000593012, lng: -122.41862955931602 };
  const p = projectPin(user, pin);
  assert.ok(Math.abs(p.deltaDeg - 31) < 0.01, `delta ${p.deltaDeg}`);
  assert.ok(Math.abs(p.distanceM - 199.775015) < 0.01, `dist ${p.distanceM}`);
  assert.equal(p.visible, true);
  assert.ok(Math.abs(p.screenXNorm - 1) < 0.001);
});

test('projectPin: pin at 31.5 deg bearing -> just outside, culled', () => {
  const user = { lat: 37.7601, lng: -122.4198, heading: 0 };
  const pin = { lat: 37.76163187237577, lng: -122.41861260511163 };
  const p = projectPin(user, pin);
  assert.ok(Math.abs(p.deltaDeg - 31.5) < 0.01, `delta ${p.deltaDeg}`);
  assert.equal(p.visible, false);
  assert.ok(p.screenXNorm > 1);
});

test('projectPin: pin at 15.5 deg bearing -> screenX +0.5', () => {
  const user = { lat: 37.7601, lng: -122.4198, heading: 0 };
  const pin = { lat: 37.76183128000936, lng: -122.41919269214661 };
  const p = projectPin(user, pin);
  assert.ok(Math.abs(p.deltaDeg - 15.5) < 0.01, `delta ${p.deltaDeg}`);
  assert.ok(Math.abs(p.screenXNorm - 0.5) < 0.01, `sx ${p.screenXNorm}`);
  assert.equal(p.visible, true);
});

test('projectPin: mirrored left-side pin at -15.5 deg -> screenX -0.5', () => {
  const user = { lat: 37.7601, lng: -122.4198, heading: 0 };
  const pin = { lat: 37.76183128000936, lng: -122.42040730785338 };
  const p = projectPin(user, pin);
  assert.ok(Math.abs(p.deltaDeg + 15.5) < 0.01, `delta ${p.deltaDeg}`);
  assert.ok(Math.abs(p.screenXNorm + 0.5) < 0.01, `sx ${p.screenXNorm}`);
  assert.equal(p.visible, true);
});

test('projectPin: behind camera (180 deg) culled', () => {
  const user = { lat: 37.7601, lng: -122.4198, heading: 0 };
  const pin = { lat: 37.7601 - 200 / 111320, lng: -122.4198 };
  const p = projectPin(user, pin);
  assert.equal(p.visible, false);
});

test('projectPin: rotating heading swings screenX symmetrically', () => {
  // Fixed pin due east of the user; panning the device from north to east
  // should sweep the pin from right edge to center. The pin sits on the
  // parallel, so its great-circle initial bearing is 90 - 3.5e-4 deg, not
  // exactly 90; facing it by heading=bearing centers it exactly.
  const user = { lat: 37.7601, lng: -122.4198, heading: 0 };
  const pin = { lat: 37.7601, lng: -122.4198 + 100 / (111320 * Math.cos((37.7601 * Math.PI) / 180)) };
  const north = projectPin(user, pin);
  const east = projectPin({ ...user, heading: 90 }, pin);
  assert.ok(north.screenXNorm > 0.99, `north sx ${north.screenXNorm}`);
  assert.ok(Math.abs(east.screenXNorm) < 1e-4, `east sx ${east.screenXNorm}`); // < 0.01% viewport
  assert.equal(east.visible, true);
  // Facing the pin exactly (heading = its bearing) must center it at 0.
  const facing = projectPin({ ...user, heading: north.bearingDeg }, pin);
  assert.ok(Math.abs(facing.screenXNorm) < 1e-12, `facing sx ${facing.screenXNorm}`);
  assert.equal(facing.visible, true);
});

test('projectPin distance matches distanceMeters (haversine) exactly', () => {
  const user = { lat: 37.7601, lng: -122.4198, heading: 35 };
  const pin = { lat: 37.7632931, lng: -122.4079495 };
  const p = projectPin(user, pin);
  const direct = distanceMeters(user, pin);
  assert.equal(p.distanceM, direct);
});
