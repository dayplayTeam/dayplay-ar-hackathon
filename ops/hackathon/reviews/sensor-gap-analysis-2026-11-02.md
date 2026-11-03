# Sensor & Positioning Gap Analysis: Sim to Live iPhone AR
**Date:** 2026-11-02  
**Target:** Deploy browser AR simulation (`sim/`) to live iPhone Safari with rear camera + real sensors.  
**Repo Revision:** HEAD `212f260` (`dayplay-ar-hackathon`)

---

## 1. What Exists Today (Code Audit)

Static analysis of `sim/app.js`, `sim/camera.js`, and repo codebase confirms:
- **Zero Sensor APIs in Repo:** A repository-wide search (`grep -rn -i "geolocation\|deviceorientation\|devicemotion\|webkitCompassHeading" .`) returned **0 matches**. There is currently no sensor integration in the codebase.
- **Fixed User State (`sim/app.js` lines 32–38):**
  - `START_POS`: hardcoded `{ lat: 37.7510, lng: -122.4170, heading: 35.0 }`.
  - `user` is cloned from `START_POS`.
- **Heading is Constant (`sim/app.js` lines 35, 60–65, 226–233):** Heading stays hardcoded at `35.0°`. No keyboard control, gyroscope, or magnetometer ever modifies `user.heading`.
- **Synthetic Keyboard/Interval Walking (`sim/app.js` lines 219–233):**
  - Ticker runs at `CFG.tickMs = 100` (10 Hz).
  - Position increments synthetic Northing/Easting: `dNorthM = distancePerTickM * cos(35°)`, `dEastM = distancePerTickM * sin(35°)`.
- **Flat-Earth FOV Math (`sim/app.js` lines 42–68):**
  - `metersPerDeg`: `lat=111320.0`, `lng=111320.0 * cos(latRad)`.
  - Frustum clipping: `minRenderDistM = 1.0m`, `maxRenderDistM = 600m`, `fovDeg = 62°`.
  - Placards positioned horizontally in `vw` (`50 + hfov * 100`) and vertically in `vh` (`52 - dist_ratio*20`).
- **Telemetry HUD (`sim/app.js` lines 150–154):**
  - Prints synthetic string: `LAT ... · LNG ... · HDG 35° · SPEED 4.2 m/s`.
- **Camera Passthrough (`sim/camera.js` lines 1–179, landed in T4a):**
  - `getUserMedia` back-camera passthrough (`facingMode: { ideal: 'environment' }`).
  - Strict user-gesture tap requirement (`toggleBtn`), `<video playsinline webkit-playsinline>`, secure-context validation (`isSecureContext()`), and fallback to synthetic CSS background.

---

## 2. Gaps for Live iPhone Safari

| Sensor / Vector | Safari Web API & Constraints | Street-Scale Reality & Gap vs Current Code |
|---|---|---|
| **Location (GPS)** | `navigator.geolocation.watchPosition(success, err, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 })` | **Missing.** Sim currently ticks synthetic coordinates. Street canyon GPS has ±5–15m accuracy. Needs accuracy rejection (`coords.accuracy > 30m` discard). |
| **Compass (Heading)** | `window.addEventListener('deviceorientation', ...)` reading `event.webkitCompassHeading` (iOS 0–360° True North). | **Missing.** Standard `alpha` is arbitrary on iOS; Safari requires `webkitCompassHeading`. **Critical Gate:** Requires `DeviceOrientationEvent.requestPermission()` inside a user gesture (identical to camera button tap). Magnetometer noise is ±10–25° near cars/reinforced concrete. |
| **Velocity / Speed** | `coords.speed` from Geolocation vs `DeviceMotionEvent.acceleration` | **Missing.** `coords.speed` is null when stationary, delayed by 1–3s, and frequently missing on mobile web at walking speeds (<1.4 m/s). `devicemotion` requires another permission gate and is noisy. |
| **Dead Reckoning** | Double-integrating `devicemotion.acceleration` or step counting | **Skip / Do not build.** Standard consumer IMU double-integration explodes with cubic drift ($O(t^2)$ to $O(t^3)$): >20–50m drift error within 30–60 seconds of walking. Filtering IMU drift without ARKit SLAM/VIO is a research project. Regular GPS fixes (1 Hz) beat DR on web. |
| **Altitude / Pitch** | `coords.altitude` or `deviceorientation.beta` | Currently sim pins are vertical 2D placards projected on flat horizon. Pitch (`beta`) could tilt horizon, but 2D bearing projection is sufficient for street placard placement. |
| **TLS / Hosting** | `window.isSecureContext` check | `getUserMedia`, `geolocation`, and `DeviceOrientationEvent` **all fail silently or throw `NotAllowedError` on unencrypted HTTP** on iOS. Deploy target (Fly.io) must terminate TLS. |

---

## 3. Drift & Error Model (Worked Examples)

On iPhone Safari without WebXR/ARKit world anchors, pins are visual vectors calculated from user GPS $(lat_u, lng_u)$ to venue $(lat_v, lng_v)$ rotated by compass heading $\theta_c$.

### Error Mode Formulations
1. **Lateral Error from Heading:** $E_{lat} \approx d \cdot \sin(\Delta \theta)$
   - At $\Delta \theta = 20^\circ$ compass deviation:
     - $d = 50\text{ m} \implies E_{lat} \approx 50 \cdot \sin(20^\circ) = \mathbf{17.1\text{ m}}$ (~half a city block)
     - $d = 200\text{ m} \implies E_{lat} \approx 200 \cdot \sin(20^\circ) = \mathbf{68.4\text{ m}}$ (~1 to 2 city blocks)
     - At $62^\circ$ FOV, a $20^\circ$ error shifts the pin across **64% of the visible camera screen**.
