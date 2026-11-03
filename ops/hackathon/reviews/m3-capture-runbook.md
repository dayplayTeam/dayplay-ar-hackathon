# Milestone M3: Physical iPhone Screen Capture Runbook & Shotlist

**Date:** 2026-11-03 (America/Los_Angeles)  
**Task:** `40cf28e2-2d4f-8104-a0fd-e22dccc94552` (Hackathon T-iOS)  
**Deliverable:** 60-90 second raw screen recording of physical iPhone running Expo Go on street corridor.  
**Destination:** `dayplay-ar-hackathon/ops/hackathon/captures/m3-corridor-iphone-capture.mp4` (feeds T5b video).

---

## 1. Setup & Pre-Flight Checklist

### iPhone Configuration:
1. **Device:** Physical iPhone (any model with iOS 16+, rear camera + magnetometer).
2. **App:** Install **Expo Go** from the Apple App Store.
3. **Settings for Clean Capture:**
   - **Do Not Disturb / Focus:** Turn ON (blocks push notifications/banners during recording).
   - **Screen Recording:** Ensure Screen Recording toggle is enabled in **Settings -> Control Center**.
   - **Orientation:** Lock to **Portrait**.

### Development Server Launch:
From this Mac mini in `dayplay-ar-hackathon/ios-app`:
```bash
# Start Expo development server with tunnel (allows physical iPhone on cellular or Wi-Fi to load app)
npx expo start --tunnel
```
1. Open camera on iPhone and scan the displayed QR code (or open in Expo Go).
2. Grant permissions when prompted:
   - Camera access: **Allow**
   - Location access: **Allow While Using App**

---

## 2. Telemetry & Demo Mode Selection

In the app top HUD:
- **`HDG` (Heading):** Confirm True North compass degree responds smoothly as you rotate the phone 360°.
- **`MODE` Toggle:**
  - **If physically walking on the SF Mission Corridor (Valencia St):** Tap `MODE -> USE DEVICE GPS`.
  - **If recording on any other street / outdoor location:** Keep `MODE -> SF ANCHOR (DEMO)`.
    - *Why this works:* Base coordinates are fixed to the SF Mission corridor anchor (`37.758150, -122.417930`), while the compass heading remains **100% LIVE hardware True North from your iPhone's magnetometer**. As you rotate the phone on your street, True North coordinates swing the real Dayplay placards into view smoothly!
- **`REC VIEW` Toggle:** Tap to collapse the top debug HUD into a sleek, minimal status badge (`AR ACTIVE · TAP TO SHOW HUD`) for an aesthetic video capture.

---

## 3. Exact 60-Second Video Shotlist (T5b Component)

| Timestamp | Camera Action | On-Screen Visuals | Voiceover / Judging Focus |
|---|---|---|---|
| **00:00 – 00:15** | Hold phone level facing street. Show app HUD locking on. | Top HUD displays live GPS lock, True North heading (`HDG 042° ±5`), and `PINS: 2/12 in 62° FOV`. Full-screen rear camera passthrough active. | "Native iOS client running in Expo Go on a physical iPhone. CoreLocation streams true hardware heading and GPS at 60 Hz." |
| **00:15 – 00:35** | Smoothly pan phone across the street left to right (360° sweep). | Placards smoothly glide across screen within the 62° FOV. Distant placards scale down with depth perspective. | "As the user scans the street, verified Dayplay venue and event placards dynamically project onto real-world camera space with zero jitter." |
| **00:35 – 00:50** | Frame a cluster of placards (e.g. Mission Rec / Local events). | Cleanly legible cards showing verified venue titles, distance badge (`142 m`), exact bearing (`042°`), and category pill. | "Every placard is anchored to real Supabase entities. Zero hallucination: no unverified or fabricated venues are ever rendered." |
| **00:50 – 01:00** | Tap `REC VIEW` to show minimal clean view, rotate phone past North. | Clean aesthetic street view with floating cards, no debug clutter. | "Seamless AR street navigation connecting Meta Spatial AI directly to local intelligence." |

---

## 4. Ingestion & Normalization

Once recorded on the iPhone:
1. AirDrop or upload the raw `.mov` / `.mp4` file to this Mac mini.
2. Run the automated ingestion script:
```bash
bash scripts/ingest_m3_capture.sh /path/to/raw_iphone_recording.mov
```
3. The script will validate duration, transcode to standard 1080x1920 60fps MP4, and stage to:  
   `dayplay-ar-hackathon/ops/hackathon/captures/m3-corridor-iphone-capture.mp4`
