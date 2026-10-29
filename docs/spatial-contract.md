# Spatial Pin Data Contract (v1)

Every pin in the AR scene derives from a VERIFIED DayPlay listing. The renderer
MUST reject any pin that fails validation — this is the no-hallucination invariant
that differentiates us (and the core of our Impact story).

## Pin Schema
```json
{
  "listing_id": "string (required, non-empty, from DayPlay MCP/REST response)",
  "name": "string (required, ≤80 chars, from listing — never model-generated)",
  "lat": "number (required, WGS84)",
  "lng": "number (required, WGS84)",
  "kind": "saved | event | plan_stop",
  "starts_at": "ISO-8601 or null (events/plan stops)",
  "ends_at": "ISO-8601 or null",
  "distance_m": "number (computed client-side from user position)",
  "source_tool": "string (MCP tool or REST endpoint that returned it)",
  "grounding": "null | {\"box\":[x1,y1,x2,y2], \"confidence\": float, \"frame_ts\": iso}"
}
```

## Validation Gate (applies before render)
1. `listing_id` present and non-empty; must appear in the raw tool response payload.
2. `lat`/`lng` within SF Bay Area bounds (37.2–38.0, -123.0–-121.6) — reject outliers.
3. `name` byte-identical to the listing name in the tool response (no paraphrase).
4. Pins older than their `ends_at` (or >24h stale with no schedule) are dropped.

## Corridor Fixtures (Mission St, SF)
Demo corridor: Valencia St between 16th St and 24th St.
- Fixture file: `eval/fixtures/corridor.json` (populated from DayPlay data when MCP auth lands; until then schema-valid synthetic fixtures marked `"source_tool": "FIXTURE-SYNTHETIC"` are allowed for simulator development ONLY — never in the demo video).

## Grounding
`sam-3.1` returns `<|box;x1,y1,x2,y2|>` geometry per storefront frame; the client
stores it in `pin.grounding` and anchors the placard to the projected box center.
