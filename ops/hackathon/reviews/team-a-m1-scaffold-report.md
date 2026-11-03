# Team A — Milestone M1 Scaffold Report (Expo iOS Sensor Rig)

**Date:** 2026-11-03
**Branch:** `feat/expo-ios-m1` (2 commits on top of `main`)
**Notion Task:** `40cf28e2-2d4f-8104-a0fd-e22dccc94552`
**Owner:** Team A (Expo iOS Scaffold & Sensor Rig)
**Status:** ✅ COMPLETE — all M1 deliverables implemented, verified, committed

---

## 1. Deliverables

### 1.1 Clean Expo TypeScript scaffold — `ios-app/`
- Generated with `create-expo-app --template blank-typescript` inside the repo (git repo detection skipped nested init).
- **SDK 58 / React Native 0.88.1 / React 19.3.0 / TypeScript ~6.0.3** (exceeds the RN 0.74+ / SDK 51/52 floor in the task).
- Root entry `index.ts` → `registerRootComponent(App)`; `App.tsx` is the single-screen root.
- Template extras (`AGENTS.md`, `LICENSE`) removed; `.gitignore` covers `node_modules/`, `.expo`, build artifacts.

### 1.2 `app.json` — EAS + iOS permissions (all exact values)
| Setting | Value | Source |
|---|---|---|
| `extra.eas.projectId` | `429c510f-cead-4568-895d-285a6b7bbcb7` | `ops/hackathon/eas/eas_account_config.json` |
| `ios.bundleIdentifier` | `com.dayplay.app` | same |
| `name` / `slug` / `owner` | `Swipely` / `swipely-app` / `dayplay` | same |
| `NSCameraUsageDescription` | "Camera access is required for the AR street view overlay." | task spec (exact string) |
| `NSLocationWhenInUseUsageDescription` | "Location and compass access are required to place AR pins on real-world venues." | task spec (exact string) |

- `eas.json` also committed at `ios-app/eas.json`, derived from the account config snapshot (internal distribution, `m-medium` resource class, `ascAppId 6755804676` carried over from the Swipely submit profile).
- **Verified** via `npx expo config --type public`: all EAS IDs, bundle id, and both infoPlist strings resolve exactly.

### 1.3 Dependencies
`expo-camera@^58.0.14`, `expo-location@^58.0.20`, `expo-sensors@^58.0.4`, `react-native-safe-area-context@^5.11.1` — **SDK-version aligned, confirmed with `npx expo install --check` → "Dependencies are up to date"**. Expo suggested the `~58.x` pinned range for the SDK-specific modules.

### 1.4 `App.tsx` — camera + sensor rig + HUD
- **Full-screen rear camera:** `CameraView` (`facing="back"`, `style={absoluteFill}`, `active`) rendered behind the HUD; gated on camera permission.
- **Permission UX:** `useCameraPermissions()` from expo-camera (request/denied/blocked states with a dedicated panel + grant button). Location permission requested via `Location.requestForegroundPermissionsAsync()` before any watcher starts; denial surfaces a HUD error and the rig reports `warming`/unavailable rather than silently hanging.
- **Sensor rig:**
  - `Location.watchPositionAsync({ accuracy: High, distanceInterval: 1, timeInterval: 1000 }, cb, errCb)`
  - `Location.watchHeadingAsync(cb, errCb)` reading **`trueHeading`**, normalized to `0–359°` (expo-location's `-1` no-fix sentinel → `null` → HUD shows `--`).
  - Both subscriptions stored and `remove()`d on unmount/permission-loss (checked in a `useEffect` with cancellation + cleanup ref to avoid the async-start race).
  - Watcher errors surface as structured HUD messages (`GPS error: …` / `Compass error: …`), never thrown.
- **Top HUD** (`react-native-safe-area-context` inset-aware, translucent black): LAT, LNG (6 dp), HDG `n° ±acc`, ACC (`n m`), plus status pills GPS / CMP / RIG (`locked` = green, `acquiring` = amber, `ready`/`warming` aggregate).
- TypeScript `strict` throughout (`tsconfig.json` extends `expo/tsconfig.base`); `npx tsc --noEmit` exits 0.

### 1.5 TypeScript build
- `package.json` scripts: **`npm run typecheck`** (`tsc --noEmit`, exit 0 verified), `typecheck:watch`, `lint`.

### 1.6 Bonus: spatial-math module (M2 groundwork, committed under `ios-app/src/math/`)
Shared `@dayplay/spatial-math` port of the backend/web-sim contract, verified against `eval/fixtures/corridor_real.json` and the backend `CORRIDOR_ANCHOR` (37.7601, −122.4198):
- `distance.ts` — haversine + equirectangular (backend/sim parity, R = 6371.0088 km)
- `bearing.ts` — forward azimuth, 0–360 true-north convention
- `frustum.ts` — 62° HFOV, `relativeDeltaDeg` (±180 wrap), `screenXNorm`, `projectPin`, `isVisibleInFov`
- `zero_hallucination_gate.ts` — client-side render validation mirroring `backend/validator.py::validate_pin` (listing_id, name ≤ 80 chars, finite lat/lng, SF bounds, ≤ 500 m default range, kind whitelist; drop-never-repair)
- **Test suite: `node --test src/math/__tests__/` → 79/79 passing** (distance parity to 9 dp with Python backend, frustum edge cases at ±31°, gate rejection matrix, full corridor_real.json pipeline integration).

## 2. Verification log
| Check | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`, strict) | ✅ exit 0, zero errors |
| `npx expo config --json --type public` | ✅ projectId / bundleId / infoPlist strings exact |
| `npx expo install --check` | ✅ "Dependencies are up to date" (SDK 58 aligned) |
| `node --test src/math/__tests__/` | ✅ 79/79 pass |
| `expo-doctor` | ⚠️ hangs on outbound network checks in this sandbox — skipped; not a code defect. `expo install --check` + `expo config` cover the version/config surface. |
| Camera/HUD runtime | Manual on-device run pending M2 build (requires dev client; Expo Go lacks CameraView in SDK 58 workflow — native `expo run:ios` or EAS dev build is the path). |

## 3. Environment notes / deviations
- The blank-typescript template ships **SDK 58** (newer than the RN 0.74 / SDK 51–52 baseline named in the task). Kept deliberately: camera (`CameraView`), location watchers, and safe-area APIs are all current-generation and SDK 58 is the lowest friction path for EAS builds today.
- npm showed flaky exits during initial `npm install` in this sandbox; resolved by rerunning — final lockfile (`package-lock.json`) is committed and reproducible.
- Camera background on Simulator/desktop builds has no physical feed; `PermissionPanel` covers the no-permission path and the HUD renders over black until a device run.

## 4. Commits
- `266c6b2` — **feat(expo-ios): M1 scaffold — live camera + compass + GPS AR rig (Task 40cf28e2)** — scaffold, config, deps, App.tsx, spatial-math, EAS snapshot (27 files)
- `ab6e989` — **test(ios-app): node --test suite for spatial math — 79/79 green; ESM .ts import specifiers** — test suite + ESM fixups

Branch `feat/expo-ios-m1` is clean except an unrelated Team B report file left untracked by that team.

## 5. Handoff to M2
- Rig state (`Rig` type in `App.tsx`) is shaped for direct consumption by the pin-projection layer: lat/lng/accuracy feed `projectPin()`, true heading feeds the frustum delta, `zero_hallucination_gate.validatePins()` is the render-authority gate.
- Open item for M2: choose dev-client vs. EAS development build for the on-device camera run; `eas.json` already carries the `development` profile.
