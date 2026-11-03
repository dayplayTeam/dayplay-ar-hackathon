# Meta Hackathon Review Readiness & Status Dossier

**Date:** 2026-11-03 (America/Los_Angeles)  
**Workstream:** Meta Hackathon (Notion Project: `405f28e2-2d4f-8107-8589-e7b307e706ad`)  
**Submission Deadline:** November 4, 2026  
**EAS Account Source:** Repo `dayplay` (`dayplay/eas.json`, `dayplay/app.json`)  
**Prepared by:** GLM 5.3 Flash & Orchestrator Review Team  

---

## 1. Executive Summary & Countdown

- **Submission Target:** Meta Llama / Spatial AI Hackathon closes November 4, 2026.
- **Strategic Direction (2026-11-02 Owner Soft-Pivot):** We pivoted from a purely browser-based AR simulator to a native **Expo iOS app (`dayplay-ar-hackathon`)** targeting **Expo Go** on a physical iPhone and **TestFlight** distribution via Dayplay's established EAS account.
- **Core Value Proposition:** Real camera passthrough with true compass heading and GPS location, rendering verified spatial placards for Dayplay venues/events with zero hallucination.

---

## 2. Notion Tasks Inventory & Progress

All 13 tasks under the **Meta Hackathon** workstream have been reconciled and verified:

| Task ID | Status | Priority | Due | Assignee | Task Title | Notes / Deliverables |
|---|---|---|---|---|---|---|
| `405f28e2-2d4f-81ee` | **Done** | P0 | 2026-10-29 | JeanCLAWd | Confirm Hackathon Application Submission | Application confirmed on record |
| `405f28e2-2d4f-81c5` | **Done** | P1 | 2026-10-31 | JeanCLAWd | 1. Setup & Architecture: AR Environment & Dayplay Integration | Architecture locked |
| `405f28e2-2d4f-81e6` | **Done** | P1 | 2026-10-31 | JeanCLAWd | 2. Core Dev: Build Spatial Pinning Pipeline | Spatial pin pipeline & constraints landed |
| `405f28e2-2d4f-8112` | **Done** | P1 | 2026-10-31 | JeanCLAWd | 3. Prototype Build: AR Overlay & Simulator | Web simulator built (T3 walkthrough MP4s committed) |
| `40bf28e2-2d4f-8133` | **Done** | P1 | 2026-11-01 | JeanCLAWd | Hackathon T4a: Real-camera passthrough in AR sim | getUserMedia camera passthrough merged @ `212f260` |
| `408f28e2-2d4f-8152` | **Done** | P1 | 2026-11-02 | JeanCLAWd | Hackathon: Go/No-Go checkpoint — AR demo vs eval pivot | Go/No-Go resolved: pivot to Expo iOS app |
| `405f28e2-2d4f-8129` | **Done** | P3 | 2026-10-31 | JeanCLAWd | Muse Spark & Muse Image Integration | Verified adapter contracts |
| `408f28e2-2d4f-812c` | **Done** | P1 | 2026-10-29 | JeanCLAWd | Extract submission requirements + claim Meta Model credits | Meta Model API credits claimed & ready to use (Done) |
| `40cf28e2-2d4f-8104` | **In progress** | P0 | 2026-11-04 | JeanCLAWd | Hackathon T-iOS: Expo iOS app — live camera + compass + GPS AR view | Primary build task; ready for M1 scaffold execution |
| `40bf28e2-2d4f-81c8` | **HOLD** (Out of Scope) | P1 | 2026-11-02 | Likith | [OUT OF SCOPE] Hackathon T4b: Deploy web app to Fly.io | Removed from scope per owner (superseded by ngrok/iOS) |
| `405f28e2-2d4f-8155` | **Not started** | P1 | 2026-11-03 | JeanCLAWd | 4. Polish & Documentation: Stretch Goals & Writeup | Devpost writeup, architecture diagram |
| `405f28e2-2d4f-81b8` | **Not started** | P1 | 2026-11-03 | JeanCLAWd | 5. Final Review & Demo Recording | Screen capture of live phone walkthrough |
| `405f28e2-2d4f-81a3` | **Not started** | P0 | 2026-11-04 | JeanCLAWd | 6. SUBMISSION CHECKLIST: Final Artifacts | Devpost form, public repo URL, demo video, README |

