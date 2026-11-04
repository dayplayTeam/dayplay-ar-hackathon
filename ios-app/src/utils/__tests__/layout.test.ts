/**
 * layout.test.ts — venue clustering + collision resolution layout helpers.
 *
 * Presentation-layer tests for the capture feedback fix (IMG_5530):
 * the six Mission Rec drop-in sessions share identical coordinates and
 * previously stacked into one illegible pile; they must now collapse into
 * one venue cluster card with a "+N more activities" badge, and any
 * residual cross-venue collisions must resolve with guaranteed spacing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { PlacedPlacard, RawPin } from "../../components/PlacardOverlay.tsx";
import {
  CLUSTER_RADIUS_M,
  groupByVenue,
  MAX_VISIBLE_STACK,
  pickPrimary,
  resolveOverlaps,
  visibleStackPages,
  withClusterSummary,
} from "../layout.ts";

/** Six fixture pins at identical Mission Rec coordinates. */
const MISSION_REC: RawPin[] = [
  {
    listing_id: "rec_aqua_fit",
    name: "Rec Aqua Fit",
    lat: 37.7599,
    lng: -122.4147,
    kind: "event",
    starts_at: "2026-07-06T16:00:00+00:00",
  },
  {
    listing_id: "rec_gym",
    name: "Rec Gym",
    lat: 37.7599,
    lng: -122.4147,
    kind: "event",
    starts_at: "2026-07-06T17:00:00+00:00",
  },
  {
    listing_id: "rec_pool",
    name: "Rec Pool",
    lat: 37.7599,
    lng: -122.4147,
    kind: "event",
    starts_at: "2026-07-06T18:00:00+00:00",
  },
  {
    listing_id: "rec_dropin",
    name: "Rec Drop-In",
    lat: 37.7599,
    lng: -122.4147,
    kind: "plan_stop",
    starts_at: "2026-07-06T19:00:00+00:00",
  },
  {
    listing_id: "rec_yoga",
    name: "Rec Yoga",
    lat: 37.7599,
    lng: -122.4147,
    kind: "event",
    starts_at: "2026-07-06T20:00:00+00:00",
  },
  {
    listing_id: "rec_boxing",
    name: "Rec Boxing",
    lat: 37.7599,
    lng: -122.4147,
    kind: "event",
    starts_at: "2026-07-06T21:00:00+00:00",
  },
];

const OTHER_VENUE: RawPin = {
  listing_id: "valencia_cafe",
  name: "Valencia Cafe",
  lat: 37.7577,
  lng: -122.4212,
  kind: "saved",
};

test("groupByVenue: six identical-coordinate pins collapse into one cluster", () => {
  const groups = groupByVenue([...MISSION_REC, OTHER_VENUE]);
  assert.equal(groups.length, 2, "6 identical pins + 1 other venue = 2 clusters");
  const missionGroup = groups.find((g) => g.length === 6);
  assert.ok(missionGroup, "Mission Rec cluster has all 6 members");
  assert.equal(groups.find((g) => g.length === 1)?.[0].listing_id, "valencia_cafe");
});

test("groupByVenue: distinct venues stay separate", () => {
  const groups = groupByVenue([OTHER_VENUE, MISSION_REC[0]]);
  assert.equal(groups.length, 2);
});

test("groupByVenue: pins beyond the cluster radius do not merge", () => {
  const far = {
    ...MISSION_REC[0],
    listing_id: "rec_far",
    lat: MISSION_REC[0].lat + 0.001, // ~111 m apart, > CLUSTER_RADIUS_M
  };
  const groups = groupByVenue([MISSION_REC[0], far]);
  assert.equal(groups.length, 2);
});

test("groupByVenue: order-preserving first-seen head", () => {
  const groups = groupByVenue([MISSION_REC[2], MISSION_REC[0]]);
  assert.equal(groups[0][0].listing_id, "rec_pool");
  assert.equal(groups[0].length, 2);
});

