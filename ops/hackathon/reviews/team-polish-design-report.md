# Team Polish — AR Placard & HUD UI/UX Redesign Report

**Date:** 2026-11-03 · **Branch:** `feat/expo-ios-m1` · **Commit:** `2af69e9`
**Scope:** `ios-app` — Milestone M4 polish pass from physical iPhone capture feedback (IMG_5530).

## Deliverables

| File | Purpose |
|---|---|
| `ios-app/src/theme/dayplay.ts` | DayPlay canonical dark theme tokens — single source of truth for the AR layer |
| `ios-app/src/utils/layout.ts` | Venue clustering + collision resolution layout helpers (presentation only) |
| `ios-app/src/utils/format.ts` | Shared display formatters (bearing, distance, heading-cardinal, starts_at) |
| `ios-app/src/components/PlacardOverlay.tsx` | Rewritten placard overlay: cluster → deck interaction, DayPlay canon styling |
| `ios-app/src/components/HudBar.tsx` | New compact top pill-bar HUD (standard / expanded / minimized) |
| `ios-app/src/utils/__tests__/layout.test.ts` | 12 clustering/overlap/layout tests |
| `ios-app/src/utils/__tests__/format.test.ts` | 4 formatter tests |
| `ios-app/App.tsx` | Wiring: three-mode HUD state replaces the `cleanView` boolean + debug HUD block |

## 1. Clustering & collision stacking (feedback #1)

Root cause from the capture: the six Mission Rec drop-in sessions share
**identical coordinates**, and every pin rendered its own placard — piling
into one illegible stack. Fix is presentation-layer (`src/math` untouched,
consistent with the M2 split of geometry vs presentation):

1. **`groupByVenue()`** — pins whose coords differ by ≤ `CLUSTER_RADIUS_M`
   (25 m) in both axes merge into one venue cluster. The six Mission Rec
   fixtures collapse to a single card.
2. **Primary card + badge** — `pickPrimary()` (nearest member; `listing_id`
   tiebreak for determinism) anchors the card at the exact venue position;
   the rest surface as a coral **"+5 more activities"** pill badge.
3. **Tap-to-expand page deck** — tapping the venue card expands a staggered
   deck at the same anchor: focused `DetailPage` (title, `starts_at`, page
   x/y, listing id, **Directions →** Apple Maps walking handoff) plus dimmed
   neighbor pages (tap to focus). Window capped at `MAX_VISIBLE_STACK` = 4
   pages with circular focus rotation, so even a 6-page cluster stays
   on-screen. Tap-outside backdrop or ✕ Close collapses back.
4. **Cross-venue collisions** — different venues that still project to the
   same spot from a given heading are cascaded by `resolveOverlaps()`,
   which guarantees ≥ card-height + `MIN_CARD_GAP_PX` (12 px) of vertical
   separation and clamps every card inside the viewport.

## 2. DayPlay dark canon & spatial polish (feedback #2)

`src/theme/dayplay.ts` centralizes every token; both components consume
imports only — no hardcoded hex in components (except intentional
alpha-composited tints derived from the coral token):

| Token | Value | Used for |
|---|---|---|
| `SURFACE` | `#1C1B1A` | canonical canvas |
| `BORDER` | `#2A2826` | hairline card/HUD borders |
| `SURFACE_GLASS` | `rgba(28,27,26,0.85)` | glassmorphic card + HUD fill |
| `ACCENT_CORAL` | `#FF6B47` | LIVE dot, +N badge, selected card border, Directions button |
| `TEXT_PRIMARY` | `#F5F4F2` | bold titles, distance value |
| `TEXT_SECONDARY` | `#A19D97` | bearing, captions, meta |
| `RADIUS` | `16` | card/HUD panel corners |

