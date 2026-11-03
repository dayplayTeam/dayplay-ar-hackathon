/**
 * format.test.ts — display formatters for the AR placard deck and HUD.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  formatBearing,
  formatDistance,
  formatHeadingCardinal,
  formatStartsAt,
} from "../format.ts";

test("formatBearing: zero-padded 3-digit compass badge", () => {
  assert.equal(formatBearing(42), "042°");
  assert.equal(formatBearing(7.4), "007°");
  assert.equal(formatBearing(0), "000°");
  assert.equal(formatBearing(359.6), "000°"); // 360 wraps to 000
  assert.equal(formatBearing(-90), "270°");
});

test("formatHeadingCardinal: heading + 45°-wide sector label", () => {
  assert.equal(formatHeadingCardinal(96), "096° E");
  assert.equal(formatHeadingCardinal(10), "010° N");
  assert.equal(formatHeadingCardinal(45), "045° NE");
  assert.equal(formatHeadingCardinal(270), "270° W");
  assert.equal(formatHeadingCardinal(337), "337° NW");
  assert.equal(formatHeadingCardinal(22), "022° N");
  assert.equal(formatHeadingCardinal(23), "023° NE");
});

test("formatDistance: meters under 1 km, km above", () => {
  assert.equal(formatDistance(142.3), "142 m");
  assert.equal(formatDistance(0.4), "0 m");
  assert.equal(formatDistance(999.4), "999 m");
  assert.equal(formatDistance(1234), "1.2 km");
  assert.equal(formatDistance(2500), "2.5 km");
});

test("formatStartsAt: parses ISO, null on absent/malformed", () => {
  const ok = formatStartsAt("2026-07-06T16:00:00+00:00");
  // Locale-dependent rendering; only assert the day/time separator structure.
  assert.ok(ok !== null && ok.includes("·"), `got ${ok}`);
  assert.ok(/\d/.test(ok ?? ""), `got ${ok}`);
  assert.equal(formatStartsAt(undefined), null);
  assert.equal(formatStartsAt(""), null);
  assert.equal(formatStartsAt("not-a-date"), null);
  assert.equal(formatStartsAt(12345), null);
});
