/**
 * PlacardOverlay — M2 floating spatial placards rendered over the camera.
 *
 * Pipeline (all math from src/math, the shared contract implementation):
 *   1. validatePins()    zero-hallucination gate: drop invalid/out-of-range
 *                        pins (never repair — a pin without a verified
 *                        listing does not exist).
 *   2. projectPin()      bearing + distance + 62 deg HFOV frustum culling,
 *                        normalized screenXNorm in [-1, +1].
 *   3. screen mapping    screenX = screenWidth * (screenXNorm * 0.5 + 0.5),
 *                        reproducing the web simulator's
 *                        `screenX_vw = 50 + hfov * 100` geometry.
 *   4. vertical layout   distance-based placement below the center horizon
 *                        line (near pins lower on screen, far pins near the
 *                        horizon), plus simple collision stacking for pins
 *                        that share a screen position (e.g. same venue).
 *   5. depth styling     scale + opacity attenuate with distance.
 */

import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  HFOV_DEG,
  MAX_RANGE_METERS,
  projectPin,
  validatePins,
  type GateReason,
} from "../math/index.ts";

/** Unverified pin as received from the network or the bundled fixture. */
export interface RawPin {
  /** Non-empty verified DayPlay listing id — the hallucination anchor. */
  listing_id: string;
  /** Listing title (never model-generated). */
  name: string;
  /** WGS-84 latitude, degrees. */
  lat: number;
  /** WGS-84 longitude, degrees. */
  lng: number;
  /** Pin kind per docs/spatial-contract.md: saved | event | plan_stop. */
  kind: string;
  [key: string]: unknown;
}

/** Live device GPS fix (from watchPositionAsync). */
export interface UserPosition {
  latitude: number;
  longitude: number;
  /** GPS accuracy in meters, when known. */
  accuracy?: number | null;
}

/** One laid-out placard ready to render. */
export interface PlacedPlacard {
  pin: RawPin;
  screenX: number;
  screenY: number;
  distanceM: number;
  bearingDeg: number;
  /** Visual depth scale multiplier (1.2 = closest, 0.7 = far edge). */
  depthScale: number;
  /** Visual opacity (1.0 = closest, 0.55 = far edge). */
  depthOpacity: number;
}

/** Render telemetry for the HUD (PINS: x/y in FOV). */
export interface OverlayStats {
  /** Raw pins handed to the overlay this frame. */
  totalPins: number;
  /** Pins that passed the gate AND are inside the 62 deg FOV. */
  visiblePins: number;
  /** Pins dropped by the zero-hallucination gate. */
  rejectedPins: number;
}

export interface PlacardOverlayProps {
  pins: RawPin[];
  /** Live GPS fix; null until watchPositionAsync has locked. */
  userPosition: UserPosition | null;
  /** True-North heading in degrees [0, 360), or null until compass locks. */
  userHeading: number | null;
  screenWidth: number;
  screenHeight: number;
  /** Optional per-frame stats for the HUD placard counter. */
  onStats?: (stats: OverlayStats) => void;
}

/** Center horizon line as a fraction of screen height (Y of the horizon). */
const HORIZON_Y_FRACTION = 0.42;
/** Vertical spread below the horizon for near pins (fraction of height). */
const VERTICAL_SPREAD_FRACTION = 0.22;
/** Half placard width used to keep the anchor card inside the viewport. */
const HEDGE_MARGIN_PX = 72;
/** "Same screen spot" bucket for stacking identical-place pins (px). */
const STACK_BUCKET_PX = 48;
/** Stacked-card pitch so identical-place placards cascade (px). */
const STACK_PITCH_PX = 96;

/** Clamp v into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** "42" -> "042", "7.4" -> "007" — fixed-width compass badge. */
function formatBearing(bearingDeg: number): string {
  const deg = Math.round(((bearingDeg % 360) + 360) % 360) % 360;
  return `${String(deg).padStart(3, "0")}°`;
}

