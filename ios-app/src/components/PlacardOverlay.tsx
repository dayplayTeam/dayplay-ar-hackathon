/**
 * PlacardOverlay — M2/M4 floating spatial placards rendered over the camera.
 *
 * Pipeline (all geometry from src/math, the shared contract implementation):
 *   1. validatePins()    zero-hallucination gate: drop invalid/out-of-range
 *                        pins (never repair — a pin without a verified
 *                        listing does not exist).
 *   2. projectPin()      bearing + distance + 62 deg HFOV frustum culling,
 *                        normalized screenXNorm in [-1, +1].
 *   3. screen mapping    screenX = screenWidth * (screenXNorm * 0.5 + 0.5),
 *                        reproducing the web simulator's
 *                        `screenX_vw = 50 + hfov * 100` geometry.
 *   4. venue clustering  pins sharing a venue (coords within
 *                        CLUSTER_RADIUS_M) collapse into ONE primary venue
 *                        card with a "+N more activities" badge — tapping
 *                        expands a staggered page-deck of the cluster.
 *                        Residual collisions between DIFFERENT venues are
 *                        resolved with guaranteed vertical spacing
 *                        (resolveOverlaps) so cards never overlap illegibly.
 *   5. depth styling     scale + opacity attenuate with distance.
 *
 * Interaction (tappable placards):
 *   collapsed  — tap the venue card -> expand (page 0 focused).
 *   expanded   — focused DetailPage at the venue anchor with full details
 *                (starts_at, listing id, Directions handoff); other cluster
 *                pages stagger dimmed below, tap one to focus it; tap the
 *                backdrop or Close to collapse back to the venue card.
 *   The deck window shows at most MAX_VISIBLE_STACK pages so a big cluster
 *   never runs off-screen.
 *
 * Styling: DayPlay dark canon — surface #1C1B1A glass (rgba .85), hairline
 * border #2A2826, coral #FF6B47 for primary/active, text #F5F4F2 / #A19D97,
 * 16 px rounded corners, layered shadows + top highlight for depth.
 */

import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import {
  horizonYForPitch,
  isPointingAtFloor,
  MAX_RANGE_METERS,
  projectPin,
  validatePins,
  type GateReason,
} from "../math/index.ts";
import {
  ACCENT_CORAL,
  BORDER,
  CORAL_TINT,
  KIND_COLORS,
  KIND_LABELS,
  RADIUS,
  SURFACE_GLASS,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "../theme/dayplay.ts";
import { formatBearing, formatDistance, formatStartsAt } from "../utils/format.ts";
import {
  groupByVenue,
  MAX_VISIBLE_STACK,
  pickPrimary,
  resolveOverlaps,
  STACK_GAP_PX,
  withClusterSummary,
} from "../utils/layout.ts";
import {
  isWalkablePin,
  getGraduatedOpacity,
  getGraduatedBorder,
  WALKABLE_RADIUS_M,
  walkMinutes,
} from "../utils/walkability.ts";

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
  /** True walked distance in meters when the pin was corridor-remapped from
   * beyond the walk radius (live citywide events). Rendered as an honest
   * "3.5 km • Far" badge; absent for walk-radius pins (distanceM is then
   * the real distance). Never guessed — only set from verified geo. */
  real_distance_m?: number;
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
  /** True when the venue is genuinely walkable from the user (no corridor
   * remap beyond the 500 m walk radius). False = far/citywide radar pin:
   * rendered faded + info-only so judges can tell at a glance. */
  isWalkable: boolean;
  /** Total pins in this venue cluster (1 = plain single pin). */
  clusterCount: number;
  /** Other pins in this cluster, primary first, for the expanded deck. */
  clusterPins: RawPin[];
}

/** Render telemetry for the HUD (PINS: x/y in FOV). */
export interface OverlayStats {
  /** Raw pins handed to the overlay this frame. */
  totalPins: number;
  /** Pins that passed the gate AND are inside the 62 deg FOV. */
  visiblePins: number;
  /** Pins dropped by the zero-hallucination gate. */
  rejectedPins: number;
  /** Venue clusters currently on screen (one card per venue). */
  venueCards: number;
}

