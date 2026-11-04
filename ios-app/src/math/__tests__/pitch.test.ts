/**
 * Regression tests for the 2026-11-04 "0/19 in FOV" incident: an inverted
 * pitch-floor reading culled EVERY pin while the phone was held upright,
 * blanking the viewport behind a healthy HUD. These tests lock the calibrated
 * semantics: 0° = upright level horizon, +pitch = camera tilted DOWN, and
 * street pins cull only when the axis depression exceeds half the ~50° VFOV.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOOR_CULL_PITCH_DEG,
  isPointingAtFloor,
  horizonYForPitch,
} from '../frustum.ts';

test('upright handheld phone (pitch ~0) NEVER culls street pins', () => {
  // The incident posture: user holding phone normally at 245° SW heading.
  for (const pitch of [0, 5, 10, 15, 20]) {
    assert.equal(isPointingAtFloor(pitch), false, `pitch ${pitch} must not cull`);
  }
});

test('moderate downward tilt (elevated street viewpoint) does not cull', () => {
  for (const pitch of [25, 30, 35, 40, 45, 50]) {
    assert.equal(isPointingAtFloor(pitch), false, `pitch ${pitch} must not cull`);
  }
});

test('steep floor-gaze (past half VFOV + grace) culls street pins', () => {
  for (const pitch of [56, 60, 90]) {
    assert.equal(isPointingAtFloor(pitch), true, `pitch ${pitch} must cull`);
  }
});

test('missing/invalid motion fix never culls (static band)', () => {
  assert.equal(isPointingAtFloor(null), false);
  assert.equal(isPointingAtFloor(undefined), false);
  assert.equal(isPointingAtFloor(Number.NaN), false);
});

test('cull threshold sits past half the camera VFOV', () => {
  assert.equal(FLOOR_CULL_PITCH_DEG, 55);
});

test('level horizon keeps the base band position', () => {
  assert.equal(horizonYForPitch(0, 336, 800), 336);
  assert.equal(horizonYForPitch(null, 336, 800), 336);
  assert.equal(horizonYForPitch(undefined, 336, 800), 336);
});

test('tilting down moves the horizon UP through the frame', () => {
  // 20° down -> 20 * (800/50) = 320px up.
  assert.equal(horizonYForPitch(20, 336, 800), 16);
  // Tilting up (-20°) moves the horizon DOWN by the same scale.
  assert.equal(horizonYForPitch(-20, 336, 800), 656);
});
