'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * The feed's seen list from the theater: `mark(key)` once a post has been on
 * stage for 2s or was skipped. Marks are batched into `POST /api/views` (at
 * most 50 a call): a few seconds after the first, straight away at 10, and
 * when the page is hidden or the theater closes. Each post is sent once per
 * session. Off (`enabled: false`) for signed-out viewers.
 */

const FLUSH_MS = 4000
const FLUSH_AT = 10
const PER_CALL = 50

export const SEEN_AFTER_MS = 2000

export function useSeenPosts(enabled: boolean): (key: string) => void {
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const pending = useRef(new Map<string, { platform: string; id: string }>())
  const sent = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    while (pending.current.size > 0) {
      const batch = [...pending.current.entries()].slice(0, PER_CALL)
      for (const [key] of batch) pending.current.delete(key)
      void fetch('/api/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        // Survives the page closing.
        keepalive: true,
        body: JSON.stringify({ posts: batch.map(([, post]) => post) }),
      }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  return useCallback(
    (key: string) => {
      if (!enabledRef.current || !key || sent.current.has(key)) return
      const at = key.indexOf(':')
      if (at <= 0) return
      sent.current.add(key)
      pending.current.set(key, { platform: key.slice(0, at), id: key.slice(at + 1) })
      if (pending.current.size >= FLUSH_AT) flush()
      else if (timer.current === null) timer.current = setTimeout(flush, FLUSH_MS)
    },
    [flush],
  )
}
