# Expo iOS Native AR App: Task Draft & Direction Alignment

**Date:** 2026-11-02 09:15 PST  
**Context:** Meta Global AI Developer Hackathon (Startup Track: *Build for Your World*, submission due Nov 4 3PM PT / 6PM hard; demo video capture Nov 3).  
**Baseline:** HEAD `212f260`, 29/29 pytest green, backend FastAPI offline-ready via `mock` provider.  
**Strategic Shift:** Primary demo artifact elevates to a native iOS app built with Expo (React Native). The web simulator (`sim/`) transitions to secondary/fallback.

---

## 1. New P0 Task Draft (Ready for Notion)

**Task Title:** `T-iOS: Expo iOS app — live camera + compass + GPS AR pin view`

### Goal Statement
Build a lightweight native iOS AR corridor client using Expo (React Native) that runs directly on a physical iPhone via Expo Go, rendering real-time street placards over a full-screen rear camera feed using native True North heading (`Location.watchHeadingAsync`) and GPS (`Location.watchPositionAsync`), backed by the existing FastAPI `/pins` and `/pipeline` service.

### Why
Safari mobile web imposes severe sensor gates on iOS: `webkitCompassHeading` has ±10–25° magnetic noise and requires strict user-gesture permission chains; web GPS latency frequently drops walking speeds; and WebXR remains unsupported in mobile Safari. Expo native APIs (`expo-location`, `expo-camera`) provide direct access to iOS CoreLocation True North compass heading and hardware GPS without permission traps or App Store review overhead via Expo Go.

### Scope In / Out
- **In Scope:**
  - Expo SDK scaffold (TypeScript, React Native).
  - Full-screen rear camera preview (`expo-camera`).
  - Native sensor subscriptions (`expo-location` `watchPositionAsync` + `watchHeadingAsync` filtering `trueHeading`).
  - REST client fetching backend FastAPI `/pins?source=real` and `/pipeline` over HTTPS.
  - Frustum math ported from `sim/app.js` (62° HFOV, flat-earth equirectangular distance/bearing, horizontal placard offset `50 + hfov * 100` vw).
  - Telemetry HUD (`LAT`, `LNG`, `HDG`, `SPEED`, pin count).
  - Zero-hallucination client invariant check: verify every rendered placard maps to an active listing from `/pins` (`source_tool: supabase_entities_anon`).
- **Out of Scope:**
  - ARKit 6DOF world tracking / plane detection (post-hackathon v2).
  - Apple Developer Program account, EAS dev clients, or TestFlight / App Store submission.
  - Dead reckoning / IMU double-integration (skipped per sensor gap findings: cubic drift $O(t^3)$ explodes within 30s).
  - Android platform support (hackathon focus is iPhone physical demo).

### Milestones & Target Dates
- **M1 (Nov 2):** Expo project scaffold, rear camera feed, native GPS + true heading telemetry HUD running in Expo Go on physical iPhone.
- **M2 (Nov 3 AM):** Port 62° HFOV bearing projection, connect to backend API, render dynamic corridor placards with zero-hallucination validation.
- **M3 (Nov 3 PM):** Physical iPhone screen recording along SF corridor (or local street) demonstrating live heading responsiveness, feeding T5b demo video.
- **M4 (Nov 4 AM):** UI cleanup, offline fallback handling, final commit, and evidence documentation before submission cutoff.

### Acceptance Criteria (Measurable)
1. **Physical Run:** App launches and renders full-screen camera in Expo Go on a physical iPhone without crash or native build step.
2. **True North Tracking:** `watchHeadingAsync` updates placard horizontal positions smoothly in real-time as device pans 360°, maintaining alignment within the 62° frustum.
3. **API Integration:** Client fetches `/pins?source=real` from the backend endpoint over HTTPS, rendering verified listing cards with zero invented fields.
4. **Zero-Hallucination Gate:** Client drops any pin lacking a valid `listing_id` matching backend fixtures; 0 ungrounded pins rendered.
5. **HUD Accuracy:** Live HUD reflects hardware coordinates and True North heading at >=5 Hz update cadence.

### Explicit Risks & Mitigation
- **Backend Reachability:** Expo Go on a physical device cannot access `localhost`. Requires either the public Fly.io HTTPS deploy or a local tunnel (`ngrok` / `localtunnel`).
- **Physical Device Requirement:** Expo Go camera and magnetometer do not function meaningfully in iOS Simulator; physical iPhone testing is required from M1.
- **No Apple Dev Account Needed:** Expo Go runs pre-built native runtimes; no Apple Developer Program membership ($99) or provisioning profiles are required for demo.