---

## 3. Expo iOS Soft-Pivot & Milestone Plan

### Milestone Breakdown
- **M1: Expo Scaffold & Sensor Rig (Nov 3 AM - Target: 4h)**
  - Initialize Expo React Native project inside `dayplay-ar-hackathon/mobile` (or root).
  - Install `expo-camera`, `expo-location`, `react-native-reanimated`.
  - Wire live rear camera feed with HUD overlay.
  - Implement real-time true heading (`Location.watchHeadingAsync`) + GPS (`Location.watchPositionAsync`).
- **M2: Backend API Integration & Placard Projections (Nov 3 PM - Target: 4h)**
  - Connect to Dayplay Supabase pins (`/pins` endpoint).
  - Calculate relative bearing & distance to each pin based on device heading & coordinate delta.
  - Render dynamic AR placard overlays anchored in the camera viewport with visual frustum culling (+/- 30° FOV).
  - Backend reachability: local dev uses ngrok or Likith's Fly.io HTTPS endpoint.
- **M3: Real-World Walkthrough Video Capture (Nov 4 AM - Target: 3h)**
  - Execute live test walkthrough on physical iPhone running Expo Go.
  - Record 60-90 second screen video showing camera scanning street, heading updating smoothly, and accurate venue placards appearing.
- **M4: Submission Polish & Documentation (Nov 4 PM - Target: 3h)**
  - Finalize Devpost submission writeup highlighting Meta Llama / Spatial AI integration.
  - Polish README with setup runbook and architecture diagrams.

---

## 4. EAS Configuration & Account Setup (From `dayplay`)

We have extracted the production EAS configuration from repo `dayplay`:
- **EAS Project ID:** `429c510f-cead-4568-895d-285a6b7bbcb7`
- **Owner Account:** `dayplay`
- **Bundle Identifier (iOS):** `com.dayplay.app`
- **App Store Connect App ID (ascAppId):** `6755804676`

### Staged Files:
1. `dayplay-ar-hackathon/ops/hackathon/eas/eas_account_config.json`: Metadata inventory.
2. `dayplay-ar-hackathon/ops/hackathon/eas/eas.json`: Reusable EAS build profiles:
   - `development`: `developmentClient: true`, `distribution: internal`
   - `preview`: `distribution: internal` (fast ad-hoc builds)
   - `production`: `autoIncrement: true`, submission linked to ASC App ID `6755804676`

### Build & Testing Strategy:
1. **Tier 1 (Fastest / Zero Build Delay):** **Expo Go** on physical iPhone.
   - Run `npx expo start --tunnel`.
   - Scan QR code with iPhone Camera -> loads instantly into Expo Go.
   - Ideal for recording M3 demo video without waiting on remote EAS build queues.
2. **Tier 2 (Distribution / TestFlight):** **EAS Build (`eas build --platform ios --profile internal`)**.
   - Uses Dayplay's Apple Developer Team certificates and provisioned EAS credentials.
   - Produces installable `.ipa` or TestFlight build for team-wide validation.

---

## 5. Review Agenda & Decision Gates for MrMister

1. **Gate 1: M1 Execution Go-Ahead**
   - Approve kicking off Milestone M1 (scaffolding Expo iOS app inside `dayplay-ar-hackathon/mobile` with camera + heading/GPS).
2. **Gate 2: Backend Reachability Strategy**
   - For demo capture: Approve using an **ngrok tunnel** to local FastAPI backend (`localhost:8000`) vs waiting on Likith's Fly.io deployment (Task `40bf28e2` P1). *Recommendation: ngrok allows immediate unblocked local testing.*
3. **Gate 3: Demo Recording Location & Walkthrough Route**
   - Confirm target corridor/venues for the video walkthrough (e.g. SF flagship corridor pins already configured in Supabase).