export interface PlacardOverlayProps {
  pins: RawPin[];
  isLandscape?: boolean;
  /** Live GPS fix; null until watchPositionAsync has locked. */
  userPosition: UserPosition | null;
  /** True-North heading in degrees [0, 360), or null until compass locks. */
  userHeading: number | null;
  devicePitch?: number | null;
  /** When true and zero placards survive, render the Honest-Zero empty-state
   * card ("0 verified places found...") instead of a silent blank viewport. */
  showEmptyState?: boolean;
  screenWidth: number;
  screenHeight: number;
  /** Optional per-frame stats for the HUD placard counter. */
  onStats?: (stats: OverlayStats) => void;
}

/** Center horizon line as a fraction of screen height — portrait (Y of the horizon). */
const HORIZON_Y_FRACTION_PORTRAIT = 0.42;
/** Landscape screens are shorter (~390-430px): drop the horizon slightly
 * lower so the wider FOV band still has usable vertical room below it. */
const HORIZON_Y_FRACTION_LANDSCAPE = 0.45;
/** Vertical spread below the horizon for near pins (fraction of height) — portrait. */
const VERTICAL_SPREAD_FRACTION_PORTRAIT = 0.22;
/** Landscape: smaller vertical pitch so the pin band fits the short height
 * without cards clipping off the bottom. */
const VERTICAL_SPREAD_FRACTION_LANDSCAPE = 0.16;
/** Gap between staggered expanded pages in landscape (smaller pitch). */
const STACK_GAP_PX_LANDSCAPE = 6;
/** Bottom chrome (input bar + home indicator) reserved in portrait. */
const BOTTOM_CHROME_PX_PORTRAIT = 96;
/** Landscape bottom chrome is shorter — the compact input bar leaves more room. */
const BOTTOM_CHROME_PX_LANDSCAPE = 56;
/** Max cluster pages rendered when expanded — landscape (short height fits 2). */
const MAX_VISIBLE_STACK_LANDSCAPE = 2;
/** Half placard width used to keep the anchor card inside the viewport. */
const HEDGE_MARGIN_PX = 72;
/** Collapsed venue card width (px, logical). */
export const CARD_WIDTH_PX = 236;
/** Collapsed venue card estimated height (px, logical). */
export const CARD_HEIGHT_PX = 118;
/** Expanded detail page height estimate (px, logical). */
export const EXPANDED_PAGE_HEIGHT_PX = 188;
/** Minimum vertical gap between any two venue cards (px, logical). */
export const MIN_CARD_GAP_PX = 12;

/** Clamp v into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Kind/category tag text for the placard chip. */
function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? "SAVED";
}

/** Kind chip accent color — quick at-a-glance category coding. */
function kindColor(kind: string): string {
  return KIND_COLORS[kind] ?? "#34D399";
}

/** isWalkablePin for a RawPin: real_distance_m rides the index signature. */
function pinWalkable(pin: RawPin): boolean {
  const real = pin.real_distance_m;
  return isWalkablePin(
    typeof real === "number" ? real : undefined,
    typeof pin.distanceM === "number" ? pin.distanceM : (real as number | undefined) ?? Number.POSITIVE_INFINITY,
  );
}

/**
 * Cluster-wide walkability: a venue is walkable only when EVERY member is.
 * One far remapped session inside a walkable cluster must not read as a
 * short walk.
 */
function clusterWalkable(placard: PlacedPlacard): boolean {
  return (
    placard.isWalkable &&
    placard.clusterPins.every((p) => pinWalkable(p))
  );
}

/**
 * Directions handoff URL (Apple Maps, walking mode). Opens the Maps app on
 * device via the universal https link — no Info.plist query-scheme entry
 * needed, and the link degrades to a browser map off-device.
 */
