# Voice Input Integration Report — Expo iOS Hackathon App

**Date:** 2026-11-03 (America/Los_Angeles)
**Branch:** `feat/expo-ios-m1`
**Task:** Voice input integration & camera viewport enablement (zero-native-build, Expo Go-safe)
**Validation:** `npx tsc --noEmit` → 0 errors · `node --test` math+utils → **95/95 pass**

---

## 1. Approach: Zero-Native-Build Voice UX

Expo Go cannot link external native modules (`@react-native-voice/voice` requires a
custom dev build), so voice input ships as a **pristine pure-React-Native experience**
that runs in Expo Go today:

- **VoiceInputButton.tsx** (new, 358 lines) — glassmorphic 🎙️ mic button + full
  "Listening…" overlay built from `Animated` + `Modal` primitives only. No new
  npm dependencies; nothing to link; nothing breaks the existing build.
- **Simulated recognition pass** with real voice-intent presets
  ("What's happening tonight?", "Comedy shows nearby", "ai marketing meetups this
  week", …) presented as *tap-to-transcribe* chips during the listening state.
  The recognition surface is a clean seam: swapping in a real STT later (custom dev
  build) replaces only `transcribe()`.

## 2. Listening Experience (the demo moment)

Tapping the mic opens a glowing voice sheet:

- **Pulse rings** — coral `#FF6B47` rings expanding/fading behind the mic icon
  (`Animated.loop`, opacity 0.45→0, scale 1→1.9).
- **Audio waveform** — 5 coral bars scaling on staggered loops (280–600 ms cycles)
  so the sheet visibly "listens."
- **Coral glowing border + shadow** on the glass sheet (DayPlay dark canon tokens).
- **Voice suggestion chips** — the simulated transcriptions, one tap fills and
  submits the query.
- Cancel + backdrop-tap dismiss.

## 3. Integration Wiring (voice → filter → HUD)

- **InputFilterBar.tsx** — 🎙️ mic embedded in the search row (between input and ✕);
  `onVoiceResult` populates the field, routes `onChangeSearchQuery` +
  `onSubmitQuery`, and forwards an optional app-level `onVoiceQuery` hook.
- **App.tsx** — new `voiceQuery` state captures the voice stream. When the last
  submitted query matches the voice capture, the HUD intent banner flips to the
  voice state: `🎙️ Voice: "coffee & coworking" → N pins in view`. Filtering flows
  through the existing `filterPins()` → `PlacardOverlay` pipeline, so voice queries
  narrow the visible placards and the HUD pin counters update in real time.
  Clearing the filter resets voice state.

## 4. iOS Permission

`app.json` → `expo.ios.infoPlist.NSMicrophoneUsageDescription`:
*"Microphone access is required for hands-free voice intent queries in AR street view."*
(JSON validity verified; camera + location descriptions preserved.)

## 5. Files Changed

| File | Change |
|---|---|
| `ios-app/src/components/VoiceInputButton.tsx` | **NEW** — mic FAB + listening overlay (pulse, waveform, suggestion chips) |
| `ios-app/src/components/InputFilterBar.tsx` | Mic button in search row; `onVoiceResult` → query stream + auto-submit; optional `onVoiceQuery` prop |
| `ios-app/App.tsx` | Voice stream state; 🎙️ voice banner on the HUD; wired `onVoiceQuery` prop |
| `ios-app/app.json` | `NSMicrophoneUsageDescription` added |

## 6. Validation Evidence

- `npx tsc --noEmit` (ios-app/) → **exit 0**, zero TypeScript errors.
- `node --test --experimental-strip-types src/math/__tests__/*.test.ts
  src/utils/__tests__/*.test.ts` → **95 pass / 0 fail** (unchanged core).
- `app.json` parses as valid JSON.
- No runtime/dependency changes — Expo Go launch path untouched.

## 7. Demo Script (60-90s video, Nov 4 cutoff)

1. Pan the Valencia corridor with placards live → tap 🎙️.
2. Listening sheet appears (pulse + waveform) → tap *"Comedy shows nearby."*
3. Placard deck re-filters instantly; HUD banner shows
   `🎙️ Voice: "Comedy shows nearby" → N pins in view`.
4. Repeat with *"What's happening tonight?"* for the second beat.

## 8. Known Limits & Next Step

- Recognition is simulated (preset chips) in Expo Go; real STT requires a custom
  dev build (`expo prebuild` + native speech module) — post-hackathon upgrade path,
  seams isolated to `transcribe()` in `VoiceInputButton.tsx`.
- Future: real streaming waveform from mic amplitude (expo-av) once a dev build
  exists; current waveform is a UI loop.