Depth feel: layered drop shadow (`opacity 0.55, radius 14, y 6`), a brighter
1 px top edge (`rgba(255,255,255,0.07)` inner-glow hint), and distance-driven
`scale 1.2→0.7` / `opacity 1.0→0.55` attenuation. Focused pages are never
attenuated (full opacity/scale) since they're being read.

Refined pill chips per card:
- **Distance** — `142 m` / `1.2 km` (`formatDistance`) in a pill with a ◎ pin
  glyph, bold primary text, tabular numerals.
- **Bearing** — zero-padded `042°` (`formatBearing`) in a muted secondary pill.
- **Category** — `EVENT` (coral) / `PLAN` (violet `#A78BFA`) / `SAVED`
  (emerald `#34D399`) tinted pills, per-kind accent colors.

## 3. HUD compaction (feedback #3)

The old debug HUD was a ~10-row stack (~40% of viewport height). New
`HudBar` has three modes:

- **Standard** — one 32 px-tall glass pill row:
  `[096° E ±3°●] [6/12 in FOV ✕1] [SF ANCHOR] [● LIVE] [▾] [●]`
  Compass chip (heading + cardinal sector via `formatHeadingCardinal`, 45°
  sectors), pins counter with gated-drop badge, mode chip (tap = toggle SF
  anchor / live GPS), source dot (tap = toggle demo/live), expand chevron,
  minimize glyph.
- **Expanded** — telemetry panel (GPS/CMP lock dots, SRC + toggle, MODE +
  toggle, venue-card count, rig error) drops below the same pill bar on
  demand.
- **Minimized** ("REC VIEW" equivalent) — a tiny `● AR` pill, near-zero
  footprint; tap restores the standard bar.

In `App.tsx`, the `cleanView` boolean was replaced by a
`hudMode: "standard" | "expanded" | "minimized"` state; the old debug block
and its styles (`hud*`, `StatusPill`, `pill*`, `toggle*`, `rec*`) are removed.

## 4. Tappable interaction (feedback #4)

- Every collapsed venue card is a `Pressable` with `accessibilityRole="button"`
  and a spoken label (`"Mission Rec Center, 142 m away, plus 5 more activities"`).
- Expanded pages: focused page renders full details + **Directions →**
  (`https://maps.apple.com/?daddr=...&dirflg=w` — universal https link, no
  Info.plist query-scheme entry needed) and **✕ Close**; unfocused pages are
  tappable to focus. Focused pages are non-pressable containers with sibling
  buttons — avoids nested-touchable double-fire.
- The interaction state (expanded/focusIndex) lives in each `VenueDeck`, so
  heading-driven re-projection never resets a user's reading position except
  to keep the index in range.

## 5. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` (strict) in `ios-app/` | ✅ 0 errors |
| `node --test --experimental-strip-types src/math/__tests__/*.test.ts` | ✅ 79/79 pass (0 regressions) |
| `node --test src/utils/__tests__/*.test.ts` (new) | ✅ 16/16 pass |
| Combined suite | ✅ **95/95 pass**, 0 fail |
| Embedded fixtures vs `eval/fixtures/corridor_real.json` runtime diff | ✅ 12/12 field-match |
| Mission Rec clustering (6 identical coords → 1 venue card) | ✅ unit-tested |
| Cross-venue cascade gap ≥ 118 + 12 px | ✅ unit-tested |

## Gaps / follow-ups

- The expanded deck staggers pages **vertically** below the anchor (pitch
  `EXPANDED_PAGE_HEIGHT_PX + STACK_GAP_PX`); a horizontal carousel/swipe
  pager is the next iteration if vertical stacking crowds the lower half on
  small screens.
- No hours/description fields exist in the corridor fixtures or the
  `/pins` contract — the expanded card shows `starts_at` + listing id +
  Directions handoff. Adding `hours`/`description` to the backend pipeline
  would let the focused page render full venue details without new data
  paths.
- Live-device capture re-verification (runbook `ops/hackathon/m3-capture-runbook.md`)
  pending; all fixes are unit-verified off-device this pass.