/** "142.3" -> "142 m", "1234" -> "1.2 km" — compact distance indicator. */
function formatDistance(meters: number): string {
  const m = Math.round(meters);
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

/** Kind/category tag text for the placard chip. */
function kindLabel(kind: string): string {
  switch (kind) {
    case "event":
      return "EVENT";
    case "plan_stop":
      return "PLAN";
    default:
      return "SAVED";
  }
}

/** Kind chip accent color — quick at-a-glance category coding. */
function kindColor(kind: string): string {
  switch (kind) {
    case "event":
      return "#f59e0b"; // amber
    case "plan_stop":
      return "#a78bfa"; // violet
    default:
      return "#34d399"; // emerald
  }
}

/**
 * Project + gate + cull the raw pins into renderable placards.
 * Pure: same inputs -> same layout, no side effects (React-friendly).
 */
export function buildPlacards(
  pins: RawPin[],
  userPosition: UserPosition | null,
  userHeading: number | null,
  screenWidth: number,
  screenHeight: number,
): { placed: PlacedPlacard[]; rejected: Array<{ index: number; reason: GateReason }> } {
  const rejected: Array<{ index: number; reason: GateReason }> = [];

  if (!userPosition || userHeading === null) {
    // No rig fix yet: the gate has no device distance to range-check against
    // (fixtures carry no distance_m), so nothing renders. Not an error —
    // the HUD shows "warming" until GPS+compass lock.
    return { placed: [], rejected };
  }

  const user = { lat: userPosition.latitude, lng: userPosition.longitude };

  // 1. Zero-hallucination gate — final render authority. Drop, never repair.
  const { accepted, rejected: gateRejected } = validatePins(pins, user);
  rejected.push(...gateRejected);

  // 2-3. Project surviving pins into the 62 deg HFOV and map to pixels.
  const inFov = accepted
    .map((entry) => ({
      pin: entry,
      projected: projectPin(
        { lat: user.lat, lng: user.lng, heading: userHeading },
        { lat: entry.lat, lng: entry.lng },
      ),
    }))
    .filter((entry) => entry.projected.visible === true)
    .sort((a, b) => a.projected.distanceM - b.projected.distanceM);

  // 4. Screen pixel mapping + distance-based vertical placement.
  const horizonY = screenHeight * HORIZON_Y_FRACTION;
  const spread = screenHeight * VERTICAL_SPREAD_FRACTION;

  // Simple collision stacking: pins sharing a screen spot (e.g. the four
  // Mission Rec sessions at identical coords) cascade downward instead of
  // stacking into an unreadable pile.
  const occupied: Array<{ x: number; y: number }> = [];

  const placed: PlacedPlacard[] = inFov.map(({ pin, projected }) => {
    // Exact contract mapping: x = width * (screenXNorm * 0.5 + 0.5).
    const rawX = screenWidth * (projected.screenXNorm * 0.5 + 0.5);
    const screenX = clamp(rawX, HEDGE_MARGIN_PX, screenWidth - HEDGE_MARGIN_PX);

    const distanceNorm = clamp(projected.distanceM / MAX_RANGE_METERS, 0, 1);
    let screenY = horizonY + (1 - distanceNorm) * spread; // near = lower, far = at horizon

    for (const prev of occupied) {
      if (
        Math.abs(prev.x - screenX) < STACK_BUCKET_PX &&
        Math.abs(prev.y - screenY) < STACK_BUCKET_PX
      ) {
        screenY += STACK_PITCH_PX;
      }
    }
    occupied.push({ x: screenX, y: screenY });
    screenY = clamp(screenY, 12, screenHeight - 96);

    // 5. Depth styling: near pins larger and opaque, far pins smaller.
    const depthScale = 1.2 - 0.5 * distanceNorm; // 1.2 (near) -> 0.7 (far)
    const depthOpacity = 1.0 - 0.45 * distanceNorm; // 1.0 -> 0.55

    return {
      pin,
      screenX,
      screenY,
      distanceM: projected.distanceM,
      bearingDeg: projected.bearingDeg,
      depthScale,
      depthOpacity,
    };
  });

  return { placed, rejected };
}

export default function PlacardOverlay({
  pins,
  userPosition,
  userHeading,
  screenWidth,
  screenHeight,
  onStats,
}: PlacardOverlayProps) {
  const { placed, rejected } = useMemo(
    () => buildPlacards(pins, userPosition, userHeading, screenWidth, screenHeight),
    [pins, userPosition, userHeading, screenWidth, screenHeight],
  );

  useEffect(() => {
    onStats?.({
      totalPins: pins.length,
      visiblePins: placed.length,
      rejectedPins: rejected.length,
    });
  }, [onStats, pins.length, placed.length, rejected.length]);

  if (placed.length === 0) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {placed.map((placard) => {
        const kind = placard.pin.kind;
        return (
          <View
            key={placard.pin.listing_id}
            style={[
              styles.placard,
              {
                left: placard.screenX,
                top: placard.screenY,
                opacity: placard.depthOpacity,
                transform: [{ translateX: -HEDGE_MARGIN_PX }, { scale: placard.depthScale }],
              },
            ]}
          >
            <View style={styles.placardTopRow}>
              <View style={[styles.kindTag, { backgroundColor: `${kindColor(kind)}33` }]}>
                <Text style={[styles.kindTagText, { color: kindColor(kind) }]}>
                  {kindLabel(kind)}
                </Text>
              </View>
              <View style={styles.bearingBadge}>
                <Text style={styles.bearingBadgeText}>{formatBearing(placard.bearingDeg)}</Text>
              </View>
            </View>
            <Text style={styles.title} numberOfLines={2}>
              {placard.pin.name}
            </Text>
            <View style={styles.bottomRow}>
              <Text style={styles.distance}>{formatDistance(placard.distanceM)}</Text>
              <Text style={styles.fovNote}>{HFOV_DEG}° FOV</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  placard: {
    position: "absolute",
    width: 216,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(8,15,30,0.82)",
    borderWidth: 1,
    borderColor: "rgba(125,211,252,0.35)",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  placardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  kindTag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  kindTagText: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  bearingBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: "rgba(14,165,233,0.18)",
  },
  bearingBadgeText: {
    color: "#7dd3fc",
    fontSize: 10,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  title: { color: "#f1f5f9", fontSize: 12, fontWeight: "700", lineHeight: 15 },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 5,
  },
  distance: {
    color: "#a5f3fc",
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  fovNote: { color: "#475569", fontSize: 9, fontWeight: "600" },
});
