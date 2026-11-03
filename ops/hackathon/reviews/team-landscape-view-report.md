# Team Landscape View — Report

**Branch:** `feat/expo-ios-m1` · **Date:** 2026-11-03 · **Scope:** `ios-app/`

## Objective

Add full Landscape View support to the Hackathon AR iOS app: both portrait and
landscape orientations, dynamic on-the-fly rotation, and orientation-adaptive
HUD / placard / input-bar layouts.

## Changes

### 1. `ios-app/app.json`

- `"orientation": "portrait"` → `"orientation": "default"` — Expo Go / iOS now
  permit both portrait and landscape; rotation happens live on device.

### 2. Responsive viewport & orientation detection

- `App.tsx`: `const isLandscape = screenWidth > screenHeight;` derived from
  `useWindowDimensions()` each render, so rotation is picked up on the fly.
- `PlacardOverlay.tsx`: accepts `isLandscape` (derived in `App.tsx` from the
  same `useWindowDimensions()` values) and also guards on
  `screenWidth > screenHeight` internally in `VenueDeck`.
- `HudBar.tsx` / `InputFilterBar.tsx`: both read `useWindowDimensions()` +
  `useSafeAreaInsets()` per render.

### 3. `HudBar.tsx` — landscape adaptations

- Landscape phones are wide (~800–930 px) and short (~390–430 px); the pill row
  stays a **single horizontal strip** and now clears both side safe-area insets
  (notch / Dynamic Island) via `insets.left` / `insets.right` padding.
- Slightly tighter strip in landscape (`barLandscape`: gap 5, padding 4) so it
  never crowds the central camera viewport.
- Expanded telemetry panel is center-anchored with `maxWidth: 420` in
  landscape so it never spans the full wide strip.
- Minimized pill clears the right inset.

### 4. `PlacardOverlay.tsx` — landscape adaptations

- Horizon line: `HORIZON_Y_FRACTION_LANDSCAPE = 0.45` (vs 0.42 portrait).
- Vertical spread: `VERTICAL_SPREAD_FRACTION_LANDSCAPE = 0.16` (vs 0.22
  portrait) — smaller stack pitch so the pin band fits the short height.
- Hard on-screen clamps: card anchors clamp to
  `screenHeight − CARD_HEIGHT_PX − 24`; `VenueDeck` clamps `top` to the
  viewport minus card (or expanded-page) height; staggered expanded pages clamp
  against the bottom edge. Cards can no longer clip off the bottom.
- Expanded deck window: `MAX_VISIBLE_STACK_LANDSCAPE = 2` pages with
  `STACK_GAP_PX_LANDSCAPE = 6` pitch.
- Width mapping across the wide horizontal FOV: expanded cards hedge with
  `min(HEDGE_MARGIN_PX, cardWidth/2 + 8)` so the full card width stays inside
  the viewport on either edge.
- `resolveOverlaps()` now takes a `bottomChromePx` param: landscape reserves
  56 px (compact bottom bar) vs 96 px portrait, leaving more of the short
  viewport usable.

### 5. `InputFilterBar.tsx` — landscape adaptations

- Compact bottom bar in landscape (`barCompact`: tighter padding, gap) so it
  obstructs less of the viewport.
- Horizontal safe-area insets added to the wrap (and collapsed pill wrap) so
  the bar clears the home indicator area and rounded screen corners in
  landscape.
- Chips render tighter in landscape (`chipCompact`).

### 6. `App.tsx` chrome positioning

- Top HUD wrap: adds `insets.left`/`insets.right` in landscape.
- Intent banner: raised to `bottom: 100` in landscape to sit above the compact
  bar.
- Bottom bar wrap: `insets.bottom + 4` in landscape (vs + 8 portrait).

## Validation

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` (ios-app) | ✅ 0 errors |
| `node --test --experimental-strip-types src/math/__tests__/*.test.ts src/utils/__tests__/*.test.ts` | ✅ 95/95 pass, 0 fail |

## Notes

- The zero-hallucination gate and frustum math (`src/math`) are untouched —
  only presentation-layer mapping/layout changed.
- `resolveOverlaps()`'s new `bottomChromePx` param defaults to the previous
  hardcoded 96, so existing call sites and tests remain valid.
