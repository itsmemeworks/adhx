/**
 * Decide whether returning to the app should kick off a background bookmark
 * sync. "Last focus" is the primary signal; last successful sync is a fallback
 * for the first run after this feature ships (no last-focus stamp yet).
 */

export const LAST_VISIBLE_KEY = 'adhx-last-visible-at'
export const RESUME_LOCK_KEY = 'adhx-resume-sync-lock'
export const RESUME_SYNC_AFTER_MS = 24 * 60 * 60 * 1000

export function shouldResumeSync(opts: {
  lastVisibleAt: number | null
  lastSyncAt: number | null
  now: number
  thresholdMs?: number
}): boolean {
  const threshold = opts.thresholdMs ?? RESUME_SYNC_AFTER_MS
  const anchor = opts.lastVisibleAt ?? opts.lastSyncAt
  if (anchor == null || !Number.isFinite(anchor)) return false
  return opts.now - anchor >= threshold
}

export function readLastVisibleAt(): number | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(LAST_VISIBLE_KEY)
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function stampLastVisibleAt(now = Date.now()): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(LAST_VISIBLE_KEY, String(now))
}

/** Prevents double-firing resume sync (React Strict Mode remount, overlapping visibility). */
export function claimResumeSync(now = Date.now(), windowMs = 60_000): boolean {
  if (typeof sessionStorage === 'undefined') return true
  const raw = sessionStorage.getItem(RESUME_LOCK_KEY)
  if (raw) {
    const prev = Number(raw)
    if (Number.isFinite(prev) && now - prev < windowMs) return false
  }
  sessionStorage.setItem(RESUME_LOCK_KEY, String(now))
  return true
}
