'use client'

import { useCallback, useEffect, useRef } from 'react'

const FLUSH_MS = 4000
const FLUSH_AT = 10
const PER_CALL = 50
const RETAIN_MS = 7 * 24 * 60 * 60_000
const MAX_PENDING = 5000
export const SEEN_AFTER_MS = 2000
type SeenPost = { platform: string; id: string; at: number }
const queues = new Map<string, SeenQueue>()

/** Acknowledged marks leave the outbox; failures stay, including across page
 * reloads. Storage is per account, bounded and never replayed for another user. */
class SeenQueue {
  pending = new Map<string, SeenPost>()
  sent = new Set<string>()
  timer: ReturnType<typeof setTimeout> | null = null
  request: AbortController | null = null
  users = 0
  failures = 0
  constructor(readonly account: string) {
    if (account === 'session') return
    try {
      const rows = JSON.parse(localStorage.getItem(this.storageKey) ?? '[]') as unknown
      if (!Array.isArray(rows)) return
      for (const p of rows.slice(-MAX_PENDING)) {
        if (
          p &&
          /^[a-z]{1,16}$/.test(p.platform) &&
          /^[A-Za-z0-9_-]{1,64}$/.test(p.id) &&
          typeof p.at === 'number' &&
          p.at > Date.now() - RETAIN_MS
        )
          this.pending.set(`${p.platform}:${p.id}`, p)
      }
    } catch {
      /* Storage may be unavailable; the in-memory outbox still retries. */
    }
  }
  get storageKey() {
    return `adhx-seen-outbox:${this.account}`
  }
  persist() {
    if (this.account === 'session') return
    try {
      if (this.pending.size)
        localStorage.setItem(
          this.storageKey,
          JSON.stringify([...this.pending.values()].slice(-MAX_PENDING)),
        )
      else localStorage.removeItem(this.storageKey)
    } catch {
      /* Storage quota or private browsing cannot break playback. */
    }
  }
  schedule(delay = FLUSH_MS) {
    if (!this.users || document.hidden || !this.pending.size || this.request || this.timer !== null)
      return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, delay)
  }
  mark(key: string) {
    if (this.sent.has(key) || this.pending.has(key)) return
    const at = key.indexOf(':')
    const platform = key.slice(0, at),
      id = key.slice(at + 1)
    if (at <= 0 || !/^[a-z]{1,16}$/.test(platform) || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return
    this.pending.set(key, { platform, id, at: Date.now() })
    while (this.pending.size > MAX_PENDING) this.pending.delete(this.pending.keys().next().value!)
    this.persist()
    if (this.pending.size >= FLUSH_AT) void this.flush()
    else this.schedule()
  }
  async flush() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    if (this.request) return
    for (const [key, post] of this.pending)
      if (post.at <= Date.now() - RETAIN_MS) this.pending.delete(key)
    this.persist()
    if (!this.pending.size) return
    const controller = new AbortController()
    this.request = controller
    try {
      // One request at a time also respects fetch keepalive's shared body budget.
      while (this.pending.size && !controller.signal.aborted) {
        const batch = [...this.pending.entries()].slice(0, PER_CALL)
        const response = await fetch('/api/views', {
          method: 'POST',
          credentials: 'same-origin',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
          body: JSON.stringify({ posts: batch.map(([, { platform, id }]) => ({ platform, id })) }),
        })
        if (!response.ok || controller.signal.aborted) throw new Error('Views not acknowledged')
        for (const [key] of batch) {
          this.pending.delete(key)
          this.sent.add(key)
        }
        while (this.sent.size > MAX_PENDING) this.sent.delete(this.sent.values().next().value!)
        this.failures = 0
        this.persist()
        // Closing a page gets one keepalive batch. The durable remainder resumes
        // next time instead of starting fresh requests after the user leaves.
        if (!this.users || document.hidden) break
      }
    } catch {
      this.failures++
    } finally {
      this.request = null
      this.schedule(Math.min(60_000, FLUSH_MS * 2 ** Math.min(this.failures, 4)))
      if (!this.users && queues.get(this.account) === this) queues.delete(this.account)
    }
  }
  visible = () => {
    if (!document.hidden) void this.flush()
  }
  pagehide = () => {
    void this.flush()
  }
}

/** Two seconds on stage (or skipped), with account-scoped acknowledged delivery. */
export function useSeenPosts(enabled: boolean, accountId?: string): (key: string) => void {
  const active = useRef<SeenQueue | null>(null)
  const scope = enabled ? (accountId ?? 'session') : null
  const currentScope = useRef(scope)
  currentScope.current = scope
  useEffect(() => {
    if (!scope) return
    let queue = queues.get(scope)
    if (!queue) {
      queue = new SeenQueue(scope)
      queues.set(scope, queue)
    }
    const q = queue
    q.users++
    active.current = q
    if (q.users === 1) {
      document.addEventListener('visibilitychange', q.visible)
      window.addEventListener('online', q.visible)
      window.addEventListener('pagehide', q.pagehide)
    }
    q.schedule()
    return () => {
      active.current = null
      q.users--
      if (q.users) return
      document.removeEventListener('visibilitychange', q.visible)
      window.removeEventListener('online', q.visible)
      window.removeEventListener('pagehide', q.pagehide)
      if (q.timer !== null) clearTimeout(q.timer)
      q.timer = null
      // A scope change must never submit an old account's marks with a new cookie.
      if (currentScope.current !== scope) q.request?.abort()
      else void q.flush()
      if (!q.request && queues.get(scope) === q) queues.delete(scope)
    }
  }, [scope])
  return useCallback((key: string) => {
    if (active.current?.account === currentScope.current) active.current.mark(key)
  }, [])
}