export function directionsUrl(pin: RawPin): string {
  return `https://maps.apple.com/?daddr=${pin.lat},${pin.lng}&dirflg=w`;
}

/**
 * Project + gate + cull the raw pins into renderable venue placards.
 * Pure: same inputs -> same layout, no side effects (React-friendly).
 */
export function buildPlacards(
  pins: RawPin[],
  userPosition: UserPosition | null,
  userHeading: number | null,
  screenWidth: number,
  screenHeight: number,
  isLandscape: boolean = false,
  devicePitch?: number | null,
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

  // 4a. Screen pixel mapping + distance-based vertical placement.
  // Landscape phones (~800-930 x ~390-430px): horizon sits a touch lower and
  // the near-pin band compresses so cards never clip off the short bottom edge.
  // Pitch compensation (elevated / highrise viewpoint). devicePitch is the
  // camera tilt above level in degrees [0, 90]: 0 = handheld vertical (true
  // horizon crosses the screen band), 90 = looking straight down. As the
  // camera aims at the ground the real horizon rises off the top of the
  // frame, so horizonY moves UP with pitch and the near-pin band stretches
  // downward — ground-level places stay mapped to the ground instead of
  // floating mid-air on the static band. null (no motion fix) = static band.
  // Pitch semantics (see math/frustum.ts isPointingAtFloor — regression-locked
  // after the 0/19 incident): 0° = upright level horizon, +pitch = camera
  // tilted DOWN. Street pins cull only when the optical axis depression
  // exceeds half the camera VFOV (pitch > 55°); an upright handheld phone
  // NEVER culls. null pitch (no motion fix) = static band, never culls.
  const floorCull = isPointingAtFloor(devicePitch);

  const baseHorizonY = screenHeight * (isLandscape ? HORIZON_Y_FRACTION_LANDSCAPE : HORIZON_Y_FRACTION_PORTRAIT);
  const horizonY = horizonYForPitch(devicePitch, baseHorizonY, screenHeight);
  const spread = screenHeight * (isLandscape ? VERTICAL_SPREAD_FRACTION_LANDSCAPE : VERTICAL_SPREAD_FRACTION_PORTRAIT);
  const maxScreenY = Math.max(12, screenHeight - CARD_HEIGHT_PX - 24);

  const projected: PlacedPlacard[] = inFov
    .filter(() => !floorCull)
    .map(({ pin, projected }) => {
    const rawX = screenWidth * (projected.screenXNorm * 0.5 + 0.5);
    const screenX = clamp(rawX, HEDGE_MARGIN_PX, screenWidth - HEDGE_MARGIN_PX);
    const distanceNorm = clamp(projected.distanceM / MAX_RANGE_METERS, 0, 1);
    const rawScreenY = horizonY + (1 - distanceNorm) * spread;
    const screenY = clamp(rawScreenY, 12, maxScreenY);
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
      isWalkable: isWalkablePin(
        typeof pin.real_distance_m === "number" ? pin.real_distance_m : undefined,
        projected.distanceM,
      ),
      clusterCount: 1,
      clusterPins: [],
    };
  });

  // 4b. Venue clustering: collapse same-venue pins (e.g. six Mission Rec
  // sessions at identical coordinates) into one primary card with a
  // "+N more activities" badge — no more overlapping card piles.
  const placeGroups = groupByVenue(projected.map((p) => p.pin));
  const byId = new Map(projected.map((p) => [p.pin.listing_id, p]));

  const clustered: PlacedPlacard[] = placeGroups.flatMap((members) => {
    const placedMembers = members
      .map((m) => byId.get(m.listing_id))
      .filter((m): m is PlacedPlacard => m !== undefined);
    if (placedMembers.length === 0) return [];
    const primary = pickPrimary(placedMembers);
    return [withClusterSummary(primary, placedMembers)];
  });

  // 4c. Residual collision pass across DIFFERENT venues (same spot from
  // this heading): guarantee minimum vertical spacing so cards never overlap.
  const placed = resolveOverlaps(
    clustered,
    screenWidth,
    screenHeight,
    CARD_WIDTH_PX,
    CARD_HEIGHT_PX,
    MIN_CARD_GAP_PX,
    // Landscape reserves less bottom chrome: the compact input bar sits
    // closer to the edge, so more of the short viewport stays usable.
    isLandscape ? BOTTOM_CHROME_PX_LANDSCAPE : BOTTOM_CHROME_PX_PORTRAIT,
  );

  return { placed, rejected };
}

