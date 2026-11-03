# Team M2 — AR Overlay Placard Assembly Report

**Date:** 2026-11-03 · **Branch:** `feat/expo-ios-m1` · **Commit:** `593e032`
**Scope:** `ios-app` — Milestone M2 floating spatial placards (Expo React Native).

## Deliverables

| File | Purpose |
|---|---|
| `ios-app/src/components/PlacardOverlay.tsx` | AR placard overlay: gate → frustum → screen mapping → layout → depth styling |
| `ios-app/src/data/pinsClient.ts` | 12 embedded corridor fixtures + `fetchRealPins()` with offline fallback |
| `ios-app/App.tsx` | Live GPS/heading wiring, HUD placard counter, DEMO/LIVE source toggle |

## 1. PlacardOverlay pipeline (`PlacardOverlay.tsx`)

Props: `pins: RawPin[]`, `userPosition: UserPosition | null`, `userHeading: number | null`,
`screenWidth`, `screenHeight`, optional `onStats` (HUD telemetry).

1. **Zero-hallucination gate** — `validatePins(pins, userPosition)` from
   `src/math/zero_hallucination_gate`. Pins that fail (bad listing_id, invalid
   lat/lng, out of SF bounds, >500 m) are **dropped, never repaired**; drop
   reasons surface in the HUD as "(n gated)". With no GPS fix nothing renders
   (fixtures carry no `distance_m`, so the gate has no distance to range-check).
2. **Frustum projection** — `projectPin()` from `src/math/frustum` computes
   bearing, haversine distance, signed delta from True-North heading, and
   `screenXNorm ∈ [-1, +1]`; only pins with `projected.visible === true`
   (within the 62° HFOV, ±31°) are kept.
3. **Screen mapping** — exact contract formula
   `screenX = screenWidth * (projected.screenXNorm * 0.5 + 0.5)`, clamped to a
   72 px hedge so cards stay on-screen at the frustum edges.
4. **Vertical layout** — center-horizon line at 42% of screen height; near pins
   render lower (spread up to +22% of height), far pins converge toward the
   horizon. Collision stacking (48 px bucket, 96 px pitch) cascades the four
   Mission Rec pins that share identical coordinates instead of piling up.
5. **Placard card** — venue title (2-line cap), distance indicator ("142 m" /
   "1.2 km"), bearing badge ("042°", zero-padded), kind/category tag
   (SAVED/EVENT/PLAN with accent colors), depth scaling
   (`scale 1.2 → 0.7`, `opacity 1.0 → 0.55` over the 500 m render range).

## 2. Pins client (`pinsClient.ts`)

- `CORRIDOR_REAL_FIXTURES`: the 12 verified real corridor pins from
  `eval/fixtures/corridor_real.json`, embedded field-for-field
  (listing_id, name, lat, lng, kind, starts_at, source_tool). Verified with a
  runtime diff against the source JSON: **MATCH** (including the U+2019 in
  "Mission District's 4th of July" — caught and fixed during assembly).
- `fetchRealPins(apiUrl?)`: resolves the API base from the argument or
  `EXPO_PUBLIC_API_URL`; `GET ${API_URL}/pins?source=real` with a 4 s timeout;
  accepts a bare array or a `{ pins: [...] }` envelope; **falls back to the
  bundled fixture** on unset URL, non-2xx, malformed payload, timeout, or any
  network error (reason returned as `error` for the HUD note).
- `resolveApiUrl()` exported for backend wiring/tests.

## 3. App integration (`App.tsx`)

- `PlacardOverlay` mounted over the camera; fed live GPS from
  `watchPositionAsync` (`latitude`, `longitude`, `accuracy`) and True-North
  heading from `watchHeadingAsync` (`trueHeading`, normalized to [0, 359],
  `-1` sentinel → `null`). Screen size from `useWindowDimensions`.
- HUD additions:
  - **PINS counter**: `PINS: 3/12 in 62° FOV` (visible vs total, plus
    `(n gated)` when the gate drops pins).
  - **SRC row**: status pill (`DEMO` / `LIVE API`, with fallback reason, e.g.
    `DEMO (network: ...)` when a live fetch fails) and a toggle button
    (`TRY LIVE API` ⇄ `DEMO PINS`). Switching to LIVE re-runs `fetchRealPins()`;
    a failed live fetch degrades silently to demo data.
- On mount, a non-blocking `fetchRealPins()` probes the API once; the app
  defaults to demo fixtures until/if live data arrives.

## 4. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` (strict) in `ios-app/` | ✅ clean (exit 0) |
| `node --test --experimental-strip-types src/math/__tests__/*.test.ts` | ✅ **79/79 pass**, 0 fail |
| Embedded fixtures vs `eval/fixtures/corridor_real.json` runtime diff | ✅ 12/12 field-match |
| `fetchRealPins()` offline path (no API URL) | ✅ returns 12 demo pins, `source=demo`, no error |

Notes:
- Render correctness depends on the live rig: without GPS+heading lock the
  overlay correctly renders nothing (gate cannot range-check without a fix);
  the HUD shows "warming" until both lock.
- The four Mission Rec fixture pins share identical coordinates; stacking is
  handled presentation-side (cascade), consistent with the frustum module's
  documented split of geometry vs presentation.

## Gaps / follow-ups

- Live-API path untested against a running backend (no backend was up during
  assembly); fallback behavior is unit-verified offline only.
- `onStats` fires per render; fine at current pin counts, could be
  throttled if pin volume grows.
