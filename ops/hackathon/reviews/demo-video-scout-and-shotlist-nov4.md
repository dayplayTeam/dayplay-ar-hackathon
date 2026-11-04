# Demo Video: Corridor Scouting & 60–90s Shotlist — Nov 4, 2026

**Date:** 2026-11-03 (America/Los_Angeles)
**Task:** Scout & Shotlist Team — Meta Global AI Developer Hackathon demo video (T5b)
**Cutoff:** Wednesday, Nov 4, 2026
**Deliverable:** 60–90 second raw capture of the AR iOS app running in Expo Go on a physical iPhone → ingested via `scripts/ingest_m3_capture.sh` to `ops/hackathon/captures/m3-corridor-iphone-capture.mp4`.

---

## 1. Live Scouting Intelligence (verified Wed Nov 4 + Weekend Nov 6–8)

### What's actually happening Wednesday, Nov 4 (submission day)

| Time | Event | Location | Corridor Relevance |
|---|---|---|---|
| **12:00–2:00 pm** | **2026 Valkyries Championship Parade** (WNBA champs) — FREE, citywide | The Embarcadero: starts at **Ferry Building (Mission St)**, ends at King & 2nd St. Fans line up from Mission St → 2nd St from 9 am. | Downtown/SoMa is CROWDED + street closures. **Avoid for filming** — logistics chaos, but a huge live proof point for "⚡ What's live now" if captured as screen content, not film location. |
| **All day / evening** | **Union Square Holiday Ice Rink Opening Ceremony** + free skating for first 100 guests (5:30 pm & 7 pm sessions) | Union Square Park | Downtown. Crowded at 5:30–7 pm. Potential "live now" content, poor for clean panning shots. |
| **Evening** | **Election Night Watch Party w/ Bingo** — Kochina Rude | **The Chapel, 777 Valencia St** | Mission/Valencia. Evening crowd at a venue already in our Supabase data. Good post-parade evening backdrop. |

### Weekend Nov 6–8

| Day | Event | Location |
|---|---|---|
| **Sat Nov 7** | **SF Coffee Festival 2026** (10th annual, tastings + live music) — $31.65 | **Fort Mason Center Festival Pavilion**, 2 Marina Blvd (Marina corridor) |
| **Sat Nov 7** | **SF Fall Cider Fest** — unlimited tastings 30+ ciders, 12–4 pm, $45 | **SPARK Social SF**, 601 Mission Bay Blvd (Mission Bay) |
| **Sun Nov 8** | **SF Diwali Festival at Yerba Buena Gardens** — FREE, all-ages, 1–5 pm | **Great Lawn, Yerba Buena Gardens** (Downtown/SoMa corridor) |
| Sat Nov 7–8 | Discover Taiwan Expo 2026 | San Mateo (out of scope) |

### Corridor Supabase Data Density (from `/tmp/corridor_scout.json`)

