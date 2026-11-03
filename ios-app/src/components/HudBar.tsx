/**
 * HudBar — compact top pill bar HUD (replaces the tall debug stack).
 *
 * Standard mode: ONE horizontal pill row with the essentials —
 *   [compass chip 096° E] [pins 6/12] [mode chip SF ANCHOR] [•] [▾]
 * Expanded mode: the full telemetry panel (GPS/compass accuracy, gated
 * pins, source toggle, error) drops down under the same pill bar —
 * never over the camera viewport by default.
 * Minimized mode ("REC VIEW"): a single tiny status dot, near-zero
 * footprint, tap to restore the pill bar.
 *
 * Styling: DayPlay dark canon — glass surface, hairline border, coral for
 * live/primary state, muted secondary text.
 */

import { memo } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ACCENT_CORAL,
  BORDER,
  CORAL_TINT,
  SURFACE_GLASS,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "../theme/dayplay.ts";
import { formatHeadingCardinal } from "../utils/format.ts";

/** True once both watchers delivered a usable fix. */
export interface RigStatus {
  gpsStatus: "acquiring" | "locked";
  headingStatus: "acquiring" | "locked";
  gpsOk: boolean;
  headingOk: boolean;
  ready: boolean;
  error: string | null;
}

export interface HudBarProps {
  heading: number | null;
  headingAccuracy: number | null;
  /** Rendered placard telemetry: "6/12 in FOV". */
  pinsVisible: number | null;
  pinsTotal: number | null;
  /** Pins dropped by the zero-hallucination gate this frame. */
  pinsRejected: number;
  /** Venue cards currently on screen. */
  venueCards: number;
  pinSource: "demo" | "live";
  pinSourceNote: string | null;
  anchorToSf: boolean;
  /** Standard | expanded | minimized. */
  hudMode: "standard" | "expanded" | "minimized";
  onHudMode: (mode: HudBarProps["hudMode"]) => void;
  onTogglePinSource: () => void;
  onToggleAnchor: () => void;
  rig: RigStatus;
}

const StatusDot = memo(function StatusDot({ ok }: { ok: boolean }) {
  return <View style={[styles.dot, ok ? styles.dotOk : styles.dotWarn]} />;
});

/** "warming" while sensors acquire; coral when the rig is live. */
function ModeChip({ label, active }: { label: string; active: boolean }) {
  return (
    <View style={[styles.modeChip, active ? styles.modeChipActive : null]}>
      <Text style={[styles.modeChipText, active ? styles.modeChipTextActive : null]}>
        {label}
      </Text>
    </View>
  );
}

