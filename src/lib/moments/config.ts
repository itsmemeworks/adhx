/**
 * Tuning for "Right now" moments: what people are saving, grouped by meaning,
 * as it happens. See `engine.ts`.
 */

const intEnv = (name: string, fallback: number, min: number): number => {
  const raw = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(raw) && raw >= min ? raw : fallback
}

/** Distinct people who must save the same kind of thing before it is a moment. */
export function minSavers(): number {
  return intEnv('MOMENT_MIN_SAVERS', 3, 1)
}

/** Posts a moment needs (besides savers). */
export const MIN_POSTS = 4

/** Windows tried in order until enough moments show up; the label says which. */
export const WINDOWS = [
  { hours: 24, label: 'Right now' },
  { hours: 72, label: 'Last few days' },
  { hours: 24 * 7, label: 'This week' },
] as const
/** A window "has enough" at this many moments. */
export const ENOUGH_MOMENTS = 3
export const MAX_MOMENTS = 9
/** Most recent saves considered per recompute. */
export const MAX_POSTS = 2000

/*
 * Similarities are measured after subtracting the average post vector
 * ("centred"): raw cosines between any two posts sit around 0.72, which
 * hides topics. Centred, unrelated posts sit near 0 (p99 ~0.31 on real
 * saves), posts on one topic ~0.25–0.5 apart and ~0.5–0.8 from their
 * group's centre. Tuned on real saves: at 0.42 a mostly-AI library's
 * "everything else" leaked into small groups; 0.46–0.48 keeps them clean.
 */
/** A post joins a moment when its similarity to the centre is at least this. */
export const JOIN_SIMILARITY = 0.48
/** Members kept when a cluster is cut (looser than joining, tighter than k-means). */
export const KEEP_SIMILARITY = 0.46
/** A forming group gathers posts this close to its centre. */
export const FORM_SIMILARITY = 0.4
/** Clusters of this cohesion or better can be moments. */
export const MIN_COHESION = 0.6
/** Old moment ↔ new cluster with this similarity keep the same slug, name and colour. */
export const SAME_MOMENT = 0.7

/** How often everything is regrouped from scratch, and how often new saves are checked. */
export const RECOMPUTE_MS = 5 * 60_000
export const TICK_MS = 3_000
/** Stop working after this long with nobody listening. */
export const IDLE_MS = 10 * 60_000
/** A new save waits this long for its first vector before it is dropped from the live strip. */
export const PENDING_MS = 3 * 60_000
/** Saves shown in the "Just saved" strip. */
export const STREAM_LENGTH = 12
/** A forming group is forgotten after this long without a new save. */
export const FORMING_TTL_MS = 6 * 60 * 60_000
export const MAX_FORMING = 3

/** Freshness half-life for ranking. */
export const HALF_LIFE_HOURS = 6

/** Bright, mid-chroma colours; dark text on each passes contrast. */
export const HUES = [
  '#7ee08a',
  '#ff9a62',
  '#ff9ec7',
  '#f6c35c',
  '#86c2ff',
  '#c3a6ff',
  '#7fe3d6',
  '#ff8a8a',
  '#d6e36b',
] as const
