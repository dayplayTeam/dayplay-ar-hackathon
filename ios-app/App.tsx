import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import PlacardOverlay, { type OverlayStats } from "./src/components/PlacardOverlay.tsx";
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
  error: string | null;
};

const INITIAL_RIG: Rig = {
  latitude: null,
  longitude: null,
  accuracy: null,
  heading: null,
  headingAccuracy: null,
  gpsStatus: "acquiring",
  headingStatus: "acquiring",
  error: null,
};

/** Normalizes a heading to [0, 359]. -1 is expo-location's "no true-heading fix" sentinel. */
function normalizeHeading(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw < 0) return null;
  const deg = Math.round(((raw % 360) + 360) % 360);
  return deg === 360 ? 359 : deg;
}

/** True once both watchers have delivered at least one usable fix. */
function rigReady(rig: Rig): boolean {
  return rig.gpsStatus === "locked" && rig.headingStatus === "locked";
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

  // M2 pin state: "demo" = bundled 12 verified corridor fixtures;
  // "live" = ${API_URL}/pins?source=real (falls back to demo offline).
  const [pinSource, setPinSource] = useState<PinSource>("demo");
  const [pins, setPins] = useState(CORRIDOR_REAL_FIXTURES);
  const [pinSourceNote, setPinSourceNote] = useState<string | null>(null);
  const [overlayStats, setOverlayStats] = useState<OverlayStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchRealPins().then((result) => {
      if (cancelled) return;
      setPins(result.pins);
      setPinSource(result.source);
      setPinSourceNote(result.error); // null on success, error string on fallback
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePinSource = useCallback(() => {
    if (pinSource === "demo") {
      setPinSource("live");
      void fetchRealPins().then((result) => {
        setPins(result.pins);
        setPinSource(result.source);
        setPinSourceNote(result.error); // failed live fetch silently reverts to demo data
      });
    } else {
      setPinSource("demo");
      setPins(CORRIDOR_REAL_FIXTURES);
      setPinSourceNote(null);
    }
  }, [pinSource]);

  const onOverlayStats = useCallback((stats: OverlayStats) => {
    setOverlayStats(stats);
  }, []);

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

  const cameraGranted = cameraPermission?.granted ?? false;

  return (
    <View style={styles.container}>
      {cameraGranted && showCamera ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" active />
      ) : null}

      {/* M2 floating spatial placards — gate + frustum math in src/math */}
      <PlacardOverlay
        pins={pins}
        userPosition={
          rig.latitude !== null && rig.longitude !== null
            ? { latitude: rig.latitude, longitude: rig.longitude, accuracy: rig.accuracy }
            : null
        }
        userHeading={rig.heading}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        onStats={onOverlayStats}
      />

      {/* Top HUD: GPS + heading telemetry */}
      <View style={[styles.hud, { top: insets.top + 8 }]}>
        <Text style={styles.hudTitle}>AR RIG · LIVE</Text>
        <View style={styles.hudRow}>
          <Text style={styles.hudLabel}>LAT</Text>
          <Text style={styles.hudValue}>{rig.latitude?.toFixed(6) ?? "--"}</Text>
        </View>
        <View style={styles.hudRow}>
          <Text style={styles.hudLabel}>LNG</Text>
          <Text style={styles.hudValue}>{rig.longitude?.toFixed(6) ?? "--"}</Text>
        </View>
        <View style={styles.hudRow}>
          <Text style={styles.hudLabel}>HDG</Text>
          <Text style={styles.hudValue}>
            {rig.heading !== null ? `${rig.heading}°` : "--"}
            {rig.headingAccuracy !== null ? ` ±${rig.headingAccuracy}` : ""}
          </Text>
        </View>
        <View style={styles.hudRow}>
          <Text style={styles.hudLabel}>ACC</Text>
          <Text style={styles.hudValue}>
            {rig.accuracy !== null ? `${rig.accuracy.toFixed(0)} m` : "--"}
          </Text>
        </View>
        <View style={styles.hudRow}>
          <Text style={styles.hudLabel}>GPS</Text>
          <StatusPill ok={rig.gpsStatus === "locked"} label={rig.gpsStatus} />
        </View>
        <View style={styles.hudRow}>
          <Text style={styles.hudLabel}>CMP</Text>
          <StatusPill ok={rig.headingStatus === "locked"} label={rig.headingStatus} />
        </View>
        <View style={styles.hudRow}>
          <Text style={styles.hudLabel}>RIG</Text>
          <StatusPill ok={rigReady(rig)} label={rigReady(rig) ? "ready" : "warming"} />
        </View>
        <View style={styles.hudRow}>
          <Text style={styles.hudLabel}>PINS</Text>
          <Text style={styles.hudValue}>
            {overlayStats
              ? `${overlayStats.visiblePins}/${overlayStats.totalPins} in ${62}° FOV`
              : "--"}
            {overlayStats && overlayStats.rejectedPins > 0
              ? ` (${overlayStats.rejectedPins} gated)`
              : ""}
          </Text>
        </View>
        <View style={styles.hudRow}>
          <Text style={styles.hudLabel}>SRC</Text>
          <StatusPill
            ok={pinSource === "live"}
            label={
              pinSource === "live"
                ? "LIVE API"
                : pinSourceNote
                  ? `DEMO (${pinSourceNote})`
                  : "DEMO"
            }
          />
          <Pressable onPress={togglePinSource} hitSlop={8} style={styles.toggleButton}>
            <Text style={styles.toggleText}>
              {pinSource === "demo" ? "TRY LIVE API" : "DEMO PINS"}
            </Text>
          </Pressable>
        </View>
        {rig.error ? <Text style={styles.hudError}>{rig.error}</Text> : null}
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

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={[styles.pill, ok ? styles.pillOk : styles.pillWarn]}>
      <Text style={styles.pillText}>{label}</Text>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  container: { flex: 1, backgroundColor: "#000" },
  hud: {
    position: "absolute",
    left: 16,
    right: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    gap: 4,
  },
  hudTitle: { color: "#7dd3fc", fontWeight: "700", fontSize: 12, letterSpacing: 1 },
  hudRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hudLabel: { color: "#94a3b8", width: 42, fontSize: 12, fontWeight: "600" },
  hudValue: { color: "#fff", fontSize: 13, fontVariant: ["tabular-nums"] },
  hudError: { color: "#fca5a5", fontSize: 11, marginTop: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillOk: { backgroundColor: "rgba(34,197,94,0.25)" },
  pillWarn: { backgroundColor: "rgba(234,179,8,0.25)" },
  pillText: { color: "#e2e8f0", fontSize: 10, fontWeight: "700" },
  toggleButton: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(14,165,233,0.18)",
    borderWidth: 1,
    borderColor: "rgba(14,165,233,0.4)",
    overflow: "hidden",
  },
  toggleText: { color: "#7dd3fc", fontSize: 10, fontWeight: "800" },
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
