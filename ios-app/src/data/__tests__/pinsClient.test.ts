/**
 * Tests for mapMcpItemsToPins — live MCP -> gate-renderable corridor pins.
 * Regression context (2026-11-04): the "0/19 in FOV" weekend incident. 19
 * live citywide events mapped at REAL coordinates (Union Square ~3.5 km,
 * Embarcadero ~4.5 km...) were all rejected by the 500 m zero-hallucination
 * gate; the honest-zero card then fired falsely over a healthy HUD. These
 * tests lock the bearing-preserving corridor remap + honest distance labels.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CORRIDOR_REAL_FIXTURES, mapMcpItemsToPins } from '../pinsClient.ts';

const ANCHOR = { lat: 37.75815, lng: -122.41793 }; // Valencia & 20th (SF Mission anchor)

function mcpItem(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ev-1',
    title: 'Union Square Live Event',
    latitude: 37.788874, // Union Square ~3.4 km NE of the anchor
    longitude: -122.407828,
    event_start_date: '2026-11-07T20:00:00+00:00',
    ...over,
  };
}

test('far citywide event is remapped inside the walk radius with TRUE bearing preserved', () => {
  const pins = mapMcpItemsToPins([mcpItem()], ANCHOR.lat, ANCHOR.lng);
  assert.equal(pins.length, 1);
  const pin = pins[0];
  // Inside the 1200 m gate radius (gate accepts at ~1150 m max).
  const dLat = (pin.lat - ANCHOR.lat) * 110540;
  const dLng = (pin.lng - ANCHOR.lng) * 111320 * Math.cos((ANCHOR.lat * Math.PI) / 180);
  const dist = Math.sqrt(dLat * dLat + dLng * dLng);
  assert.ok(dist <= 1200, `remapped distance ${dist} must be <= 1200`);
  assert.ok(dist >= 200, `remapped distance ${dist} must be >= 200 (not at feet)`);
  // Bearing preserved: Union Square is NE of the anchor — remapped pin too.
  assert.ok(dLat > 0 && dLng > 0, 'NE event must land NE of the anchor');
});

test('remapped far pin carries honest real_distance_m', () => {
  const pins = mapMcpItemsToPins([mcpItem()], ANCHOR.lat, ANCHOR.lng);
  const real = pins[0].real_distance_m;
  assert.equal(typeof real, 'number');
  // Union Square is ~3.4 km from the anchor.
  assert.ok((real as number) > 3000 && (real as number) < 4000, `real=${real}`);
});

test('near event inside the walk radius keeps REAL coordinates untouched', () => {
  // ~286 m SE of anchor (inside the 1170 m walk band).
  const pins = mapMcpItemsToPins(
    [mcpItem({ id: 'ev-near', title: 'Nearby Event', latitude: 37.75715, longitude: -122.41493 })],
    ANCHOR.lat,
    ANCHOR.lng,
  );
  const pin = pins[0];
  assert.equal(pin.source_tool, 'dayplay_mcp_live'); // NOT remapped
  assert.equal(pin.lat, 37.75715);
  assert.equal(pin.lng, -122.41493);
});

test('event outside SF bounds is dropped (never guessed)', () => {
  const pins = mapMcpItemsToPins(
    [mcpItem({ id: 'ev-mon', latitude: 36.6002, longitude: -121.8974 })], // Monterey: below SF_BOUNDS
    ANCHOR.lat,
    ANCHOR.lng,
  );
  assert.equal(pins.length, 0);
});

test('coordinate-less event gets a deterministic corridor slot in the front band', () => {
  const pins = mapMcpItemsToPins(
    [mcpItem({ id: 'ev-none', latitude: null, longitude: null })],
    ANCHOR.lat,
    ANCHOR.lng,
  );
  assert.equal(pins.length, 1);
  const pin = pins[0];
  const dLat = (pin.lat - ANCHOR.lat) * 110540;
  const dLng = (pin.lng - ANCHOR.lng) * 111320 * Math.cos((ANCHOR.lat * Math.PI) / 180);
  const dist = Math.sqrt(dLat * dLat + dLng * dLng);
  assert.ok(dist >= 200 && dist <= 1200, `slot dist ${dist} within band`);
  // First slot starts due north (+90 in compass bearing = +Y). Front half
  // means the pin is north of the user.
  assert.ok(dLat > 0, 'first slot must be in the front (north) half');
});

test('19 citywide weekend events (incident replay) ALL land inside the 1200 m gate', () => {
  // Deterministic spread across SF (Union Sq, Embarcadero, Inner Richmond,
  // Financial District, Sunset...) mirroring the reported weekend pull.
  const far = [
    [37.788874, -122.407828], // Union Square ~3.4 km
    [37.7955, -122.3937], // Embarcadero ~4.2 km
    [37.7749, -122.4194], // Civic Center ~1.9 km
    [37.7793, -122.4192], // ~2.3 km
    [37.7694, -122.4862], // Inner Sunset ~6.1 km
    [37.7845, -122.4080], // ~2.9 km
    [37.8004, -122.4343], // Marina ~4.9 km
    [37.7520, -122.4470], // Panhandle-ish ~2.5 km
    [37.7902, -122.4620], // Presidio ~5.9 km
    [37.7876, -122.3990], // ~3.2 km
    [37.7560, -122.4060], // ~1.1 km
    [37.7620, -122.4360], // ~1.6 km
    [37.7690, -122.4460], // ~2.4 km
    [37.7730, -122.4030], // ~2.2 km
    [37.7810, -122.4130], // ~2.6 km
    [37.7540, -122.4180], // ~0.5 km edge
    [37.7800, -122.4380], // ~2.2 km
    [37.7720, -122.4260], // ~1.6 km
    [37.7910, -122.4160], // ~3.7 km
  ];
  const items = far.map(([lat, lng], i) =>
    mcpItem({ id: `ev-${i}`, title: `Weekend Event ${i}`, latitude: lat, longitude: lng }),
  );
  const pins = mapMcpItemsToPins(items, ANCHOR.lat, ANCHOR.lng);
  assert.equal(pins.length, 19);
  for (const pin of pins) {
    const dLat = (pin.lat - ANCHOR.lat) * 110540;
    const dLng = (pin.lng - ANCHOR.lng) * 111320 * Math.cos((ANCHOR.lat * Math.PI) / 180);
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    assert.ok(dist <= 1200, `${pin.name} at ${Math.round(dist)} m must pass the gate`);
    assert.equal(typeof pin.real_distance_m, 'number');
  }
});

test('golden-angle spiral distributes coordinate-less pins across ALL quadrants', () => {
  const items = Array.from({ length: 19 }, (_, i) =>
    mcpItem({ id: `sp-${i}`, title: `No-coords Event ${i}`, latitude: null, longitude: null }),
  );
  const pins = mapMcpItemsToPins(items, ANCHOR.lat, ANCHOR.lng);
  let north = 0;
  let east = 0;
  for (const pin of pins) {
    if (pin.lat > ANCHOR.lat) north += 1;
    if (pin.lng > ANCHOR.lng) east += 1;
  }
  // 19 golden-angle samples must cover both halves on both axes.
  assert.ok(north >= 5 && north <= 14, `north=${north}`);
  assert.ok(east >= 5 && east <= 14, `east=${east}`);
});

test('LIVE blend: verified corridor anchors ride along with live events (never an empty street)', () => {
  // Simulate the fetchRealPins success-path blend: corridor fixtures + live
  // citywide events. The user must ALWAYS see the verified walkable anchors
  // (Feral Friday ~349 m, Mission Rec ~469 m from the anchor) even when
  // every live event is far — the MrMister "no walkable cards" regression.
  const farEvents = mapMcpItemsToPins(
    [mcpItem({ id: 'ev-union', title: 'Union Square Live Event', latitude: 37.788874, longitude: -122.407828 })],
    ANCHOR.lat,
    ANCHOR.lng,
  );
  assert.equal(farEvents.length, 1);
  assert.ok((farEvents[0].real_distance_m as number) > 1200, 'live event is far');

  const blended = [
    ...CORRIDOR_REAL_FIXTURES.map((p) => ({ ...p, is_walkable_anchor: true })),
    ...farEvents,
  ];
  assert.equal(blended.length, 13);
  // At least two verified anchors are inside the 1200 m walk radius from
  // the corridor anchor: Feral Friday and the Mission Rec cluster.
  const mPerDegLng = 111320 * Math.cos((ANCHOR.lat * Math.PI) / 180);
  const walkableAnchors = blended.filter((p) => {
    if (p.is_walkable_anchor !== true) return false; // verified anchors only
    const dx = (p.lng - ANCHOR.lng) * mPerDegLng;
    const dy = (p.lat - ANCHOR.lat) * 110540;
    return Math.sqrt(dx * dx + dy * dy) <= 1200;
  });
  assert.ok(walkableAnchors.length >= 2, `only ${walkableAnchors.length} walkable anchors`);
  for (const a of walkableAnchors) {
    assert.equal(a.is_walkable_anchor, true);
    assert.equal((a as { source_tool?: unknown }).source_tool, 'supabase_entities_anon', 'anchors keep verified provenance');
  }
});
