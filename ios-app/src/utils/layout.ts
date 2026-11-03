/**
 * layout.ts — presentation-layer layout helpers for the AR placard deck.
 *
 * Presentation only: the frustum/gate math (src/math) stays untouched.
 * These helpers take already-projected placards and decide stacking,
 * clustering, and render windows so cards never overlap illegibly.
 *
 * Key concept — **coordinate clustering**: multiple sessions at a single
 * venue (e.g. six Mission Rec drop-in sessions at identical lat/lng) share
 * one primary venue placard. The extra activities surface as a "+N more
 * activities" badge; tapping expands the cluster into a horizontal
 * page-deck of full-detail cards. No more overlapping card piles.
 */

import type { PlacedPlacard, RawPin } from "../components/PlacardOverlay.tsx";

/** Max separation (meters) at which pins still count as one venue cluster. */
export const CLUSTER_RADIUS_M = 25;
/** Gap between stacked cluster pages (px, logical). */
export const STACK_GAP_PX = 12;
/** Max cluster pages rendered simultaneously when a cluster is expanded. */
export const MAX_VISIBLE_STACK = 4;
/** Screen-X separation treated as "same visual column" (px, logical). */
export const COLUMN_BUCKET_PX = 60;

/**
 * Pins whose coordinates differ by less than CLUSTER_RADIUS_M in both axes
 * (via per-degree meter conversion at the pin's latitude) belong to the same
 * venue cluster. Clusters of one are returned as-is.
 */
export function groupByVenue(pins: RawPin[]): RawPin[][] {
  const clusters: RawPin[][] = [];
  for (const pin of pins) {
    let merged = false;
    for (const cluster of clusters) {
      const head = cluster[0];
      const dLat = Math.abs(pin.lat - head.lat);
      const dLng = Math.abs(pin.lng - head.lng);
      const mPerDegLng = 111320 * Math.cos((head.lat * Math.PI) / 180);
      if (dLat * 111320 <= CLUSTER_RADIUS_M && dLng * mPerDegLng <= CLUSTER_RADIUS_M) {
        cluster.push(pin);
        merged = true;
        break;
      }
    }
    if (!merged) clusters.push([pin]);
  }
  return clusters;
}

/**
 * Choose the representative pin for a venue cluster: the nearest to the user
 * (min distanceM, then listing_id for determinism). All members carry the
 * same coordinates, so the primary card sits exactly where the venue is.
 */
export function pickPrimary(members: PlacedPlacard[]): PlacedPlacard {
  return members.reduce((best, m) => {
    if (m.distanceM !== best.distanceM) return m.distanceM < best.distanceM ? m : best;
    return m.pin.listing_id < best.pin.listing_id ? m : best;
  });
}

/**
 * Retarget a primary placard so it renders as a venue cluster card.
 * Mutates only the cluster summary fields; screen position is untouched.
 */
export function withClusterSummary(
  primary: PlacedPlacard,
  members: PlacedPlacard[],
): PlacedPlacard {
  if (members.length <= 1) {
    return { ...primary, clusterCount: 1, clusterPins: [] };
  }
  const others = members
    .filter((m) => m.pin.listing_id !== primary.pin.listing_id)
    .map((m) => m.pin);
  return { ...primary, clusterCount: members.length, clusterPins: others };
}

/**
 * Vertical stacking when several venue cards still collide on screen
 * (different venues that project to the same spot from a given heading).
 * Returns adjusted screenY per placard: each card is nudged down by its
 * estimated height + gap for every earlier card it overlaps in both the
 * X-bucket and Y-overlap senses. Ensures MIN_V_GAP_PX between cards.
 */
export function resolveOverlaps(
  placards: PlacedPlacard[],
  screenWidth: number,
  screenHeight: number,
  cardWidth: number,
  estimatedCardHeight: number,
  minGapPx: number,
  /** Bottom chrome (input bar + home indicator) reserved, px. Portrait
   * callers default to 96; landscape passes a smaller value because the
   * compact bottom bar leaves more of the short viewport usable. */
  bottomChromePx: number = 96,
): PlacedPlacard[] {
  // Sort by screenY so lower cards (nearer horizon) claim space first.
  const sorted = [...placards].sort((a, b) => a.screenY - b.screenY);
  const adjusted: PlacedPlacard[] = [];
  for (const card of sorted) {
    let y = card.screenY;
    for (const prev of adjusted) {
      const overlapsX =
        Math.abs(prev.screenX - card.screenX) < (cardWidth + COLUMN_BUCKET_PX) / 2;
      const overlapsY = Math.abs(prev.screenY - y) < estimatedCardHeight + minGapPx;
      if (overlapsX && overlapsY) {
        y = Math.max(y, prev.screenY + estimatedCardHeight + minGapPx);
      }
    }
    // Keep the card fully on screen.
    const maxY = screenHeight - estimatedCardHeight - bottomChromePx;
    adjusted.push({ ...card, screenY: Math.min(Math.max(12, y), Math.max(12, maxY)) });
  }
  return adjusted.sort((a, b) => a.screenY - b.screenY);
}

/**
 * Which cluster pages (deck indices) are visible given expansion state.
 * Collapsed clusters show only the primary page; expanded clusters show up
 * to MAX_VISIBLE_STACK pages.
 */
export function visibleStackPages(clusterCount: number, expanded: boolean): number {
  if (clusterCount <= 1) return 1;
  return expanded ? Math.min(clusterCount, MAX_VISIBLE_STACK) : 1;
}
