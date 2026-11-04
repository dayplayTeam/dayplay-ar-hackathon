import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { DeviceMotion } from "expo-sensors";
import PlacardOverlay, { type OverlayStats } from "./src/components/PlacardOverlay.tsx";
import HudBar, { type HudBarProps } from "./src/components/HudBar.tsx";
import InputFilterBar from "./src/components/InputFilterBar.tsx";
import type { RawPin } from "./src/components/PlacardOverlay.tsx";
import { CORRIDOR_REAL_FIXTURES, fetchRealPins, type PinSource } from "./src/data/pinsClient.ts";

/** Live telemetry from the phone's GPS + compass rig. */
type Rig = {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  /** True heading in degrees 0-359, or null until the compass has a fix. */
  heading: number | null;
  headingAccuracy: number | null;
  gpsStatus: "acquiring" | "locked";
  headingStatus: "acquiring" | "locked";
  pitch: number | null;
  error: string | null;
};


/** SF Mission corridor anchor point (Valencia St corridor).
 * Used when 'Anchor to SF' is enabled so testers anywhere can experience 
 * live 360° True North heading tracking against real corridor pins.
 */
const SF_MISSION_ANCHOR = {
  latitude: 37.758150,
  longitude: -122.417930,
  accuracy: 5.0,
};

const INITIAL_RIG: Rig = {
  latitude: null,
  longitude: null,
  accuracy: null,
  heading: null,
  headingAccuracy: null,
  gpsStatus: "acquiring",
  headingStatus: "acquiring",
  pitch: null,
  error: null,
};

/** Normalizes a heading to [0, 359]. -1 is expo-location's "no true-heading fix" sentinel. */
function normalizeHeading(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw < 0) return null;
  const deg = Math.round(((raw % 360) + 360) % 360);
  return deg === 360 ? 359 : deg;
}

/** Clamps v into [-1, 1] (asin-domain guard for noisy motion samples). */
function clampAbsOne(v: number): number {
  return Math.min(1, Math.max(-1, v));
}

/** True once both watchers have delivered at least one usable fix. */
function rigReady(rig: Rig): boolean {
  return rig.gpsStatus === "locked" && rig.headingStatus === "locked";
}