/** Fabricate a placed placard at a screen position. */
function placed(
  pin: RawPin,
  screenX: number,
  screenY: number,
  distanceM = 100,
): PlacedPlacard {
  return {
    pin,
    screenX,
    screenY,
    distanceM,
    bearingDeg: 0,
    depthScale: 1,
    depthOpacity: 1,
    isWalkable: true,
    clusterCount: 1,
    clusterPins: [],
  };
}

test("pickPrimary: nearest member wins, listing_id breaks ties", () => {
  const members = [
    placed(MISSION_REC[0], 100, 400, 300),
    placed(MISSION_REC[1], 100, 400, 120),
    placed(MISSION_REC[2], 100, 400, 300),
  ];
  assert.equal(pickPrimary(members).pin.listing_id, "rec_gym");
  const tied = [
    placed(MISSION_REC[0], 100, 400, 200),
    placed(MISSION_REC[1], 100, 400, 200),
  ];
  // "rec_aqua_fit" < "rec_gym" lexicographically.
  assert.equal(pickPrimary(tied).pin.listing_id, "rec_aqua_fit");
});

test("withClusterSummary: single member stays a plain card", () => {
  const member = placed(MISSION_REC[0], 100, 400);
  const summarized = withClusterSummary(member, [member]);
  assert.equal(summarized.clusterCount, 1);
  assert.deepEqual(summarized.clusterPins, []);
});

test("withClusterSummary: 6-member cluster carries +5 badge data", () => {
  const members = MISSION_REC.map((pin) => placed(pin, 100, 400));
  const summarized = withClusterSummary(members[0], members);
  assert.equal(summarized.clusterCount, 6);
  assert.equal(summarized.clusterPins.length, 5);
  assert.ok(!summarized.clusterPins.some((p) => p.listing_id === members[0].pin.listing_id));
});

test("resolveOverlaps: overlapping venue cards cascade with min gap", () => {
  const cards = [
    placed(OTHER_VENUE, 200, 300),
    placed(MISSION_REC[0], 200, 300), // same spot, different venue
  ];
  const resolved = resolveOverlaps(cards, 390, 844, 236, 118, 12);
  assert.equal(resolved.length, 2);
  const gap = Math.abs(resolved[1].screenY - resolved[0].screenY);
  assert.ok(gap >= 118 + 12, `cascade gap ${gap} >= cardHeight + minGap`);
});

test("resolveOverlaps: separated venues are untouched", () => {
  const cards = [
    placed(OTHER_VENUE, 60, 300),
    placed(MISSION_REC[0], 320, 500),
  ];
  const resolved = resolveOverlaps(cards, 390, 844, 236, 118, 12);
  assert.equal(resolved[0].screenY, 300);
  assert.equal(resolved[1].screenY, 500);
});

test("resolveOverlaps: clamps cards inside the viewport", () => {
  const cards = [placed(OTHER_VENUE, 200, 843)];
  const resolved = resolveOverlaps(cards, 390, 844, 236, 118, 12);
  // max = 844 - 118 - 96 = 630.
  assert.ok(resolved[0].screenY <= 630);
});

test("visibleStackPages: collapsed=1, expanded capped at MAX_VISIBLE_STACK", () => {
  assert.equal(visibleStackPages(1, true), 1);
  assert.equal(visibleStackPages(6, false), 1);
  assert.equal(visibleStackPages(6, true), MAX_VISIBLE_STACK);
  assert.equal(visibleStackPages(3, true), 3);
});

test("CLUSTER_RADIUS_M is tight enough to never merge distinct venues", () => {
  // Sanity: two pins 40 m apart in latitude must NOT cluster.
  const a = { ...MISSION_REC[0] };
  const b = { ...MISSION_REC[1], lat: MISSION_REC[0].lat + 40 / 111320 };
  assert.equal(groupByVenue([a, b]).length, 2);
  assert.equal(CLUSTER_RADIUS_M, 25);
});
