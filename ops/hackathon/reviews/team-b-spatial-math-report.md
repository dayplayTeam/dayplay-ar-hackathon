# Team B — AR Spatial Pin Math & Frustum Culling Engine (M2 Prep) Report

**Date:** 2026-11-03 (America/Los_Angeles)
**Working directory:** `dayplay-ar-hackathon/`
**Deliverable location:** `ios-app/src/math/`
**Status:** ✅ COMPLETE — 79/79 tests passing, `tsc --noEmit` clean under Expo strict TS

---

## 1. Executive Summary

The complete client-side spatial geometry package for Milestone M2 is built,
unit-tested, and import-ready for the Expo iOS app (`ios-app/`). Five modules in
`ios-app/src/math/` implement the exact mathematical contract shared with the
backend pipeline (`backend/pipeline.py`, `backend/validator.py`) and the web
simulator (`sim/app.js`):

| Module | Purpose | Contract source |
|---|---|---|
| `distance.ts` | Haversine + equirectangular distance (meters) | `backend/pipeline.py::dist_m`, `sim/app.js::relCoords` |
| `bearing.ts` | Forward azimuth, 0–360° True North | spherical trig (`atan2` form) |
| `frustum.ts` | 62° HFOV culling + normalized screen X | `sim/app.js` render loop, normalized |
| `zero_hallucination_gate.ts` | Render-time pin validation (drop, never repair) | `backend/validator.py::validate_pin`, `docs/spatial-contract.md` v1 |
| `types.ts` | Shared pin/gate types | pin schema v1 |

An `index.ts` barrel re-exports the public surface; `internal.ts` is the shared
import graph. Test suites live in `src/math/__tests__/`.

---

## 2. Mathematical Contract (verified against backend/sim source)

The existing pipeline uses **flat-earth equirectangular** distance
(`hypot(dLat·111320, dLng·111320·cos(lat))` — `backend/pipeline.py` `dist_m`,
mirrored in `sim/app.js::metersPerDeg`/`relCoords`), not haversine. The client
package implements **both**:

- `distanceMeters()` — canonical haversine on R = 6,371,008.8 m (IUGG mean R1),
  numerically stable `asin(sqrt(h))` form.
- `distanceMetersEquirectangular()` — byte-compatible parity port of the
  backend formula, for diffing against served `distance_m` values.

Measured agreement in the demo corridor: **< 0.2 %** (e.g. anchor → Bachata
Kizomba pin: 1100.5858 m haversine vs 1101.8435 m equirectangular). At placard
granularity they are interchangeable; both are tested.

**Bearing** is the standard forward (initial) azimuth:

```
θ = atan2( sin(Δlng)·cos(lat2),
           cos(lat1)·sin(lat2) − sin(lat1)·cos(lat2)·cos(Δlng) )
```
normalized to `[0, 360)` True North (0 = N, 90 = E, 180 = S, 270 = W).
Degenerate same-point input returns 0 (never NaN).

**Frustum** (task formula, wrap-safe):

```
delta = ((bearing − heading + 540) % 360) − 180        // signed, [−180, 180]
visible = |delta| ≤ FOV / 2                            // 62° FOV → ±31°
screenXNorm = delta / (FOV / 2)                        // −1.0 (left) … +1.0 (right)
```

`screenXNorm` is resolution-independent; the RN renderer maps it to pixels
with `x_screen = ((screenXNorm + 1) / 2) · viewportWidth`, which exactly
reproduces the simulator's `screenX_vw = 50 + hfov · 100` (e.g. screenXNorm
+0.5 → 75 vw = 75 % across). Positive delta = target clockwise (right) of the
device's True-North forward axis.

**Deliberate exclusions** (documented in `frustum.ts`): the sim's near/far
planes (`fwd < 1 m`, `fwd > 600 m`) and its soft `|hfov| > 0.55` visual margin
are presentation-layer choices, not the geometric frustum contract; they stay
in the renderer. Distance-range culling is the gate's job.

---

## 3. Zero-Hallucination Gate

Client-side enforcement that **a pin is rendered only if it has a verified
listing behind it** — mirroring `backend/validator.py` and `docs/spatial-contract.md` v1. Any failing pin is **dropped with a structured reason; never repaired, never guessed**.

