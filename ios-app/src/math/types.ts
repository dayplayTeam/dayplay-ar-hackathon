/**
 * DayPlay AR spatial-math shared types (client side, Milestone M2).
 *
 * Mirrors the server pin schema in `docs/spatial-contract.md` v1 and the
 * pipeline output rows in `backend/pipeline.py::resolve_pins`. Extra fields
 * present on real rows (`starts_at`, `source_tool`, `via_tools`, `freshness`,
 * `freshness_note`, `grounding`, ...) flow through untouched and are not
 * re-validated client-side; the zero-hallucination gate is the final render
 * authority, not the type system.
 */

/** Server-verified AR pin (shape of one `/pins` / `/pipeline` row). */
export interface SpatialPin {
  /** Non-empty verified DayPlay listing id — the hallucination anchor. */
  readonly listing_id: string;
  /** Listing name (never model-generated), <= 80 chars per contract. */
  readonly name: string;
  /** WGS-84 latitude, degrees. */
  readonly lat: number;
  /** WGS-84 longitude, degrees. */
  readonly lng: number;
  /** Pin kind, per docs/spatial-contract.md. */
  readonly kind: 'saved' | 'event' | 'plan_stop';
  /** Optional distance in meters (server-computed); client recomputes. */
  readonly distance_m?: number;
  readonly [key: string]: unknown;
}

/** A pin that passed the zero-hallucination render gate. */
export type ValidatedPin = SpatialPin;

/** Gate outcome: accepted pin or a structured drop reason. */
export type GateResult =
  | { readonly ok: true; readonly pin: ValidatedPin }
  | { readonly ok: false; readonly reason: GateReason };

/** Structured drop reasons, mirroring backend/validator.py semantics. */
export type GateReason =
  | 'not_an_object'
  | 'missing_listing_id'
  | 'invalid_name'
  | 'invalid_lat_lng'
  | 'lat_lng_out_of_bounds'
  | 'distance_unavailable'
  | 'distance_out_of_range';