/** Map chip label to typed MCP intent */
function chipToIntent(chip: string | null): "live_now" | "today" | "weekend" {
  if (!chip) return "live_now";
  const c = chip.toLowerCase();
  if (c.includes("weekend")) return "weekend";
  if (c.includes("today")) return "today";
  return "live_now";
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <ArCameraScreen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function ArCameraScreen() {
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [rig, setRig] = useState<Rig>(INITIAL_RIG);
  const [showCamera, setShowCamera] = useState(true);
  const setRigRef = useRef(setRig);
  setRigRef.current = setRig;

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // Landscape support: the phone can rotate on the fly (app.json orientation
  // "default"), so every frame re-derives the orientation from the window.
  const isLandscape = screenWidth > screenHeight;

  // M2 pin state: "demo" = bundled 12 verified corridor fixtures;
  // "live" = ${API_URL}/pins?source=real (falls back to demo offline).
  const [pinSource, setPinSource] = useState<PinSource>("demo");
  const [pins, setPins] = useState(CORRIDOR_REAL_FIXTURES);
  const [pinSourceNote, setPinSourceNote] = useState<string | null>(null);
  const [loadingPins, setLoadingPins] = useState(true);
  const [overlayStats, setOverlayStats] = useState<OverlayStats | null>(null);
  const [anchorToSf, setAnchorToSf] = useState<boolean>(true);
  // HUD density: "standard" pill bar | "expanded" telemetry panel | "minimized"
  // near-invisible dot (REC VIEW equivalent) for a clean camera viewport.
  const [hudMode, setHudMode] = useState<HudBarProps["hudMode"]>("standard");

  // Quick intent filter state (InputFilterBar).
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [barCollapsed, setBarCollapsed] = useState(false);
  // Voice input stream: last voice-captured query (VoiceInputButton). When the
  // submitted query equals the last captured voice text, the HUD banner flips
  // to the 🎙️ voice state so judges see voice → placard filter → HUD live.
  const [voiceQuery, setVoiceQuery] = useState<string | null>(null);
  // REC VIEW: hudMode "minimized" hides the input bar for a pristine camera viewport.
  const recView = hudMode === "minimized";

  // Effective ground truth the pin resolver targets: the SF Mission anchor
  // while anchoring, else the live GPS fix (null until the rig locks; the
  // resolver falls back to the anchor coordinates itself).
  const effectiveUser = anchorToSf
    ? { lat: SF_MISSION_ANCHOR.latitude, lng: SF_MISSION_ANCHOR.longitude }
    : rig.latitude !== null && rig.longitude !== null
      ? { lat: rig.latitude, lng: rig.longitude }
      : null;

  useEffect(() => {
    let cancelled = false;
    setLoadingPins(true);
    void fetchRealPins().then((result) => {
      if (cancelled) return;
      setPins(result.pins);
      setPinSource(result.source);
      setPinSourceNote(result.error);
      setLoadingPins(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePinSource = useCallback(() => {
    if (pinSource === "demo") {
      setPinSource("live");
      setLoadingPins(true);
      const coords = effectiveUser ? { lat: effectiveUser.lat, lng: effectiveUser.lng } : undefined;
      void fetchRealPins("live_now", undefined, coords).then((result) => {
        setPins(result.pins);
        setPinSource(result.source);
        setPinSourceNote(result.error);
        setLoadingPins(false);
      });
    } else {
      setPinSource("demo");
      setPins(CORRIDOR_REAL_FIXTURES);
      setPinSourceNote(null);
    }
  }, [pinSource, effectiveUser]);

  const onOverlayStats = useCallback((stats: OverlayStats) => {
    setOverlayStats(stats);
  }, []);

  const onSelectChip = useCallback((chip: string | null) => {
    setActiveChip(chip);
    setSearchQuery("");
    setSubmittedQuery("");

    // Trigger live MCP query whenever a chip is clicked in LIVE mode
    if (pinSource === "live") {
      setLoadingPins(true);
      const coords = effectiveUser ? { lat: effectiveUser.lat, lng: effectiveUser.lng } : undefined;
      const intent = chipToIntent(chip);
      void fetchRealPins(intent, undefined, coords).then((result) => {
        setPins(result.pins);
        setPinSource(result.source);
        setPinSourceNote(result.error);
        setLoadingPins(false);
      });
    }
  }, [pinSource, effectiveUser]);

  const onChangeSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
    if (query.trim().length > 0) {
      setActiveChip(null); // Text query takes over authority
    }
  }, []);

  const onSubmitQuery = useCallback((query: string) => {
    setSearchQuery(query);
    setSubmittedQuery(query);
    if (query.trim().length > 0) {
      setActiveChip(null);
    }
  }, []);

  const onClearFilter = useCallback(() => {
    setSearchQuery("");
    setSubmittedQuery("");
    setActiveChip(null);
    setVoiceQuery(null);
  }, []);

  const onVoiceQuery = useCallback((query: string) => {
    setVoiceQuery(query);
  }, []);

  const onExpandBar = useCallback(() => setBarCollapsed(false), []);

  // Client-side intent filtering (single authority: active chip XOR free
  // text). Honest-Zero: an unmatched query maps to zero pins — the overlay
  // says so via the empty-state card; no fabricated fallback pins.
  const filtered = filterPins(pins, activeChip, submittedQuery);
  // Honest-Zero card fires ONLY when the FILTERED pin set is empty — never
  // while raw pins are merely outside the FOV/range (regression-locked after
  // the 2026-11-04 "0/19 in FOV" weekend incident, where the card fired
  // over 19 loaded pins that sat outside the render range). During loading
  // or before the rig locks, the viewport stays clean (radar pulse / warming
  // HUD instead).
  const showEmptyState = !loadingPins && filtered.pins.length === 0 && rigReady(rig);
  // Voice origin: the last submitted query came from the voice input stream.
  const voiceOrigin =
    voiceQuery !== null && submittedQuery.trim() === voiceQuery.trim();
  const intentBanner = voiceOrigin
    ? `🎙️ Voice: "${voiceQuery.trim()}" → ${filtered.pins.length} pins in view`
    : filtered.fellBack && submittedQuery.trim().length > 0
      ? `Intent: "${submittedQuery.trim()}" (${filtered.pins.length} pins mapped)`
      : null;

  const startSensors = useCallback(async () => {
    // GPS rig: continuous foreground updates at high accuracy.
    let locationSub: Location.LocationSubscription | null = null;
    let headingSub: Location.LocationSubscription | null = null;

    const locOptions: Location.LocationOptions = {
      accuracy: Location.LocationAccuracy.High, // realtime AR pin placement
      distanceInterval: 1,
      timeInterval: 1000,
    };

    try {
      locationSub = await Location.watchPositionAsync(
        locOptions,
        (position) => {
          setRigRef.current((prev) => ({
            ...prev,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            gpsStatus: "locked",
          }));
        },
        (error) => {
          setRigRef.current((prev) => ({ ...prev, error: `GPS error: ${error}` }));
        },
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setRigRef.current((prev) => ({ ...prev, error: `GPS unavailable: ${message}` }));
    }

    try {
      headingSub = await Location.watchHeadingAsync(
        (heading) => {
          setRigRef.current((prev) => ({
            ...prev,
            heading: normalizeHeading(heading.trueHeading),
            headingAccuracy: heading.accuracy,
            headingStatus: "locked",
          }));
        },
        (error) => {
          setRigRef.current((prev) => ({ ...prev, error: `Compass error: ${error}` }));
        },
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setRigRef.current((prev) => ({ ...prev, error: `Compass unavailable: ${message}` }));
    }

    return () => {
      locationSub?.remove();
      headingSub?.remove();
    };
  }, []);

  const stopSensors = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    // Gate sensor start on location permission (iOS groups camera+location gates separately).
    (async () => {
      const existing = await Location.getForegroundPermissionsAsync();
      const granted = existing.granted
        ? existing
        : await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (!granted.granted) {
        setRigRef.current((prev) => ({
          ...prev,
          error: "Location permission denied — AR pins need GPS + compass.",
        }));
        return;
      }
      cleanup = await startSensors();
      if (cancelled) {
        cleanup?.();
        return;
      }
      stopSensors.current = cleanup;
    })();

    return () => {
      cancelled = true;
      stopSensors.current?.();
      stopSensors.current = null;
    };
  }, [startSensors]);

  // Pitch rig (elevated / highrise viewpoint compensation): DeviceMotion
  // supplies gravity + acceleration in m/s^2; the down-tilt above level is
  // derived from the gravity vector alone. Phone flat vertical (handheld
  // AR pose) reads |gY| ~ 0 -> pitch 0; tilting the top edge down toward
  // the ground grows |gY| up to g at face-down (pitch 90). Pitch feeds
  // PlacardOverlay so horizonY / card band track the true ground direction
  // instead of a static screen band. Motion permission is requested
  // separately (iOS motion gates are independent of camera/location); on
  // denial or sensor absence the overlay keeps its static band.
  useEffect(() => {
    let cancelled = false;
    let sub: { remove: () => void } | null = null;

    void (async () => {
      try {
        const existing = await DeviceMotion.getPermissionsAsync();
        if (!existing.granted) {
          const req = await DeviceMotion.requestPermissionsAsync();
          if (!req.granted) return;
        }
        const available = await DeviceMotion.isAvailableAsync();
        if (cancelled || !available) return;

        DeviceMotion.setUpdateInterval(200); // 5 Hz — plenty for horizon drift
        sub = DeviceMotion.addListener((motion) => {
          const g = motion.accelerationIncludingGravity;
          if (!g || !Number.isFinite(g.x) || !Number.isFinite(g.y) || !Number.isFinite(g.z)) return;
          // True camera elevation/depression angle relative to horizontal:
          // Phone upright facing horizon: g.y ≈ -9.8, g.z ≈ 0 -> pitch ≈ 0°
          // Tilted down toward street (highrise): g.z < 0 -> pitch > 0° (depression angle)
          // Pointing down at feet: g.z ≈ -9.8, g.y ≈ 0 -> pitch ≈ +90°
          // Tilted up toward sky: g.z > 0 -> pitch < 0° (elevation angle)
          const pitchDeg = (Math.atan2(-g.z, -g.y) * 180) / Math.PI;
          setRigRef.current((prev) => ({ ...prev, pitch: Math.round(pitchDeg) }));
        });
      } catch {
        // Motion unavailable (older device / denied / Expo Go limitation):
        // static horizon band stays — compensation degrades gracefully.
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const cameraGranted = cameraPermission?.granted ?? false;

  return (
    <View style={styles.container}>
      {cameraGranted && showCamera ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" active />
      ) : null}

      {/* M2/M3 floating spatial placards — gate + frustum math in src/math */}
      <PlacardOverlay
        pins={filtered.pins}
        userPosition={
          anchorToSf
            ? SF_MISSION_ANCHOR
            : rig.latitude !== null && rig.longitude !== null
              ? { latitude: rig.latitude, longitude: rig.longitude, accuracy: rig.accuracy }
              : null
        }
        userHeading={rig.heading}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        isLandscape={screenWidth > screenHeight}
        devicePitch={rig.pitch}
        showEmptyState={showEmptyState}
        onStats={onOverlayStats}
      />

      {/* Top HUD: compact pill bar (standard) / telemetry panel (expanded)
          / near-invisible dot (minimized = REC VIEW equivalent). */}
      <View
        pointerEvents="box-none"
        style={[
          styles.hudWrap,
          {
            top: insets.top + 8,
            left: 16 + (isLandscape ? insets.left : 0),
            right: 16 + (isLandscape ? insets.right : 0),
          },
        ]}
      >
        <HudBar
          heading={rig.heading}
          headingAccuracy={rig.headingAccuracy}
          pinsVisible={overlayStats?.visiblePins ?? null}
          pinsTotal={overlayStats?.totalPins ?? null}
          pinsRejected={overlayStats?.rejectedPins ?? 0}
          venueCards={overlayStats?.venueCards ?? 0}
          pinSource={pinSource}
          pinSourceNote={pinSourceNote}
          anchorToSf={anchorToSf}
          hudMode={hudMode}
          onHudMode={setHudMode}
          onTogglePinSource={togglePinSource}
          onToggleAnchor={() => setAnchorToSf((prev) => !prev)}
          rig={{
            gpsStatus: rig.gpsStatus,
            headingStatus: rig.headingStatus,
            gpsOk: rig.gpsStatus === "locked",
            headingOk: rig.headingStatus === "locked",
            ready: rigReady(rig),
            error: rig.error,
          }}
        />
      </View>

      {/* Live loading visualization: radar pulse while pins resolve (launch
          or live refresh). Placards render the instant the fetch lands. */}
      {loadingPins ? (
        <View pointerEvents="none" style={[styles.loadingPulseWrap, isLandscape ? styles.loadingPulseWrapLandscape : null]}>
          <View style={styles.loadingPulseCard}>
            <View style={styles.radarRings}>
              <View style={styles.radarRing} />
              <View style={styles.radarRingInner} />
            </View>
            <View style={styles.loadingPulseTextWrap}>
              <Text style={styles.loadingPulseTitle}>📡 Resolving live Dayplay MCP intent...</Text>
              <Text style={styles.loadingPulseSub}>Verifying real places against the walk radius</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Intent fallback banner — shown when a query maps to demo pins. */}
      {intentBanner ? (
        <View
          pointerEvents="none"
          style={[styles.intentBanner, isLandscape ? styles.intentBannerLandscape : null]}
        >
          <Text style={styles.intentBannerText}>{intentBanner}</Text>
        </View>
      ) : null}

      {/* Bottom input bar + quick intent chips. Hidden entirely in REC VIEW. */}
      <View
        pointerEvents="box-none"
        style={{
          bottom: insets.bottom + (isLandscape ? 4 : 8),
          position: "absolute",
          left: 0,
          right: 0,
        }}
      >
        <InputFilterBar
          activeChip={activeChip}
          searchQuery={searchQuery}
          onSelectChip={onSelectChip}
          onChangeSearchQuery={onChangeSearchQuery}
          onSubmitQuery={onSubmitQuery}
          onClearFilter={onClearFilter}
          onVoiceQuery={onVoiceQuery}
          resultCount={filtered.pins.length}
          hidden={recView}
          collapsed={barCollapsed}
          onExpand={onExpandBar}
        />
      </View>
      {!cameraGranted ? (
        <PermissionPanel status={cameraPermission?.status ?? "undetermined"} onRequest={() => void requestCameraPermission()} />
      ) : null}

      {!showCamera && cameraGranted ? (
        <View style={styles.centerNotice}>
          <Text style={styles.centerNoticeText}>Camera paused</Text>
        </View>
      ) : null}
    </View>
  );
}

function PermissionPanel({ status, onRequest }: { status: string; onRequest: () => void }) {
  return (
    <View style={styles.centerNotice}>
      <Text style={styles.centerNoticeTitle}>Camera access needed</Text>
      <Text style={styles.centerNoticeText}>
        {status === "denied" || status === "blocked"
          ? "Camera permission was denied. Enable it in Settings to see the AR overlay."
          : "Camera access is required for the AR street view overlay."}
      </Text>
      {status !== "denied" && status !== "blocked" ? (
        <Text onPress={onRequest} style={styles.permissionButton}>
          Grant camera access
        </Text>
      ) : null}
      <Text style={styles.centerNoticeFootnote}>
        Location + compass run in the background of this screen; AR pins use both.
      </Text>
    </View>
  );
}

/** Tokenizes a free-text query into lowercase keywords (len>=3, no stop words). */
function queryKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && t !== "the" && t !== "and" && t !== "for");
}

const CHIP_KEYWORDS: Record<string, string[]> = {
  "live now": ["live", "now"],
  "today": ["today"],
  "weekend": ["weekend"],
  "coffee": ["coffee", "cowork"],
  "nightlife": ["nightlife", "lounge", "bar"],
};

/**
 * Client-side intent filter for the M1 input bar: single-authority match on
 * pin name + kind — an active chip drives the filter unless a non-empty
 * free-text query is submitted (text always wins). Honest-Zero: whatever
 * matched is returned as-is; zero matches surface zero pins plus the
 * Honest-Zero card, never fabricated fallback pins.
 */
function filterPins(pins: RawPin[], chip: string | null, query: string): { pins: RawPin[]; fellBack: boolean } {
  const keywords = queryKeywords(query);
  
  // 1. Text search has top authority: if user entered text keywords, filter by text
  if (keywords.length > 0) {
    const matched = pins.filter((pin) => {
      const name = pin.name.toLowerCase();
      const kind = pin.kind.toLowerCase();
      return keywords.some((k) => name.includes(k) || kind.includes(k));
    });
    return { pins: matched, fellBack: false };
  }

  // 2. Chip filter:
  // When pins are returned from the live API for a temporal chip ('today', 'weekend', 'live now'),
  // the live MCP server ALREADY filtered semantically by time! Do NOT re-filter by literal keyword substring
  // on event names (e.g. 'Powering the AI Economy' or 'Morning Coffee' do NOT contain the word 'weekend').
  if (chip !== null && chip !== undefined) {
    const chipKey = chip.toLowerCase();
    const isTemporalChip = chipKey.includes("weekend") || chipKey.includes("today") || chipKey.includes("live");
    if (isTemporalChip) {
      // Trust the temporal intent — keep all returned events!
      return { pins, fellBack: false };
    }

    const chipTerms = Object.entries(CHIP_KEYWORDS).find(([k]) => chipKey.includes(k))?.[1] ?? [];
    if (chipTerms.length > 0) {
      const matched = pins.filter((pin) => {
        const name = pin.name.toLowerCase();
        const kind = pin.kind.toLowerCase();
        return chipTerms.some((t) => name.includes(t) || kind.includes(t));
      });
      return { pins: matched, fellBack: false };
    }
  }

  // No active filter — return all pins
  return { pins, fellBack: false };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  container: { flex: 1, backgroundColor: "#000" },
  hudWrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  centerNotice: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.82)",
    padding: 24,
    gap: 8,
  },
  centerNoticeTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  centerNoticeText: { color: "#cbd5e1", textAlign: "center", fontSize: 13 },
  centerNoticeFootnote: { color: "#64748b", fontSize: 11, textAlign: "center", marginTop: 4 },
  loadingPulseWrap: {
    position: "absolute",
    top: "30%",
    left: 20,
    right: 20,
    alignItems: "center",
  },
  loadingPulseWrapLandscape: { top: "24%" },
  loadingPulseCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(28,27,26,0.92)",
    borderColor: "rgba(255,107,71,0.5)",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  radarRings: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  radarRing: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "rgba(255,107,71,0.55)",
  },
  radarRingInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,107,71,0.85)",
  },
  loadingPulseTextWrap: { gap: 2 },
  loadingPulseTitle: { color: "#FF6B47", fontSize: 13, fontWeight: "700" },
  loadingPulseSub: { color: "#A19D97", fontSize: 11 },
  intentBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 128,
    alignItems: "center",
  },
  intentBannerLandscape: { bottom: 100 },
  intentBannerText: {
    color: "#F5F4F2",
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "rgba(28,27,26,0.88)",
    borderColor: "#2A2826",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: "hidden",
  },
  permissionButton: {
    color: "#0ea5e9",
    fontWeight: "700",
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "rgba(14,165,233,0.15)",
    overflow: "hidden",
  },
});
