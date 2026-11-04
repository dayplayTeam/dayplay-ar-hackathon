/**
 * walkability.test.ts — visual differentiation of walkable vs far placards.
 *
 * Regression context (2026-11-04 judge feedback): walkable outings and far
 * citywide events previously rendered identically, so judges could not tell
 * a 300 m outing from a 3.5 km radar signal. The contract is now:
 *   - WALKABLE (real distance <= 500 m): coral stroke, vivid, walkable badge.
 *   - FAR (real distance > 500 m or corridor-remapped event): faded to
 *     FAR_OPACITY, muted border, honest "◇ FAR · INFO-ONLY" chip.
 * These tests lock the pure decision logic; the render side keys off the
 * `isWalkable` field computed in buildPlacards from the same helpers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FAR_OPACITY,
  isWalkablePin,
  WALKABLE_RADIUS_M,
  walkMinutes,
} from "../walkability.ts";

test("WALKABLE_RADIUS_M matches the zero-hallucination gate walk radius", () => {
  assert.equal(WALKABLE_RADIUS_M, 500);
});

test("isWalkablePin: no real_distance_m -> distanceM decides", () => {
  assert.equal(isWalkablePin(undefined, 300), true);
  assert.equal(isWalkablePin(undefined, 500), true); // boundary: <= 500 walkable
  assert.equal(isWalkablePin(undefined, 501), false);
  assert.equal(isWalkablePin(undefined, 0), true);
});

test("isWalkablePin: real_distance_m overrides the compressed slot distance", () => {
  // Corridor-remapped Union Square event: slot at 300 m, real at 3.4 km.
  assert.equal(isWalkablePin(3400, 300), false);
  // Real distance inside the radius stays walkable even if slot math drifts.
  assert.equal(isWalkablePin(420, 300), true);
  assert.equal(isWalkablePin(500, 300), true); // boundary: exactly 500 walkable
  assert.equal(isWalkablePin(501, 300), false);
});

test("walkMinutes: ~80 m/min brisk walk, minimum 1", () => {
  assert.equal(walkMinutes(80), 1);
  assert.equal(walkMinutes(160), 2);
  assert.equal(walkMinutes(400), 5);
  assert.equal(walkMinutes(0), 1);
  assert.equal(walkMinutes(1234), 15);
});

test("FAR_OPACITY: far placards are substantially faded vs walkable vividness", () => {
  assert.equal(FAR_OPACITY, 0.35);
  assert.ok(FAR_OPACITY < 0.5, "far placards must be clearly dimmed");
});