/** One deck per venue cluster; pages = primary first, then cluster members. */
export interface DeckPage {
  /** Cluster key == primary listing id. */
  clusterId: string;
  /** Primary placard (anchor of the cluster deck). */
  primary: PlacedPlacard;
  /** Pages: primary first, then remaining cluster members in pinned order. */
  pages: PlacedPlacard[];
}

/** Build one deck per venue cluster (single-pin clusters get one page). */
export function buildDecks(placed: PlacedPlacard[]): DeckPage[] {
  return placed.map((primary) => ({
    clusterId: primary.pin.listing_id,
    primary,
    pages: [
      primary,
      ...primary.clusterPins.map((pin) => ({
        ...primary,
        pin,
        clusterCount: primary.clusterCount,
        clusterPins: [],
      })),
    ],
  }));
}

/* ------------------------------------------------------------------ chips */

function KindChip({ kind }: { kind: string }) {
  const color = kindColor(kind);
  return (
    <View style={[styles.kindChip, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
      <Text style={[styles.kindChipText, { color }]}>{kindLabel(kind)}</Text>
    </View>
  );
}

function BearingChip({ bearingDeg }: { bearingDeg: number }) {
  return (
    <View style={styles.bearingChip}>
      <Text style={styles.bearingChipText}>{formatBearing(bearingDeg)}</Text>
    </View>
  );
}

function DistanceChip({ meters, realMeters }: { meters: number; realMeters?: number }) {
  // Corridor-remapped far event: the AR slot is inside the walk radius but
  // the venue is not — show the TRUE distance as a clear "◇ 3.4 km • Far"
  // pill (hollow diamond = radar signal, never implies a short walk).
  const far = realMeters !== undefined && realMeters > meters + 1;
  const label = far ? `${formatDistance(realMeters)} • Far` : formatDistance(meters);
  return (
    <View style={styles.distanceChip}>
      <Text style={styles.distanceIcon}>{far ? "◇" : "◎"}</Text>
      <Text style={styles.distanceText}>{label}</Text>
    </View>
  );
}

/** Faded "far away" chip: honest info-only signal on unwalkable placards. */
function FarChip() {
  return (
    <View style={styles.farChip}>
      <Text style={styles.farChipText}>◇ FAR · INFO-ONLY</Text>
    </View>
  );
}

/** Coral "walkable" chip: at-a-glance walkable outing marker. */
function WalkableChip({ minutes }: { minutes: number }) {
  return (
    <View style={styles.walkableChip}>
      <Text style={styles.walkableChipText}>🚶 {minutes} MIN WALK</Text>
    </View>
  );
}

/* ----------------------------------------------------------------- cards */

/** Collapsed single-venue card: chips row, title, distance + cluster badge. */
function VenueCard({
  placard,
  onPress,
}: {
  placard: PlacedPlacard;
  onPress: () => void;
}) {
  const moreCount = placard.clusterCount - 1;
  // Cluster-wide walkability: a venue is walkable only when EVERY member is
  // (one far remapped session inside a walkable cluster must not read as a
  // short walk).
  const walkable = clusterWalkable(placard);
  const borderStyle = getGraduatedBorder(
    typeof placard.pin.real_distance_m === "number" ? placard.pin.real_distance_m : undefined,
    placard.distanceM,
    walkable,
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${placard.pin.name}, ${formatDistance(placard.distanceM)} away${
        walkable ? `, about ${walkMinutes(placard.distanceM)} minute walk` : ", too far to walk, info only"
      }${moreCount > 0 ? `, plus ${moreCount} more activities` : ""}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        walkable ? styles.cardWalkable : styles.cardFar,
        { borderColor: borderStyle.borderColor, borderWidth: borderStyle.borderWidth },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardTopRow}>
        <KindChip kind={placard.pin.kind} />
        <BearingChip bearingDeg={placard.bearingDeg} />
      </View>
      <Text style={[styles.title, !walkable && styles.titleFar]} numberOfLines={2}>
        {placard.pin.name}
      </Text>
      <View style={styles.cardBottomRow}>
        <DistanceChip meters={placard.distanceM} realMeters={placard.pin.real_distance_m} />
        {moreCount > 0 ? (
          <View style={styles.moreBadge}>
            <Text style={styles.moreBadgeText}>+{moreCount} more activities</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.statusRow}>
        {walkable ? (
          <WalkableChip minutes={walkMinutes(placard.distanceM)} />
        ) : (
          <FarChip />
        )}
      </View>
    </Pressable>
  );
}

/**
 * Expanded cluster page. Focused pages are NOT pressable (Directions and
 * Close are separate sibling pressables — no nested-touchable double-fire);
 * unfocused pages are pressable to focus.
 */
function DetailPage({
  placard,
  focused,
  index,
  total,
  onPress,
  onClose,
}: {
  placard: PlacedPlacard;
  focused: boolean;
  index: number;
  total: number;
  onPress: () => void;
  onClose: () => void;
}) {
  const startsAt = formatStartsAt(placard.pin.starts_at);
  const walkable = placard.isWalkable;
  const body = (
    <>
      <View style={styles.cardTopRow}>
        <KindChip kind={placard.pin.kind} />
        <BearingChip bearingDeg={placard.bearingDeg} />
      </View>
      <Text style={[styles.title, !walkable && styles.titleFar]} numberOfLines={2}>
        {placard.pin.name}
      </Text>
      {startsAt ? <Text style={styles.metaLine}>🗓 {startsAt}</Text> : null}
      <View style={styles.cardBottomRow}>
        <DistanceChip meters={placard.distanceM} realMeters={placard.pin.real_distance_m} />
        <View style={styles.pageBadge}>
          <Text style={styles.pageBadgeText}>
            {index + 1}/{total}
          </Text>
        </View>
      </View>
      <View style={styles.statusRow}>
        {walkable ? (
          <WalkableChip minutes={walkMinutes(placard.distanceM)} />
        ) : (
          <FarChip />
        )}
      </View>
    </>
  );

  if (!focused) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${placard.pin.name}, tap to focus`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          styles.cardExpanded,
          walkable ? styles.cardWalkable : styles.cardFar,
          pressed && styles.cardPressed,
        ]}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.card,
        styles.cardExpanded,
        styles.cardFocused,
        walkable ? styles.cardWalkable : styles.cardFar,
      ]}
    >
      {body}
      <View style={styles.actionsRow}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={
            walkable ? "Open walking directions in Maps" : "Open map to this far venue"
          }
          hitSlop={6}
          onPress={() => void Linking.openURL(directionsUrl(placard.pin))}
          style={styles.directionsButton}
        >
          <Text style={styles.directionsButtonText}>
            {walkable ? "Directions →" : "View on Map →"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close activity details"
          hitSlop={6}
          onPress={onClose}
          style={styles.closeButton}
        >
          <Text style={styles.closeButtonText}>✕ Close</Text>
        </Pressable>
      </View>
      <Text style={styles.listingId}>ID {placard.pin.listing_id.slice(0, 8)}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ deck */

/**
 * VenueDeck — one interactive venue cluster.
 *
 * The deck window shows at most MAX_VISIBLE_STACK pages, ordered focused
 * first (circular rotation), so large clusters stay fully on-screen.
 * Screen position stays at the projected venue anchor in every state;
 * pages stagger vertically below the anchor with STACK_GAP_PX pitch.
 */
function VenueDeck({
  deck,
  screenWidth,
  screenHeight,
  hasAnyWalkableInView,
}: {
  deck: DeckPage;
  screenWidth: number;
  screenHeight: number;
  /** True when at least one deck in the current view is walkable — drives
   * the graduated far-card dimming (nothing walkable -> elevated band). */
  hasAnyWalkableInView: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);

  // Rig/heading changes re-project the anchor; keep the current page in range.
  useEffect(() => {
    if (focusIndex >= deck.pages.length) setFocusIndex(0);
  }, [deck.pages.length, focusIndex]);

  const isLandscape = screenWidth > screenHeight;
  const anchor = deck.primary;
  const cardWidth = expanded ? CARD_WIDTH_PX + 40 : CARD_WIDTH_PX;
  const walkable = clusterWalkable(anchor);
  const rawDist =
    typeof anchor.pin.real_distance_m === "number" ? anchor.pin.real_distance_m : undefined;
  // Graduated distance styling (MrMister, 2026-11-04): walkable cards hold
  // full vibrant 0.95-1.0 presence; far cards use the graduated ramp
  // (0.85 -> 0.60 with a walkable card in view, elevated 0.95 -> 0.78 when
  // nothing walkable is in view so the closest cards read as primary radar
  // targets — never the old flat 0.35 ghost-card wall).
  const graduatedOpacity = getGraduatedOpacity(rawDist, anchor.distanceM, walkable, hasAnyWalkableInView);
  const anchorOpacity = expanded
    ? walkable ? 1 : graduatedOpacity
    : walkable ? 0.95 + 0.05 * anchor.depthOpacity : graduatedOpacity;
  const anchorShadow = walkable ? "#000" : "rgba(255,107,71,0.15)";

  // Hedge the anchor so the card stays fully on-screen.
  const left = clamp(anchor.screenX, cardWidth / 2 + 8, screenWidth - cardWidth / 2 - 8);
  // Landscape cards are wider relative to the viewport; shift the hedge so the
  // full card width maps across the wide horizontal FOV without edge clipping.
  const hedge = Math.min(HEDGE_MARGIN_PX, cardWidth / 2 + 8);
  const clampedLeft = clamp(anchor.screenX, hedge, screenWidth - hedge);
  const leftFinal = expanded ? clampedLeft : left;
  // Clamp the anchor vertically: a card must never hang off the short
  // landscape bottom edge.
  const top = clamp(
    anchor.screenY,
    12,
    Math.max(12, screenHeight - (expanded ? EXPANDED_PAGE_HEIGHT_PX : CARD_HEIGHT_PX) - 8),
  );
  // Landscape: tighter stagger pitch + fewer visible pages so the deck window
  // (focused page + staggering) still fits the ~390-430px height.
  const stackPitch = EXPANDED_PAGE_HEIGHT_PX + (isLandscape ? STACK_GAP_PX_LANDSCAPE : STACK_GAP_PX);
  const maxVisible = isLandscape ? MAX_VISIBLE_STACK_LANDSCAPE : MAX_VISIBLE_STACK;

  if (!expanded) {
    return (
      <View
        pointerEvents="box-none"
        style={[
          styles.anchorWrap,
          {
            left: leftFinal,
            top,
            opacity: anchorOpacity,
            shadowColor: anchorShadow,
            transform: [{ translateX: -cardWidth / 2 }, { scale: anchor.depthScale }],
          },
        ]}
      >
        <VenueCard placard={anchor} onPress={() => { if (walkable) { setFocusIndex(0); setExpanded(true); } }} />
      </View>
    );
  }

  // Deck window: focused page first, then the remaining pages in circular
  // order, capped at MAX_VISIBLE_STACK so tall clusters stay on-screen.
  const ordered = [
    ...deck.pages.slice(focusIndex),
    ...deck.pages.slice(0, focusIndex),
  ];
  const windowPages = ordered.slice(0, maxVisible);
  const originalIndexOf = (page: PlacedPlacard): number =>
    deck.pages.findIndex((p) => p.pin.listing_id === page.pin.listing_id);

  return (
    // Root fills the screen so the backdrop Pressable can catch taps anywhere
    // outside the deck (tap-outside-to-collapse). Children are positioned in
    // the same screen coordinate space.
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Backdrop: tap anywhere outside the deck to collapse. */}
      <Pressable
        accessibilityLabel="Collapse venue details"
        onPress={() => setExpanded(false)}
        style={styles.backdrop}
      />
      {/* Focused page at the venue anchor — full opacity/scale for walkable
          venues so the card being read is never attenuated; far venues hold
          half strength (info-only radar signal, never masquerades as near). */}
      <View
        style={[
          styles.anchorWrap,
          {
            left: leftFinal,
            top,
            opacity: walkable ? 1 : graduatedOpacity,
            shadowColor: walkable ? "#000" : "rgba(255,107,71,0.15)",
            transform: [{ translateX: -cardWidth / 2 }, { scale: 1 }],
          },
        ]}
      >
        <DetailPage
          placard={windowPages[0]}
          focused
          index={originalIndexOf(windowPages[0])}
          total={deck.pages.length}
          onPress={() => setExpanded(false)}
          onClose={() => setExpanded(false)}
        />
      </View>
      {/* Remaining window pages staggered below (tap to focus). */}
      {windowPages.slice(1).map((page, i) => (
        <View
          key={page.pin.listing_id}
          style={[
            styles.anchorWrap,
            {
              left: leftFinal,
              top: Math.min(
                Math.max(12, screenHeight - EXPANDED_PAGE_HEIGHT_PX - 8),
                top + (i + 1) * stackPitch,
              ),
              opacity: 0.5,
              transform: [{ translateX: -cardWidth / 2 }, { scale: 0.92 }],
            },
          ]}
        >
          <DetailPage
            placard={page}
            focused={false}
            index={originalIndexOf(page)}
            total={deck.pages.length}
            onPress={() => setFocusIndex(originalIndexOf(page))}
            onClose={() => setExpanded(false)}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * Overlay root: gate → project → cluster → decks. Pure layout math lives in
 * buildPlacards; each deck owns its own expanded/focus interaction state.
 */
export default function PlacardOverlay({
  pins,
  userPosition,
  userHeading,
  devicePitch,
  showEmptyState = false,
  screenWidth,
  screenHeight,
  isLandscape = false,
  onStats,
}: PlacardOverlayProps) {
  const { placed, rejected } = useMemo(
    () => buildPlacards(pins, userPosition, userHeading, screenWidth, screenHeight, isLandscape, devicePitch),
    [pins, userPosition, userHeading, screenWidth, screenHeight, isLandscape, devicePitch],
  );

  const decks = useMemo(() => buildDecks(placed), [placed]);
  // "Nothing walkable in view" step-up: when no deck is walkable, far cards
  // brighten to the elevated band so the closest cards stay primary targets.
  const anyWalkableInView = placed.some((p) => p.isWalkable);

  useEffect(() => {
    onStats?.({
      totalPins: pins.length,
      visiblePins: placed.length,
      rejectedPins: rejected.length,
      venueCards: decks.length,
    });
  }, [onStats, pins.length, placed.length, rejected.length, decks.length]);

  // Only show Honest-Zero card if total pins provided to the overlay is 0!
  // If pins exist in the corridor but are simply outside the 62° camera FOV (e.g. behind the user),
  // return null so the viewport remains clean (the HUD already accurately reflects 0/N in FOV).
  if (pins.length === 0) {
    if (!showEmptyState) return null;
    return (
      <View pointerEvents="none" style={styles.honestZeroWrap}>
        <View style={styles.honestZeroCard}>
          <Text style={styles.honestZeroEmoji}>◎</Text>
          <Text style={styles.honestZeroTitle}>
            0 verified places match this filter.
          </Text>
          <Text style={styles.honestZeroSub}>Try a different query or chip.</Text>
        </View>
      </View>
    );
  }

  if (decks.length === 0) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {decks.map((deck) => (
        <VenueDeck
          key={deck.clusterId}
          deck={deck}
          screenWidth={screenWidth}
          screenHeight={screenHeight}
          hasAnyWalkableInView={anyWalkableInView}
        />
      ))}
    </View>
  );
}

/* ---------------------------------------------------------------- styles */

const styles = StyleSheet.create({
  honestZeroWrap: {
    position: "absolute",
    top: "38%",
    left: 24,
    right: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  honestZeroCard: {
    backgroundColor: "rgba(28,27,26,0.92)",
    borderColor: "rgba(255,107,71,0.4)",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  honestZeroEmoji: { fontSize: 24 },
  honestZeroTitle: { color: "#FF6B47", fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
  honestZeroSub: { color: "#A19D97", fontSize: 12, textAlign: "center", lineHeight: 16 },
  anchorWrap: { position: "absolute" },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  card: {
    width: CARD_WIDTH_PX,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: RADIUS,
    backgroundColor: SURFACE_GLASS,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 6,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    // Subtle inner glow: brighter 1px top edge.
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  // WALKABLE placard: DayPlay coral stroke + vivid glass. The outline reads
  // as "this is a real outing you can walk to right now" (orange stroke per
  // the visual-differentiation spec).
  cardWalkable: {
    borderColor: "rgba(255,107,71,0.85)",
    borderWidth: 1.5,
    shadowColor: "rgba(255,107,71,0.35)",
    shadowOpacity: 0.55,
  },
  // FAR / info-only placard: graduated depth styling. The graduated opacity
  // ramp + per-card border (getGraduatedBorder) carry the "distant" signal;
  // the background holds 0.85 alpha so text stays high-contrast against the
  // live camera at every distance step — never an unreadable ghost.
  cardFar: {
    backgroundColor: "rgba(28,27,26,0.85)",
    shadowOpacity: 0.25,
  },
  titleFar: { color: TEXT_SECONDARY },
  // Status chips row (walkable / far badge sits under the distance row).
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  walkableChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: CORAL_TINT,
    borderWidth: 1,
    borderColor: "rgba(255,107,71,0.6)",
  },
  walkableChipText: {
    color: ACCENT_CORAL,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    fontVariant: ["tabular-nums"],
  },
  farChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  farChipText: {
    color: TEXT_SECONDARY,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    fontVariant: ["tabular-nums"],
  },
  cardFocused: {
    borderColor: "rgba(255,107,71,0.6)",
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  cardExpanded: { width: CARD_WIDTH_PX + 40 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kindChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  kindChipText: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  bearingChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  bearingChipText: {
    color: TEXT_SECONDARY,
    fontSize: 10,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  title: { color: TEXT_PRIMARY, fontSize: 13, fontWeight: "700", lineHeight: 17 },
  metaLine: { color: TEXT_SECONDARY, fontSize: 10, fontWeight: "600" },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  distanceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  distanceIcon: { color: TEXT_SECONDARY, fontSize: 10, lineHeight: 12 },
  distanceText: {
    color: TEXT_PRIMARY,
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  moreBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: CORAL_TINT,
    borderWidth: 1,
    borderColor: "rgba(255,107,71,0.45)",
  },
  moreBadgeText: { color: ACCENT_CORAL, fontSize: 9, fontWeight: "800" },
  pageBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  pageBadgeText: {
    color: TEXT_SECONDARY,
    fontSize: 9,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
  directionsButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: CORAL_TINT,
    borderWidth: 1,
    borderColor: "rgba(255,107,71,0.5)",
  },
  directionsButtonText: { color: ACCENT_CORAL, fontSize: 11, fontWeight: "800" },
  closeButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  closeButtonText: { color: TEXT_SECONDARY, fontSize: 11, fontWeight: "700" },
  listingId: {
    color: TEXT_SECONDARY,
    fontSize: 9,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
});