| Corridor | Published rows | Distinct venues | Data quality note |
|---|---|---|---|
| **Mission/Valencia (16th–24th)** | 60 | ~11 (The Chapel, Manny's, Mission Yoga, The Marsh, Polish Club, Kilowatt, Make-Out Room, Mission Playground) | Densest *real venue* mix on the actual corridor anchor (37.758150, −122.417930). The Chapel has an actual Nov 3/4 event. |
| Hayes Valley | 60 | ~7 (Davies Symphony Hall, Rickshaw Stop, The Commons, Proxy SF) | 39/60 rows are a single Regus coworking entity — weak venue spread. |
| North Beach/Columbus | 41 | ~9 | Heavily Chinatown-event weighted; fewer corridor venues. |
| Downtown/SoMa | 60 | ~13 (August Hall, YBCA, SFMOMA, Feinstein's, Union Square) | Strongest marquee venues; parade + Diwali + ice rink all live here this week. |
| Marina/Chestnut | 30 | ~6 (Palace of Fine Arts, White Rabbit) | Thinnest; Fort Mason coffee festival is nearby. |

### ⭐ Corridor Recommendation

**#1: Mission / Valencia Street (16th–24th St) — shoot Wednesday Nov 4, late afternoon (3:30–5:30 pm).**

Why it wins:
1. **It is the app's anchor corridor.** `SF ANCHOR (DEMO)` mode pins to `37.758150, -122.417930` (Valencia corridor) — placards are pre-anchored exactly where you stand. Zero risk of empty frames or culling.
2. **Visual storytelling:** murals (Clarion Alley at 17th, Women's Building at 23rd/Lapu Lapu), sun-lit west-facing storefronts, steady foot traffic, cafe parklets — the street reads "local intelligence" instantly.
3. **Live event synergy:** The Chapel (777 Valencia) election-night watch party at 777 Valencia — an actual Nov 3/4 event in our Supabase feed — sits right in the panning field of view. You can physically point the camera at a venue whose placard is on screen.
4. **Weather:** Wed Nov 4 forecast runs **sunny/partly cloudy early afternoon, clouding over by evening** (13–17 °C). Late-afternoon shoot beats the overcast window.
5. **Crowd control:** The Valkyries parade (12–2 pm, Embarcadero) pulls crowds *downtown*, away from the Mission — Valencia is calmer than usual midday and moderately busy by late afternoon. Best of both.

**Runner-up: Downtown / Yerba Buena (Mission–Market–3rd St).**
Marquee venues (SFMOMA, YBCA, August Hall) + modern street canyons read as "tech-hub AR." Use it if you want the *landscape-mode scene* shot against glass-and-steel facades. Caveats: Valkyries parade street closures 12–2 pm, Union Square ice rink crowds after 5:30 pm — shoot before noon or 3–4:30 pm only, and expect busier sidewalks and glare from glass towers.

**Skip for filming:** Hayes Valley (weak venue spread in data), North Beach (thin corridor density), Marina (thinnest dataset — unless capturing Fort Mason festival content Saturday).

**If you can only shoot once: Wednesday Nov 4, 3:30–5:30 pm, Valencia St between 19th & 22nd.** Golden-hour warmth, post-parade calm, The Chapel watch-party buzz building in the evening.

---

## 2. Second-by-Second Shotlist (00:00–01:20, portrait 9:16, 60 fps)

Standing on Valencia St (between 19th & 22nd), facing ~North up the corridor. `MODE = SF ANCHOR (DEMO)` unless you physically walk the corridor → `USE DEVICE GPS`. Compass heading is always live hardware True North.

### Scene 1 — The Hook & Telemetry Lock (00:00–00:15)
| Time | Action | On-screen | Narration beat |
|---|---|---|---|
| 00:00–00:04 | Cold open: hold phone level, camera passthrough on Valencia storefronts. | Full-screen live camera; top HUD begins acquiring. | "This is real-time camera passthrough — no simulated video." |
| 00:04–00:09 | Rotate slowly ~45° toward True North; watch heading converge. | `HDG` ticks and **locks: `096° E`** (±5); GPS badge settles. | "CoreLocation streams True North at hardware rate — watch it lock." |
| 00:09–00:15 | Hold steady; first placards fade in as FOV math resolves. | `PINS: n/12 in 62° FOV` line; 2–3 floating placards appear, anchored over real storefronts. | "Verified venues are projected into the exact camera frame." |

### Scene 2 — 360° Corridor Pan & Spatial Placards (00:15–00:35)
| Time | Action | On-screen | Narration beat |
|---|---|---|---|
| 00:15–00:22 | Smooth left→right pan across the corridor at walking pace. | Placards glide in with **depth perspective** — distant cards scale down, near cards full-size. Distance badges (`142 m` etc.) update live. | "Watch the depth math: every placard is anchored at its real GPS position." |
| 00:22–00:29 | Pan stops on a **cluster** (e.g., Mission Rec / local events overlapping). | Cluster collapses to a stacked card with **`+5 more activities`** badge. | "Anti-collision clustering keeps the view readable." |
| 00:29–00:35 | Tap the `+5 more` badge twice; cycle through the deck. | Card deck cycles: title, venue, category chip rotate per tap. | "Tap to cycle the deck — nothing is ever hidden or invented." |

### Scene 3 — Filter Chips & Natural Language Intent (00:35–00:50)
| Time | Action | On-screen | Narration beat |
|---|---|---|---|
| 00:35–00:41 | Tap **`⚡ What's live now`**. | Placard set re-filters instantly; HUD/footage shows the reduced, live-only set. | "One tap: what's live right now." |
| 00:41–00:46 | Tap **`📅 Happening today`** then **`🎉 Happening this weekend`**. | Counts and placards update on each tap. | "Intent filters mapped to real Supabase event dates." |
| 00:46–00:50 | Tap the search box (preloaded **"ai marketing meetups this week"**) and hit search. | Instant intent match → matched placards highlighted/filtered. | "Natural language input, instant verified matching." |

### Scene 4 — Card Interaction & Zero-Hallucination Grounding (00:50–01:05)
| Time | Action | On-screen | Narration beat |
|---|---|---|---|
| 00:50–00:56 | Tap a placard (pick **The Chapel** — real event this week). | Full activity detail sheet slides up: verified title, venue, time, genres. | "Every detail comes straight from our verified listing — zero hallucination." |
| 00:56–01:05 | Tap **walking directions** → Apple Maps handoff. | Apple Maps opens with a walking route to the venue; cut back to app. | "One tap to Apple Maps walking directions, grounded to a real place." |

### Scene 5 — Landscape Mode & Clean View Sweep (01:05–01:20)
| Time | Action | On-screen | Narration beat |
|---|---|---|---|
| 01:05–01:10 | Rotate phone to **landscape**. | Adaptive widescreen horizon re-layouts; placards redistribute across the wider FOV. | "Adaptive widescreen horizon in landscape." |
| 01:10–01:15 | Tap **`REC VIEW`** → HUD collapses to `AR ACTIVE · TAP TO SHOW HUD` pill. | Clean, cinematic street view with floating cards only. | "Clean recording view — nothing but the AR and the street." |
| 01:15–01:20 | Final slow 180° pan in REC VIEW, end on the corridor's most iconic stretch. | Fade-ready final frame. | "Dayplay — your city, spatially." |

> **Timing flexibility:** shotlist runs to 01:20; the ingest script normalizes any 60–90 s cut. If pressed for time, trim Scene 3 to chips-only (drop search typing) for a 60 s cut.

---

## 3. Practical Filming Guide

### Best time of day (Wed Nov 4)
- **Primary: 3:30–5:30 pm.** Sun from the SW = warm light on Valencia's west-side storefronts; foot traffic building toward evening but not parade-crowded.
- **Weather check (wttr.in, day-of):** Nov 4 = sunny/partly cloudy early, overcast after ~6 pm. Finish before golden-hour end.
- **Avoid:** 12:00–2:00 pm (Valkyries parade distills everyone downtown; you'll be tempted — don't film there, street closures on Embarcadero/Mission.
- **Screen glare:** Overexpose the passthrough camera slightly rather than the HUD; keep the phone in slight shade (body shadow / awning) so the OLED screen stays readable.

### Phone settings (pre-flight)
1. **Do Not Disturb / Focus ON** — no banners mid-take.
2. **Screen Recording** in Control Center, **60 fps** (Settings → Control Center → Screen Recording; record at 60 fps via Screen Recording quality — iPhone defaults to 30; if your model supports ProRes/60fps screen capture use it).
3. **Exposure lock:** tap-and-hold on the street in camera view before starting REC, so passthrough exposure doesn't pump during pans.
4. **Orientation Lock OFF** (needed for Scene 5 landscape) — but keep Scene 1–4 in portrait.
5. **Battery > 80%**, Low Power Mode OFF (keeps GPS/magnetometer sampling fast).
6. Location permission: **Allow While Using App**; Camera: **Allow**.

### App pre-flight (on the phone in Expo Go)
- Dev server from the Mac mini: `npx expo start --tunnel` in `dayplay-ar-hackathon/ios-app`; scan QR in Expo Go.
- Confirm `HDG` swings smoothly; set `MODE = SF ANCHOR (DEMO)` while filming on Valencia.
- Do one full 360° dry-run pan before recording to pre-cache placard renders.
- Rehearse Scene 3 chip taps + search once so taps land on first take.

### Ingestion handoff
1. AirDrop the raw screen recording `.mov` from iPhone to the Mac mini.
2. Run:
   ```bash
   bash dayplay-ar-hackathon/scripts/ingest_m3_capture.sh /path/to/raw_iphone_recording.mov
   ```
3. Script validates duration (warns < 15 s), transcodes to **1080×1920 60fps libx264 yuv420p**, and stages to:
   `dayplay-ar-hackathon/ops/hackathon/captures/m3-corridor-iphone-capture.mp4`
   → ready for the T5b judging video montage.

### Shot redundancy checklist (record these even if the main take is perfect)
- [ ] Second full pan take (Scene 2) — pans are the most likely flub.
- [ ] Individual chip taps (Scene 3) as separate 10 s clips for B-roll/inserts.
- [ ] Chapel placard tap → detail sheet → Apple Maps (Scene 4) as its own clip.
- [ ] Landscape entry + REC VIEW toggle (Scene 5) as its own clip.
- [ ] 10 s of static "lock on" footage for the 00:00 hook, in case the cold open jitters.

---

## 4. Decision Summary

- **Shoot:** **Wed Nov 4, 3:30–5:30 pm, Valencia St (19th–22nd), Mission corridor.** Anchor-corridor alignment, murals, real live venue (The Chapel), post-parade calm, golden-hour light.
- **Alternative:** Downtown/Yerba Buena, same day before noon (avoid 12–2 pm parade closures and post-5:30 pm Union Square ice-rink crowds).
- **Weekend backup (if today slips):** Sun Nov 8, Yerba Buena Gardens Diwali Festival 1–5 pm — free, all-ages, marquee downtown venue in our Supabase feed; or Sat Nov 7 Marina/Fort Mason for the Coffee Festival.

*Sources: sf.funcheap.com event listings (Valkyries parade, Union Square ice rink opening, The Chapel election-night watch party, SF Coffee Festival, Fall Cider Fest, Yerba Buena Diwali) + Dayplay Supabase corridor dump `/tmp/corridor_scout.json` + wttr.in SF forecast (Nov 4: sunny→overcast, 13–17 °C).*
