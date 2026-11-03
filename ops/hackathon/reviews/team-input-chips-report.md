# Team Report — AR Input Bar & Quick Intent Filter Chips

Branch: `feat/expo-ios-m1` · Commit: `e27d95d` · Date: 2026-11-03

## Scope
Glassmorphic bottom input bar with preloaded query text and horizontal quick
intent filter chips, wired into the Expo AR camera screen.

## Deliverables
- **`ios-app/src/components/InputFilterBar.tsx`** (new)
  - DayPlay Dark Canon tokens from `src/theme/dayplay.ts`: glass surface
    `rgba(28,27,26,0.88)`, border `#2A2826`, coral `#FF6B47` active chips with
    `#F5F4F2` text, inactive chips `rgba(255,255,255,0.08)` / `#A19D97`,
    input text `#F5F4F2`, placeholder `#64748b`, `🔍` icon.
  - 5 quick intent chips (horizontal ScrollView): ⚡ What's live now ·
    📅 Happening today · 🎉 Happening this weekend · ☕ Coffee & coworking ·
    🍸 Nightlife & lounges. Tap toggles off the same chip, selects a new one.
  - Text input preloaded with "ai marketing meetups this week", `✕` clear,
    `↵` submit button + submit-on-enter (`returnKeyType="search"`).
  - Layout: bottom docked above safe-area bottom inset (parent wraps with
    `insets.bottom`); `hidden` prop renders nothing (REC VIEW); `collapsed`
    prop renders a minimal floating pill with `onExpand` to restore.
- **`ios-app/App.tsx`** integration
  - Full prop handler set: `activeChip`, `searchQuery`, `onSelectChip`,
    `onChangeSearchQuery`, `onSubmitQuery`, `onClearFilter`, `resultCount`.
  - Client-side `filterPins()`: chip keywords + tokenized free-text query
    matched against pin `name`/`kind`; no-match non-empty queries fall back
    to the primary 3 demo pins with a banner
    `Intent: "ai marketing meetups this week" (3 pins mapped)`.
  - Placard overlay + HUD `PINS: x/y in FOV` counter now reflect the
    filtered pin set via `overlayStats`.
  - Bar hidden entirely in REC VIEW (`hudMode === "minimized"`).

## Validation
- `npx tsc --noEmit` → 0 errors (strict).
- `node --test --experimental-strip-types src/math/__tests__/*.test.ts
  src/utils/__tests__/*.test.ts` → 95/95 pass, 0 fail.
- Committed to `feat/expo-ios-m1`.

## Notes / follow-ups
- Chip semantic date filtering ("today"/"weekend") currently keys off pin
  name/kind text; wire `starts_at` date logic when the live backend ships it.
- `resultCount` badge and the collapsed pill are parent-controlled; hook the
  pill to a long-press or double-tap gesture if auto-collapse is wanted.
