/**
 * walkability.test.ts — graduated distance styling contract for AR placards.
 *
 * Regression context (2026-11-04, MrMister feedback): (1) flat 0.35 opacity
 * on every far card produced a "screen of unreadable ghost cards", and (2)
 * no cards appeared walkable even in the demo corridor. The contract now:
 *   - WALKABLE (real distance <= 1200 m): full 1.0 opacity, vivid DayPlay
 *     coral stroke (#FF6B47, 2 px), clear "🚶 N MIN WALK" badge. 1200 m ≈
 *     a 15 min brisk walk (~80 m/min) — the classic walkable-neighborhood
 *     threshold (owner-set, 2026-11-04).
 *   - FAR (real distance > 1200 m): GRADUATED opacity 0.85 @ ~1.2 km down
 *     to 0.60 @ 4.7 km+ (readable, never a 0.35 ghost) — and when NO card
 *     in view is walkable the band elevates to 0.95 -> 0.78 so the closest
 *     cards read as primary radar targets.
 *   - Depth border: coral 2 px walkable; white hairline 0.2 -> 0.1 alpha far.
 * These tests lock the pure decision logic; the renderer keys off the
 * `isWalkable` field + getGraduated* helpers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getGraduatedBorder,
  getGraduatedOpacity,
  isWalkablePin,
  WALKABLE_RADIUS_M,
  walkMinutes,
} from "../walkability.ts";

test("WALKABLE_RADIUS_M is the 1200 m walkable-neighborhood threshold", () => {
  assert.equal(WALKABLE_RADIUS_M, 1200);
});

test("isWalkablePin: no real_distance_m -> distanceM decides", () => {
  assert.equal(isWalkablePin(undefined, 300), true);
  assert.equal(isWalkablePin(undefined, 1199), true); // inside the radius
  assert.equal(isWalkablePin(undefined, 1200), true); // boundary: <= 1200 walkable
  assert.equal(isWalkablePin(undefined, 1201), false);
  assert.equal(isWalkablePin(undefined, 0), true);
});

test("isWalkablePin: real_distance_m overrides the compressed slot distance", () => {
  // Corridor-remapped Embarcadero event: slot at 300 m, real at 4.2 km.
  assert.equal(isWalkablePin(4200, 300), false);
  // Real distance inside the radius stays walkable even if slot math drifts.
  assert.equal(isWalkablePin(420, 300), true);
  assert.equal(isWalkablePin(1200, 300), true); // boundary: exactly 1200 walkable
  assert.equal(isWalkablePin(1201, 300), false);
});

test("walkMinutes: ~80 m/min brisk walk, minimum 1", () => {
  assert.equal(walkMinutes(80), 1);
  assert.equal(walkMinutes(160), 2);
  assert.equal(walkMinutes(400), 5);
  assert.equal(walkMinutes(0), 1);
  assert.equal(walkMinutes(1234), 15);
  // 1200 m (the walkable radius) is a ~15 min walk — the classic
  // walkable-neighborhood threshold.
  assert.equal(walkMinutes(1200), 15);
});

test("graduated opacity: walkable cards are always full vibrant 1.0", () => {
  assert.equal(getGraduatedOpacity(undefined, 100, true, true), 1.0);
  assert.equal(getGraduatedOpacity(undefined, 470, true, false), 1.0);
});

test("graduated opacity: readable 0.85 -> 0.60 ramp when a walkable card IS in view", () => {
  // Just past the radius: smooth ramp tops out at 0.85 at 1200 m
  // (never the old flat 0.35 ghost).
  assert.ok(getGraduatedOpacity(1200, 200, false, true) <= 0.85);
  assert.equal(getGraduatedOpacity(1200, 200, false, true), 0.85);
  // Monotonic decline with true distance...
  const o2k = getGraduatedOpacity(2000, 200, false, true);
  const o3k = getGraduatedOpacity(3000, 200, false, true);
  const o47k = getGraduatedOpacity(4700, 200, false, true);
  assert.ok(o2k > o3k && o3k > o47k, `${o2k} > ${o3k} > ${o47k}`);
  // ...down to a readable 0.60 floor at 4.7 km+.
  assert.equal(o47k, 0.60);
  assert.equal(getGraduatedOpacity(17000, 200, false, true), 0.60);
  // Every far card stays readable: never below 0.60, never above 0.85.
  assert.ok(o2k >= 0.60 && o2k <= 0.85);
});

test("graduated opacity: elevated 0.95 -> 0.78 band when NOTHING walkable is in view", () => {
  // Closest far card steps up as the primary radar target.
  assert.equal(getGraduatedOpacity(1200, 200, false, false), 0.95);
  const o2k = getGraduatedOpacity(2000, 200, false, false);
  const o6k = getGraduatedOpacity(6000, 200, false, false);
  assert.ok(o2k > o6k, "still declines with distance");
  assert.ok(o2k >= 0.78 && o2k <= 0.95);
  assert.equal(o6k, 0.78);
  // Elevated band is strictly brighter than the walkable-present band.
  for (const d of [1400, 2600, 4500, 6000]) {
    assert.ok(
      getGraduatedOpacity(d, 200, false, false) > getGraduatedOpacity(d, 200, false, true),
      `d=${d} must be brighter with no walkable card in view`,
    );
  }
});

test("graduated border: vivid DayPlay coral 2 px stroke on walkable cards", () => {
  const b = getGraduatedBorder(undefined, 300, true);
  assert.equal(b.borderWidth, 2);
  assert.match(b.borderColor, /255, 107, 71/);
});

test("graduated border: subtle white depth hairline fading 0.2 -> 0.1 on far cards", () => {
  assert.equal(getGraduatedBorder(1200, 200, false).borderColor, "rgba(255, 255, 255, 0.20)");
  assert.equal(getGraduatedBorder(4700, 200, false).borderColor, "rgba(255, 255, 255, 0.10)");
  assert.equal(getGraduatedBorder(17000, 200, false).borderColor, "rgba(255, 255, 255, 0.10)");
  assert.equal(getGraduatedBorder(4700, 200, false).borderWidth, 1);
});
