# Team M3: Physical iPhone Capture Enablement Report (Milestone M3)

**Date:** 2026-11-03  
**Branch:** `feat/expo-ios-m1`  
**Notion Task:** `40cf28e2-2d4f-8104-a0fd-e22dccc94552` (Hackathon T-iOS)  
**Status:** ✅ COMPLETE — capture harness, SF demo anchor toggle, clean video mode, runbook, and ingest pipeline ready.

---

## 1. What Was Built & Verified

### 1.1 Dual-Mode Positioning in `App.tsx`:
- **`SF ANCHOR (DEMO)` Mode:**
  - Locks user base coordinates to SF Mission Valencia corridor (`37.758150, -122.417930`).
  - Compass heading remains **100% LIVE hardware True North from CoreLocation (`Location.watchHeadingAsync`)**.
  - Solves the location constraint: anyone anywhere holding an iPhone running Expo Go can pan their camera 360° on any street or indoor corridor, and True North smoothly projects the real SF placards into view without range culling.
- **`USE DEVICE GPS` Mode:**
  - Toggles back to raw physical phone GPS coordinates from `Location.watchPositionAsync` when walking the live SF corridor.

### 1.2 Aesthetic Video Mode (`REC VIEW`):
- Tap `REC VIEW` to collapse the debug HUD into a subtle pill badge (`AR ACTIVE · TAP TO SHOW HUD`), allowing a clean, aesthetic street camera shot free of telemetry text for the judging video.

### 1.3 Physical Capture Runbook (`ops/hackathon/reviews/m3-capture-runbook.md`):
- Step-by-step instructions for launching `npx expo start --tunnel`, scanning the QR code in Expo Go, setting Do Not Disturb, and executing the exact 60-second shotlist for T5b.

### 1.4 Video Ingestion Pipeline (`scripts/ingest_m3_capture.sh`):
- Normalized ffmpeg transcode script mapping raw iPhone screen recording `.mov`/`.mp4` into standard 1080x1920 60fps MP4 staged at `ops/hackathon/captures/m3-corridor-iphone-capture.mp4`.

---

## 2. Test & Build Verification
- `npx tsc --noEmit` in `ios-app/`: **0 errors, clean pass**.
- `node --test --experimental-strip-types src/math/__tests__/*.test.ts`: **79 / 79 tests passed** (162ms).
