/**
 * dayplay.ts — DayPlay canonical dark theme tokens (AR Placard & HUD polish).
 *
 * Source of truth for the spatial UI surface: near-black warm canvas,
 * subtle hairline borders, glassmorphic translucent cards, coral accent for
 * active/primary state, and the two-tier text ramp (bright titles, muted
 * secondary). Every surface color in the AR layer should reference these
 * tokens instead of hardcoding hex values.
 */

/** Warm near-black canvas color (DayPlay dark canon surface). */
export const SURFACE = "#1C1B1A";
/** Subtle hairline border color for cards and HUD chrome. */
export const BORDER = "#2A2826";
/** Glassmorphic card fill: surface color at 85% opacity. */
export const SURFACE_GLASS = "rgba(28,27,26,0.85)";
/** Coral accent — active/primary badges, LIVE chip, selected card. */
export const ACCENT_CORAL = "#FF6B47";
/** Coral at 18% opacity — chip/badge background tint. */
export const CORAL_TINT = "rgba(255,107,71,0.18)";
/** Primary text — bold titles. */
export const TEXT_PRIMARY = "#F5F4F2";
/** Secondary text — distance, bearing, captions. */
export const TEXT_SECONDARY = "#A19D97";
/** Standard card corner radius (DayPlay spatial UI). */
export const RADIUS = 16;

/** Kind chip labels per docs/spatial-contract.md pin kinds. */
export const KIND_LABELS: Record<string, string> = {
  event: "EVENT",
  plan_stop: "PLAN",
  saved: "SAVED",
};

/** Kind chip accent colors — quick at-a-glance category coding. */
export const KIND_COLORS: Record<string, string> = {
  event: ACCENT_CORAL, // coral — live/primary category
  plan_stop: "#A78BFA", // violet — planned stops
  saved: "#34D399", // emerald — saved places
};