export default function HudBar({
  heading,
  headingAccuracy,
  pinsVisible,
  pinsTotal,
  pinsRejected,
  venueCards,
  pinSource,
  pinSourceNote,
  anchorToSf,
  hudMode,
  onHudMode,
  onTogglePinSource,
  onToggleAnchor,
  rig,
}: HudBarProps) {
  const live = rig.ready;
  // Landscape: the phone rotates on the fly, so re-read the window each render
  // and respect the left/right notch + Dynamic Island safe-area insets.
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  if (hudMode === "minimized") {
    return (
      <View
        pointerEvents="box-none"
        style={[styles.minimizedWrap, { paddingRight: 4 + Math.max(insets.right, 0) }]}
      >
        <Pressable
          accessibilityLabel="Show AR HUD"
          accessibilityRole="button"
          onPress={() => onHudMode("standard")}
          style={styles.minimizedPill}
        >
          <StatusDot ok={live} />
          <Text style={styles.minimizedText}>AR</Text>
        </Pressable>
      </View>
    );
  }

  const pinsLabel =
    pinsVisible !== null && pinsTotal !== null
      ? `${pinsVisible}/${pinsTotal} in FOV`
      : "--/--";
  const compassLabel = heading !== null ? formatHeadingCardinal(heading) : "---° --";
  const modeLabel = anchorToSf ? "SF ANCHOR" : "LIVE GPS";

  // Landscape strip: pills stay in ONE horizontal row (they already are), but
  // the row must clear the left/right notch insets and not crowd the wider
  // viewport's center. Wider side padding keeps the camera center clear.
  const wrapStyle = isLandscape
    ? [styles.wrap, { paddingHorizontal: Math.max(insets.left, insets.right) }]
    : styles.wrap;

  return (
    <View pointerEvents="box-none" style={wrapStyle}>
      <View style={[styles.bar, isLandscape ? styles.barLandscape : null]}>
        {/* Compass chip — heading + cardinal sector. */}
        <View style={styles.compassChip}>
          <Text style={styles.compassText}>{compassLabel}</Text>
          {headingAccuracy !== null ? (
            <Text style={styles.compassAcc}>±{headingAccuracy}</Text>
          ) : null}
          <StatusDot ok={rig.headingOk} />
        </View>

        {/* Pins chip — visible/total in FOV (tap = expand for gate detail). */}
        <Pressable
          accessibilityLabel="Pin telemetry, tap to expand HUD"
          accessibilityRole="button"
          onPress={() => onHudMode(hudMode === "expanded" ? "standard" : "expanded")}
          style={styles.pinsChip}
        >
          <Text style={styles.pinsText}>{pinsLabel}</Text>
          {pinsRejected > 0 ? <Text style={styles.pinsGated}>{pinsRejected}✕</Text> : null}
        </Pressable>

        {/* Mode chip — tap to flip SF anchor / live GPS. */}
        <Pressable
          accessibilityLabel={`Mode ${modeLabel}, tap to toggle`}
          accessibilityRole="button"
          onPress={onToggleAnchor}
          style={styles.modePress}
        >
          <ModeChip label={modeLabel} active={!anchorToSf} />
        </Pressable>

        {/* Source dot — coral when live API is feeding pins. */}
        <Pressable
          accessibilityLabel={`Pin source ${pinSource}, tap to toggle`}
          accessibilityRole="button"
          onPress={onTogglePinSource}
          style={styles.sourcePress}
        >
          <StatusDot ok={pinSource === "live"} />
          <Text style={styles.sourceText}>
            {pinSource === "live" ? "LIVE" : "DEMO"}
          </Text>
        </Pressable>

        {/* Expand / minimize toggle. */}
        <Pressable
          accessibilityLabel={hudMode === "expanded" ? "Collapse HUD" : "Expand HUD"}
          accessibilityRole="button"
          onPress={() =>
            onHudMode(hudMode === "expanded" ? "standard" : "expanded")
          }
          style={styles.chevronPress}
        >
          <Text style={styles.chevron}>{hudMode === "expanded" ? "▴" : "▾"}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Minimize HUD for clean camera view"
          accessibilityRole="button"
          onPress={() => onHudMode("minimized")}
          style={styles.chevronPress}
        >
          <Text style={styles.minimizeGlyph}>●</Text>
        </Pressable>
      </View>

      {/* Expanded telemetry panel — drops below the pill bar on demand. */}
      {hudMode === "expanded" ? (
        <View style={[styles.panel, isLandscape ? styles.panelLandscape : null]}>
          <View style={styles.panelRow}>
            <Text style={styles.panelLabel}>GPS</Text>
            <StatusDot ok={rig.gpsOk} />
            <Text style={styles.panelValue}>{rig.gpsOk ? "locked" : "acquiring"}</Text>
          </View>
          <View style={styles.panelRow}>
            <Text style={styles.panelLabel}>CMP</Text>
            <StatusDot ok={rig.headingOk} />
            <Text style={styles.panelValue}>
              {rig.headingOk ? "locked" : "acquiring"}
            </Text>
          </View>
          <View style={styles.panelRow}>
            <Text style={styles.panelLabel}>SRC</Text>
            <Text style={styles.panelValue}>
              {pinSource === "live"
                ? "LIVE API"
                : pinSourceNote
                  ? `DEMO (${pinSourceNote})`
                  : "DEMO"}
            </Text>
            <Pressable onPress={onTogglePinSource} hitSlop={8} style={styles.panelButton}>
              <Text style={styles.panelButtonText}>
                {pinSource === "demo" ? "TRY LIVE API" : "DEMO PINS"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.panelRow}>
            <Text style={styles.panelLabel}>MODE</Text>
            <Text style={styles.panelValue}>{modeLabel}</Text>
            <Pressable onPress={onToggleAnchor} hitSlop={8} style={styles.panelButton}>
              <Text style={styles.panelButtonText}>
                {anchorToSf ? "USE DEVICE GPS" : "ANCHOR TO SF"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.panelRow}>
            <Text style={styles.panelLabel}>VEN</Text>
            <Text style={styles.panelValue}>
              {venueCards} venue card{venueCards === 1 ? "" : "s"} on screen
            </Text>
          </View>
          {rig.error ? <Text style={styles.panelError}>{rig.error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  /** Landscape: slightly tighter pill paddings/typography so the single
   * strip stays compact on the wide-but-short viewport. */
  barLandscape: {
    gap: 5,
    paddingVertical: 4,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: SURFACE_GLASS,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  compassChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  compassText: {
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  compassAcc: { color: TEXT_SECONDARY, fontSize: 9, fontWeight: "600" },
  pinsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pinsText: {
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  pinsGated: { color: ACCENT_CORAL, fontSize: 9, fontWeight: "800" },
  modePress: {},
  modeChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modeChipActive: { backgroundColor: CORAL_TINT, borderWidth: 1, borderColor: "rgba(255,107,71,0.45)" },
  modeChipText: { color: TEXT_SECONDARY, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  modeChipTextActive: { color: ACCENT_CORAL },
  sourcePress: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 2 },
  sourceText: { color: TEXT_SECONDARY, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  chevronPress: { paddingHorizontal: 5, paddingVertical: 2 },
  chevron: { color: TEXT_SECONDARY, fontSize: 12, fontWeight: "800" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  minimizeGlyph: { color: TEXT_SECONDARY, fontSize: 9, lineHeight: 12 },
  dotOk: { backgroundColor: ACCENT_CORAL },
  dotWarn: { backgroundColor: "rgba(234,179,8,0.9)" },
  panelLandscape: { alignSelf: "center", maxWidth: 420 },
  panel: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: SURFACE_GLASS,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  panelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  panelLabel: { color: TEXT_SECONDARY, width: 38, fontSize: 11, fontWeight: "700" },
  panelValue: {
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  panelButton: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  panelButtonText: { color: TEXT_PRIMARY, fontSize: 10, fontWeight: "800" },
  panelError: { color: ACCENT_CORAL, fontSize: 11, fontWeight: "600" },
  minimizedWrap: { alignItems: "flex-end", paddingRight: 4 },
  minimizedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: SURFACE_GLASS,
    borderWidth: 1,
    borderColor: BORDER,
  },
  minimizedText: { color: TEXT_SECONDARY, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
});