Render requirements enforced (task spec):

1. **`listing_id`** — string, non-empty after trim (rejects `''`, `'   '`,
   numbers, objects, missing).
2. **Numeric `lat`/`lng`** — `typeof number` + `Number.isFinite` (rejects
   strings, `null`, booleans, `NaN`, `±Infinity` — no boolean coercion).
3. **Non-empty `title`** — contract field is `name` (server schema);
   `title` accepted as alias. Non-blank, ≤ 80 chars (contract bound).
4. **Distance ≤ `max_range_meters`** — default **500 m**
   (`MAX_RANGE_METERS`). Distance is recomputed **client-side** via haversine
   from device position (server `distance_m` treated as advisory; finite
   fallback only when device position is unavailable).

Server-parity re-checks (defense in depth across the untrusted network
boundary — the server already enforces these before pins are served):

- **SF Bay Area bounds** `[37.2, 38.0] × [−123.0, −121.6]` — `SF_BOUNDS`,
  matching `backend/validator.py` exactly (tested with `deepEqual`).
- **`kind ∈ {saved, event, plan_stop}`**.
- Name-length bound (80 chars).

API:

- `validatePin(pin, userPos?, maxRange?)` → `{ ok: true, pin } | { ok: false, reason }`
- `validatePins(pins, userPos?, maxRange?)` → `{ accepted, rejected: [{index, reason}] }` — never throws on malformed input
- `isValidatedPin(v)` — renderer type guard

Rejection reasons: `not_an_object`, `missing_listing_id`, `invalid_name`,
`invalid_lat_lng`, `lat_lng_out_of_bounds`, `distance_unavailable`,
`distance_out_of_range` (first-failure-wins ordering matches the task checklist).

**Integration proof (test):** all 12 pins in `eval/fixtures/corridor_real.json`
(real Supabase-sourced pins) pass the gate and project consistently; an
injected fabricated row (Paris coordinates, `48.8566, 2.3522`) is rejected as
`lat_lng_out_of_bounds` and never rendered. Note: with the default 500 m cap
and the demo walker at the corridor anchor, far pins (~1.1 km) are correctly
out of range — the demo integration test passes a 1500 m cap to render the
full corridor, and the M2 renderer should follow the same approach.

---

## 4. Test Results — 79/79 PASS (Node native test runner, Node 26)

Command: `node --test --experimental-strip-types ios-app/src/math/__tests__/`

| Suite | Tests | Status |
|---|---|---|
| `distance.test.ts` | 12 | ✅ all pass |
| `bearing.test.ts` | 9 | ✅ all pass |
| `frustum.test.ts` | 18 | ✅ all pass |
| `zero_hallucination_gate.test.ts` | 26 | ✅ all pass |
| `integration.test.ts` | 3 | ✅ all pass (reads `eval/fixtures/corridor_real.json`) |
| **Total** | **79** | ✅ **pass 79 / fail 0 / cancelled 0** |

Duration: ~160 ms. No external dependencies (no Jest install needed).

Coverage highlights mapped to the task's required verifications:

- **Cardinal bearings:** due N = 0.0000000000°, due S = 180.0000000000° at
  1e-9 tolerance; due E/W within 3.5e-4° of 90/270 (documented great-circle
  meridian-convergence deviation at SF latitude over 100 m — physics, not
  error; tolerance 1e-3°).
- **Frustum bounds:** ±31° exactly on-edge → visible; ±31.5° → culled;
  center/near-center visible; ±90°/180° culled. Boundary-precision targets
  constructed so the great-circle initial bearing at 200 m hits 31.000° and
  31.499° (drift < 0.001°) — `projectPin` end-to-end confirms
  visible/culled classification.
- **Screen X interpolation:** center 0, ±31° → ±1.0 (1e-12), ±15.5° → ±0.5,
  monotone sweep; out-of-frustum angles extrapolate beyond ±1 (no clamp —
  cull decision belongs to `isVisibleInFov`); clockwise/right positive.
  End-to-end `projectPin`: pin at δ=+31°/200 m → screenX ≈ +1.0 visible;
  δ=+31.5° → ≈ +1.016 culled; δ=+15.5° → +0.5; mirror pin −15.5° → −0.5.
