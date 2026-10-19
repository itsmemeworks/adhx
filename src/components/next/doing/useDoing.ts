'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Saver } from '@/lib/people/types'

/** The client's copy of `DoingView` (`src/lib/processing/doing.ts`). */
export type DoingStatus = 'working' | 'waiting' | 'needs_you' | 'ready'
export type DoingScope = 'all' | 'mine' | 'needs'

export interface DoingItem {
  platform: string
  id: string
  title: string
  network: string
  thumbnail: string | null
  openPath: string
  savers: Saver[]
  savedAt: string
  step: number
  stepLabel: string
  steps: number
  percent: number | null
  status: DoingStatus
  playable: boolean
  reason: string | null
  retryInfo: { attempt: number; of: number; at: string | null } | null
  quality: string | null
  learned: string[]
  retry: boolean
  keepLinkOnly: boolean
  finishedAt: string | null
}

export interface DoingSummary {
  onTheirWay: number
  keeping: number
  learning: number
  needsYou: number
  ready: number
  freeBytes: number | null
  processing: 'local' | 'remote'
  remoteConnected: boolean | null
}

/**
 * Polls `/api/activity/processing` every `everyMs` while the page is
 * showing (and once more when it comes back). `summaryOnly` asks for counts.
 */
export function useDoing(options: {
  scope?: DoingScope
  everyMs: number
  summaryOnly?: boolean
  enabled?: boolean
}): {
  items: DoingItem[] | null
  summary: DoingSummary | null
  refresh: () => void
} {
  const { scope = 'all', everyMs, summaryOnly = false, enabled = true } = options
  const [items, setItems] = useState<DoingItem[] | null>(null)
  const [summary, setSummary] = useState<DoingSummary | null>(null)
  const timer = useRef<number | null>(null)

  const load = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current)
    try {
      const qs = new URLSearchParams({ scope, ...(summaryOnly ? { summary: '1' } : {}) })
      const res = await fetch(`/api/activity/processing?${qs}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (res.ok) {
        const data = (await res.json()) as { items?: DoingItem[]; summary: DoingSummary }
        setSummary(data.summary)
        if (data.items) setItems(data.items)
      }
    } catch {
      // Keep what's shown; try again on the next tick.
    }
    if (!document.hidden) timer.current = window.setTimeout(() => void load(), everyMs)
  }, [scope, everyMs, summaryOnly])

  useEffect(() => {
    if (!enabled) return
    void load()
    const onVisible = () => {
      if (!document.hidden) void load()
      else if (timer.current) window.clearTimeout(timer.current)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load, enabled])

  return { items, summary, refresh: () => void load() }
}
