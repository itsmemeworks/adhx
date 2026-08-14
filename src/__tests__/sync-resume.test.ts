/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  LAST_VISIBLE_KEY,
  RESUME_LOCK_KEY,
  claimResumeSync,
  readLastVisibleAt,
  shouldResumeSync,
  stampLastVisibleAt,
} from '@/lib/sync/resume'

describe('shouldResumeSync', () => {
  const day = 24 * 60 * 60 * 1000
  const now = 1_700_000_000_000

  it('does not sync on a first visit (no last focus, no last sync)', () => {
    expect(shouldResumeSync({ lastVisibleAt: null, lastSyncAt: null, now })).toBe(false)
  })

  it('syncs when last focus was more than a day ago', () => {
    expect(shouldResumeSync({ lastVisibleAt: now - day - 1, lastSyncAt: now - 60_000, now })).toBe(
      true,
    )
  })

  it('does not sync when last focus was earlier today', () => {
    expect(
      shouldResumeSync({ lastVisibleAt: now - 3 * 60 * 60 * 1000, lastSyncAt: null, now }),
    ).toBe(false)
  })

  it('falls back to last sync when there is no focus stamp yet', () => {
    expect(shouldResumeSync({ lastVisibleAt: null, lastSyncAt: now - day - 1, now })).toBe(true)
    expect(shouldResumeSync({ lastVisibleAt: null, lastSyncAt: now - 60_000, now })).toBe(false)
  })

  it('prefers last focus over last sync', () => {
    // Away 2 hours (no sync) even if last sync was a week ago.
    expect(
      shouldResumeSync({
        lastVisibleAt: now - 2 * 60 * 60 * 1000,
        lastSyncAt: now - 8 * day,
        now,
      }),
    ).toBe(false)
  })
})

describe('last-visible stamp + resume lock', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('round-trips the last-visible timestamp', () => {
    expect(readLastVisibleAt()).toBeNull()
    stampLastVisibleAt(123)
    expect(localStorage.getItem(LAST_VISIBLE_KEY)).toBe('123')
    expect(readLastVisibleAt()).toBe(123)
  })

  it('claims a resume once, then rejects within the lock window', () => {
    expect(claimResumeSync(1_000)).toBe(true)
    expect(sessionStorage.getItem(RESUME_LOCK_KEY)).toBe('1000')
    expect(claimResumeSync(1_000 + 10_000)).toBe(false)
    expect(claimResumeSync(1_000 + 60_000)).toBe(true)
  })
})