2. **Radial Error from GPS:** GPS canyon multipath introduces $\pm 5\text{ m}$ to $\pm 15\text{ m}$ positioning uncertainty regardless of distance.

### Real Anchor Examples from `eval/fixtures/corridor_real.json`
From corridor start `(37.7510, -122.4170)` heading $35^\circ$ along Mission St:

1. **Near Target: "Free Book Shop Comedy Night"** (`listing_id: e71405b0...`)
   - Lat: `37.75264`, Lng: `-122.41479` | True Distance: **266.5 m**, Bearing: **$46.9^\circ$** (Relative bearing: $+11.9^\circ$, inside FOV).
   - With $+15^\circ$ compass error: Relative bearing shifts to $-3.1^\circ$; lateral pin displacement is **69.0 m**. Placard jumps from right half to left half of screen.
2. **Mid Target: "Feral Friday Square Dance"** (`listing_id: 99e10699...`)
   - Lat: `37.75582`, Lng: `-122.41525` | True Distance: **558.0 m**, Bearing: **$16.0^\circ$** (Relative bearing: $-19.0^\circ$, near FOV edge).
   - With $+15^\circ$ compass error: Relative bearing shifts to $-34.0^\circ$ ($|\text{bearing}| > 31^\circ$), pushing the placard **completely out of the camera view**.
3. **Close Offset Target: "Consultas disponibles"** (`listing_id: 4b692c9d...`)
   - Lat: `37.75031`, Lng: `-122.41793` | True Distance: **112.0 m**, Bearing: **$226.8^\circ$** (Behind user; correctly culled by `r.fwd < 1.0m`).

**Honest Street-Scale Verdict:** Placards reliably indicate *"this venue is roughly down this corridor or around this block"*. They cannot and will not pin directly to a building doorway or physical storefront window.

---

## 4. Recommendation Stack & Implementation Scope

```
[Phase 1: MVL Live Mode]  ──>  [Phase 2: Smoothing & UX]  ──>  [Phase 3: DO NOT BUILD]
Geolocation + Compass           Heading Low-Pass Filter        Dead Reckoning / SLAM
Camera passthrough (done)       Speed HUD from GPS Delta       WebXR Polyfills
```

### 1. Minimum Viable Live-Mode (MVL) — High Priority (Target: Nov 3)
- **Compass Integration (`sim/compass.js` or `sim/app.js`):**
  - Implement `DeviceOrientationEvent.requestPermission()` flow for iOS 13+.
  - Read `event.webkitCompassHeading` (True North).
  - Scope: **S (Small, ~60 LOC)**.
- **Geolocation Watcher (`sim/gps.js` or `sim/app.js`):**
  - Implement `navigator.geolocation.watchPosition` with fallback if GPS denied.
  - Bind live `user.lat` and `user.lng` to GPS updates; override synthetic ticker walk.
  - Scope: **S (Small, ~50 LOC)**.
- **Sensor Permission UX Gate (`sim/index.html`, `sim/app.js`):**
  - Add a unified "Enable Sensors (GPS + Compass)" button mirroring the T4a camera toggle UX.
  - Scope: **S (Small, ~30 LOC)**.

### 2. Worthwhile Polish Additions — Medium Priority
- **Exponential Moving Average (EMA) Heading Filter:** Magnetometer jitter causes placards to vibrate wildly. Apply low-pass filter: $\theta_{smooth} = \theta_{prev} + \alpha \cdot \text{angleDiff}(\theta_{raw}, \theta_{prev})$ with $\alpha \approx 0.15$.
  - Scope: **S (Small, ~20 LOC in `sim/app.js`)**.
- **Calculated Speed Telemetry:** Compute velocity from sequential GPS coordinates $(\Delta d / \Delta t)$ instead of unreliable `coords.speed`.
  - Scope: **S (Small, ~15 LOC in `sim/app.js`)**.

### 3. Explicitly NOT Worth It for Nov 4 Demo
- **Dead Reckoning via Accelerometer:** Skip. Drift error exceeds 20m in under a minute without visual-inertial odometry. Pure GPS fixes are vastly superior.
- **WebXR Device API Polyfills:** Skip. Safari iOS does not support WebXR Hit Test or World Anchoring.
- **ARKit Native Bridge:** Out of scope for browser-based delivery.

---

## 5. Verification Blockers (Requires Physical iPhone + TLS URL)

The following behaviors **cannot** be verified in desktop Chrome, Playwright, or curl:
1. **iOS Permission Dialog Cascades:** Safari requires explicit, gesture-bound system prompts for both `DeviceOrientationEvent.requestPermission()` and `getUserMedia`.
2. **`webkitCompassHeading` vs Standard `alpha`:** Desktop emulators and Android emit `alpha` (relative/magnetic heading offset); iOS Safari emits `webkitCompassHeading` with True North reference.
3. **Street-Canyon Multipath Latency:** Verifying real GPS jitter, heading smoothing responsiveness, and placard stability while walking Mission St.
4. **Camera + Sensors Concurrency on WebKit:** Verifying Safari does not throttle 60 FPS video playback or orientation events when both are active simultaneously in low-power mode.

### Recommended Smoke Test Sequence (Post Fly.io TLS Deploy)
1. Navigate to HTTPS deployment on iPhone Safari.
2. Tap **"Enable Camera"** $\rightarrow$ verify iOS rear-camera passthrough activates.
3. Tap **"Enable Compass & GPS"** $\rightarrow$ accept Safari location and motion permission prompts.
4. Rotate phone in a circle $\rightarrow$ confirm HUD `HDG` matches real compass direction and placards slide across FOV.
5. Walk 20–30 meters $\rightarrow$ confirm HUD `LAT/LNG` updates and distance counters count down.
