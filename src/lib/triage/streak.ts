/**
 * Daily triage streak — pure logic (no DB/network), so it's trivially testable.
 *
 * A "streak" is the number of consecutive calendar days the user has triaged at
 * least one item. We operate on `YYYY-MM-DD` strings computed in the user's LOCAL
 * timezone (the client sends its local date), so a streak reflects the user's own
 * days regardless of server timezone.
 */

export interface StreakState {
  current: number
  longest: number
  /** Last day the user triaged, `YYYY-MM-DD`. */
  lastActiveDate: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidDay(d: unknown): d is string {
  return typeof d === 'string' && DATE_RE.test(d)
}

/** Whole calendar days from `a` to `b` (b - a). Negative if b precedes a. */
export function dayDiff(a: string, b: string): number {
  const ua = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))
  const ub = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
  return Math.round((ub - ua) / 86_400_000)
}

/**
 * Streak to DISPLAY given today, without mutating. The stored `current` is only
 * still "alive" if the last active day was today or yesterday; otherwise the
 * chain is already broken and we show 0.
 */
export function effectiveCurrent(state: StreakState | null, today: string): number {
  if (!state) return 0
  const d = dayDiff(state.lastActiveDate, today)
  return d <= 1 && d >= 0 ? state.current : 0
}

/** Record a triage day. Returns the new state (idempotent within the same day). */
export function recordDay(state: StreakState | null, today: string): StreakState {
  if (!state) return { current: 1, longest: 1, lastActiveDate: today }

  const d = dayDiff(state.lastActiveDate, today)
  if (d < 0) return state // clock skew / out-of-order — ignore

  let current: number
  if (d === 0)
    current = state.current // already counted today
  else if (d === 1)
    current = state.current + 1 // consecutive day
  else current = 1 // missed at least a day — restart

  return {
    current,
    longest: Math.max(state.longest, current),
    lastActiveDate: today,
  }
}
