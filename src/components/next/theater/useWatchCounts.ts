'use client'

import { useEffect, useRef } from 'react'
import { putBack, takeBatch, WatchTracker, type Tally } from '@/lib/watch/tally'

/**
 * Watch counts from the theater (`POST /api/watched`): plays, finishes and
 * seconds watched of each video, by the rules in `src/lib/watch/tally.ts`.
 * The stage announces where its video is (`theater-video-progress`) and when
 * it ends (`theater-video-ended`); this only listens. Tallies wait in a
 * per-account outbox that survives reloads, and are sent every 30 s, when the
 * tab is hidden and when the page goes.
 */

export const WATCHED_FLUSH_MS = 30_000
const PER_CALL = 50
const MAX_POSTS = 500
const SAVE_EVERY_MS = 5_000
const POST_KEY = /^[a-z]{1,16}:[A-Za-z0-9_-]{1,64}$/

class WatchOutbox {
  tracker = new WatchTracker()
  timer: ReturnType<typeof setTimeout> | null = null
  request: AbortController | null = null
  savedAt = 0
  failures = 0
  users = 0
  /** The video on stage's length, once the stage says. */
  duration = 0
  constructor(readonly account: string) {
    try {
      const rows = JSON.parse(localStorage.getItem(this.storageKey) ?? '{}') as unknown
      if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return
      for (const [key, t] of Object.entries(rows as Record<string, Partial<Tally>>).slice(
        -MAX_POSTS,
      )) {
        const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0
        if (POST_KEY.test(key) && t && ok(t.plays) && ok(t.finishes) && ok(t.seconds))
          this.tracker.tallies.set(key, {
            plays: t.plays!,
            finishes: t.finishes!,
            seconds: t.seconds!,
          })
      }
    } catch {
      /* Storage may be unavailable; the in-memory outbox still sends. */
    }
  }
  get storageKey() {
    return `adhx-watched-outbox:${this.account}`
  }
  persist(force = false) {
    const now = Date.now()
    if (!force && now - this.savedAt < SAVE_EVERY_MS) return
    this.savedAt = now
    const tallies = this.tracker.tallies
    while (tallies.size > MAX_POSTS) tallies.delete(tallies.keys().next().value!)
    try {
      if (tallies.size)
        localStorage.setItem(this.storageKey, JSON.stringify(Object.fromEntries(tallies)))
      else localStorage.removeItem(this.storageKey)
    } catch {
      /* Storage quota or private browsing cannot break playback. */
    }
  }
  schedule(delay = WATCHED_FLUSH_MS) {
    if (!this.users || !this.tracker.tallies.size || document.hidden) return
    if (this.request || this.timer !== null) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, delay)
  }
  async flush() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    if (this.request) return
    const batch = takeBatch(this.tracker.tallies, PER_CALL)
    this.persist(true)
    if (!batch.length) return
    const controller = new AbortController()
    this.request = controller
    try {
      const response = await fetch('/api/watched', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        body: JSON.stringify({ posts: batch }),
      })
      // 400 is a body this server won't take, and 404 an ADHX without
      // counts: neither gets better by sending it again.
      if (!response.ok && response.status !== 400 && response.status !== 404)
        throw new Error('Watch counts not acknowledged')
      this.failures = 0
    } catch {
      // Back into this account's own outbox (an abort means another account
      // signed in: it waits here, never sent with their cookie).
      putBack(this.tracker.tallies, batch)
      this.failures++
    } finally {
      this.request = null
      this.persist(true)
      this.schedule(Math.min(5 * 60_000, WATCHED_FLUSH_MS * 2 ** Math.min(this.failures, 3)))
      if (!this.users && outboxes.get(this.account) === this) outboxes.delete(this.account)
    }
  }
}

const outboxes = new Map<string, WatchOutbox>()

/**
 * Counts the video on stage for a signed-in member. `postKey` is the post
 * on stage (`platform:id`) and `isVideo` whether it plays.
 */
export function useWatchCounts(
  enabled: boolean,
  accountId: string | undefined,
  postKey: string,
  isVideo: boolean,
): void {
  const scope = enabled && accountId ? accountId : null
  const key = scope && isVideo && POST_KEY.test(postKey) ? postKey : null
  const active = useRef<WatchOutbox | null>(null)
  const currentScope = useRef(scope)
  currentScope.current = scope
  useEffect(() => {
    if (!scope) return
    let outbox = outboxes.get(scope)
    if (!outbox) {
      outbox = new WatchOutbox(scope)
      outboxes.set(scope, outbox)
    }
    const o = outbox
    o.users++
    active.current = o
    const tracker = o.tracker
    const onProgress = (e: Event) => {
      const d = (e as CustomEvent<{ progress?: number; duration?: number }>).detail
      if (typeof d?.duration === 'number' && d.duration > 0) o.duration = d.duration
      if (typeof d?.progress !== 'number' || !o.duration) return
      const before = tracker.tallies.get(tracker.key ?? '')?.plays ?? 0
      tracker.sample(d.progress * o.duration, o.duration)
      const after = tracker.tallies.get(tracker.key ?? '')?.plays ?? 0
      o.persist(after !== before)
      o.schedule()
    }
    const onEnded = () => {
      tracker.ended()
      o.persist(true)
      o.schedule()
    }
    const onVisible = () => {
      if (document.hidden) void o.flush()
      else o.schedule()
    }
    const onPageHide = () => void o.flush()
    window.addEventListener('theater-video-progress', onProgress)
    window.addEventListener('theater-video-ended', onEnded)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', onPageHide)
    o.schedule()
    return () => {
      active.current = null
      window.removeEventListener('theater-video-progress', onProgress)
      window.removeEventListener('theater-video-ended', onEnded)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', onPageHide)
      o.users--
      if (o.users) return
      if (o.timer !== null) clearTimeout(o.timer)
      o.timer = null
      o.tracker.begin(null)
      // A scope change never sends the old account's counts with a new
      // cookie: they wait in that account's storage for its next visit.
      if (currentScope.current !== scope) {
        o.request?.abort()
        o.persist(true)
      } else void o.flush()
      if (!o.request && outboxes.get(scope) === o) outboxes.delete(scope)
    }
  }, [scope])
  useEffect(() => {
    const o = active.current
    if (!o || o.account !== currentScope.current) return
    o.duration = 0
    o.tracker.begin(key)
  }, [scope, key])
}