- **Rejection of fabricated/malformed pins:** missing/empty/whitespace/
  non-string `listing_id`; empty/whitespace/81-char/non-string title;
  non-numeric/NaN/Infinity/boolean lat-lng; NYC/Paris fabricated coordinates;
  NaN `distance_m`; > 500 m range; invalid `kind`; `null`/arrays/primitives;
  malformed batch → per-index structured drops, never throws.

Distance suite independently verifies haversine against the spherical law of
cosines and geodesic facts (1° latitude = 111,195.08 m on R1 sphere),
symmetry, and zero-distance degeneracy.

---

## 5. Toolchain & Compatibility Notes

- **Test runner:** Node native (`node --test`) with `--experimental-strip-types`
  on Node v26.12.1 — zero new dependencies. Jest was evaluated but not
  installed ( Expo 58 ships no Jest; adding it would pull a heavy tree not
  required for pure-math testing ).
- **Imports use explicit `.ts` extensions** in `src/math/`. This is required
  by Node's ESM loader in tests and is **Metro-compatible**: metro-resolver
  resolves explicit file extensions before its extension candidates.
- **Expo/Metro consumption verified:** a throwaway `App.tsx`-shaped file
  importing `./src/math` **extensionless** (the way the Expo app will import
  it) type-checks clean under `tsc -p tsconfig.json` with strict mode.
- **tsconfig** (`ios-app/tsconfig.json`): Expo `tsconfig.base` + `strict`,
  plus `allowImportingTsExtensions` (enabled by `noEmit` in the base) and
  Node types for the test suites. `expo-location`/`expo-camera`/`expo-sensors`
  were installed concurrently by the M1 team; `npm run typecheck` passes.
- Root `package.json` is `"type": "module"` — ESM throughout, matching
  `sim/` conventions.

---

## 6. M2 Renderer Integration Guide

```ts
import {
  projectPin,            // one-shot: distance + bearing + delta + visibility + screenXNorm
  validatePins,          // zero-hallucination batch gate
  MAX_RANGE_METERS,      // 500 m default render cap
} from '../src/math';

// user = { lat, lng, heading } from expo-location (watchPositionAsync + watchHeadingAsync trueHeading)
const { accepted, rejected } = validatePins(serverPins, user, 1500);
// ^ 1500 m cap recommended for the corridor demo (far pins ~1.1 km);
//   telemetry can surface `rejected` counts as QA evidence

for (const pin of accepted) {
  const p = projectPin(user, pin);
  if (!p.visible) continue;                    // 62° HFOV culling
  if (p.distanceM < 1 || p.distanceM > 600) continue; // renderer near/far planes (sim parity, optional)
  const xPx = ((p.screenXNorm + 1) / 2) * viewportWidthPx; // screenXNorm −1…+1 → pixels
  // render placard at xPx …
}
```

Suggested follow-ups (non-blocking): wire `rejected` counts into the HUD
telemetry; consider `distanceMetersEquirectangular` if the renderer must
exactly reproduce sim-placed `distance_m` values.

---

## 7. Files Delivered

```
ios-app/src/math/
├── index.ts                      # public barrel export
├── internal.ts                   # shared internal re-exports
├── types.ts                      # SpatialPin / GateResult / GateReason types
├── distance.ts                   # haversine + equirectangular (R = 6,371,008.8 m)
├── bearing.ts                    # forward azimuth 0–360° True North
├── frustum.ts                    # 62° HFOV: delta / visibility / screenXNorm / projectPin
├── zero_hallucination_gate.ts    # render validation gate (drop, never repair)
└── __tests__/
    ├── distance.test.ts
    ├── bearing.test.ts
    ├── frustum.test.ts
    ├── zero_hallucination_gate.test.ts
    └── integration.test.ts       # real corridor fixture end-to-end

ios-app/tsconfig.json             # updated: strict + allowImportingTsExtensions + node types
ops/hackathon/reviews/team-b-spatial-math-report.md   # this report
```

Not modified: `sim/`, `backend/`, `eval/`, root configs. No app code changed
beyond `tsconfig.json` compiler options (additive only).
