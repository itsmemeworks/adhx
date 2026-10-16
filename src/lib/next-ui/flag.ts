/**
 * `next_ui` — the redesign's feature flag (phase 0 of the strangler rebuild).
 *
 * Resolution order, first decided value wins:
 *   0. `NEXT_UI_FORCE=on|off` (server only, runtime): the emergency switch
 *      for everyone, ignoring every per-browser choice (see `./server`)
 *   1. `?next_ui=1|0` on the current URL (also persisted, see below)
 *   2. the per-browser override (localStorage, mirrored to a cookie so the
 *      server helper sees the same answer)
 *   3. `NEXT_PUBLIC_NEXT_UI` (build-time env), else ON — the redesign is the
 *      default since the phase 7 cutover; `?next_ui=0` opts a browser out.
 *
 * This module is pure and isomorphic. The client hook lives in
 * `./useNextUi`, the server helper in `./server`.
 */

export const NEXT_UI_PARAM = 'next_ui'
export const NEXT_UI_STORAGE_KEY = 'adhx:next_ui'
export const NEXT_UI_COOKIE = 'adhx_next_ui'
/** One year — the override is a deliberate per-browser opt-in. */
export const NEXT_UI_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const ON = new Set(['1', 'true', 'on', 'yes'])
const OFF = new Set(['0', 'false', 'off', 'no'])

/** Parse a flag string: true / false, or null when absent or unrecognised. */
export function parseFlagValue(value: string | null | undefined): boolean | null {
  if (value == null) return null
  const v = value.trim().toLowerCase()
  if (ON.has(v)) return true
  if (OFF.has(v)) return false
  return null
}

/** On unless the build says otherwise (phase 7 cutover). */
export const NEXT_UI_DEFAULT = true

/** The build-time default. Inlined by Next for client bundles. */
export function envNextUiDefault(): boolean {
  return parseFlagValue(process.env.NEXT_PUBLIC_NEXT_UI) ?? NEXT_UI_DEFAULT
}

export interface NextUiSignals {
  /** Raw `?next_ui=` value, if any. */
  query?: string | null
  /** Raw persisted override (localStorage or cookie), if any. */
  stored?: string | null
  /** Raw env value; defaults to `NEXT_PUBLIC_NEXT_UI`. */
  env?: string | null
}

export function resolveNextUi(signals: NextUiSignals = {}): boolean {
  const fromQuery = parseFlagValue(signals.query)
  if (fromQuery !== null) return fromQuery
  const fromStored = parseFlagValue(signals.stored)
  if (fromStored !== null) return fromStored
  if (signals.env !== undefined) return parseFlagValue(signals.env) ?? NEXT_UI_DEFAULT
  return envNextUiDefault()
}