### Honesty & Boundary Constraints
- `meta` (Muse Spark) and `baseten` model providers remain blocked without credit card; backend runs deterministically offline via `mock`.
- Grounding uses the mock visual grounding pipeline (`backend/grounding.py`); SAM-3.1 is not claimed.
- Spatial anchoring is 3DOF compass+GPS bearing projection, not 6DOF optical SLAM / plane mesh.

---

## 2. Related-Task Alignment Plan

### T9: Submission Requirements & Partner Survey (`408f28e2-2d4f-81c8-905f-ecd8f48f4089` / `408f28e2-2d4f-812c-8395-c6a95849999a`)
- **2026-11-02 Direction Update:** Update submission artifact definitions. The primary demo artifact for judging review is the screen-captured Expo iOS app running on a physical iPhone. The public web simulator (`sim/`) is retained as an interactive live-URL fallback. Ensure submission form text credits React Native / Expo alongside FastAPI and Meta Muse-compatible pipeline.
- **Properties:** Keep status Done / Human Verification; append Expo GitHub path to deliverables checklist.

### Fly.io Backend & Web Deployment (`40bf28e2-2d4f-81c8-905f-ecd8f48f4089` - Likith)
- **2026-11-02 Direction Update:** Fly.io deploy remains critical and urgent. It serves dual purposes: (1) public HTTPS API backend required by the physical Expo Go client (`/pins`, `/pipeline`, `/health`), and (2) secondary judging fallback hosting the browser FOV simulator (`/sim`). TLS is mandatory since mobile devices reject cleartext HTTP traffic.
- **Properties:** Retain assignee Likith; priority P0. Note dependency: M2 iOS integration consumes Fly.io HTTPS base URL.

### T5a: Project Writeup & Documentation
- **2026-11-02 Direction Update:** Frame system architecture around a dual-client spatial runtime: native Expo iOS client for physical AR corridor walkability and browser-based FOV corridor simulator for zero-install evaluation. Document the zero-hallucination Supabase pipeline, offline `mock` provider resilience, and CoreLocation heading integration.
- **Properties:** Update description to include mobile Expo architecture diagram and sensor pipeline rationale.

### T5b: Demo Video Production (Due Nov 3)
- **2026-11-02 Direction Update:** Primary 3-minute demo video structure: (1) 60s physical iPhone screen capture showing Expo Go live camera + responsive compass pins on street, (2) 60s zero-hallucination backend verification (`/pipeline` tool planner + validator dropping hallucinated venues), (3) 60s simulator walkthrough (`ops/hackathon/t3-walkthrough-slow.mp4`) showcasing corridor coverage.
- **Properties:** Flag dependency on M3 physical capture completion Nov 3 PM.

### T6: Final Portal Submission (Due Nov 4 3PM PT)
- **2026-11-02 Direction Update:** Submission payload consists of: public repo link (containing backend, sim, and Expo app), primary demo video link (featuring physical iOS capture), and deployed Fly.io web URL as secondary interactive link.
- **Properties:** Check all acceptance boxes against official Cerebral Valley portal schema before cutoff.

### T1: Real Mission Corridor Pin Sourcing (`40af28e2` - Done)
- **2026-11-02 Direction Update:** No changes to existing artifacts (`corridor_real.json`). Real Supabase listing schema (`name`, `lat`, `lng`, `category`, `vibe`) is consumed directly by the iOS client cards.
- **Properties:** Retain Done.

---

## 3. Effort & Sequence Table

| Milestone | Deliverable | Owner-Skill | Est Hours | Dependencies / Blockers |
|---|---|---|---|---|
| **M1** | Expo SDK scaffold, camera feed, GPS/heading HUD | Mobile / React Native | 3.5 h | Node.js, Expo Go on physical iPhone |
| **Deploy** | Fly.io HTTPS backend deploy | DevOps / Likith | 2.0 h | Task `40bf28e2`, Fly.io CLI/token |
| **M2** | 62° FOV projection math, API fetch, placard overlay | Mobile / Frontend | 4.0 h | M1, Deploy (or ngrok HTTPS tunnel) |
| **M3** | Physical iPhone demo walkthrough screen capture | QA / Mobile | 1.5 h | M2, outdoor street corridor access |
| **T5b** | 3-minute judging video edit and voiceover | Video / Product | 4.0 h | M3, existing T3 simulator MP4s |
| **T5a/T6**| Final writeup, repo documentation, portal submission | Ops / Writing | 2.5 h | T5b, GitHub HEAD push |
| **Total** | | | **17.5 h** | Submit by Nov 4 15:00 PST (Hard: 18:00 PST) |
