'use client'

import { useEffect, useRef, useState } from 'react'
import { followDoing, type DoingSnapshot } from './doing-poller'
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
  accountId?: string
}): DoingSnapshot & { refresh: () => void } {
  const {
    scope = 'all',
    everyMs,
    summaryOnly = false,
    enabled = true,
    accountId = 'session',
  } = options
  const [state, setState] = useState<DoingSnapshot>({ items: null, summary: null, error: null })
  const refresh = useRef(() => {})
  useEffect(() => {
    setState({ items: null, summary: null, error: null })
    if (!enabled) return
    const subscription = followDoing(accountId, scope, { notify: setState, everyMs, summaryOnly })
    refresh.current = subscription.refresh
    return () => {
      refresh.current = () => {}
      subscription.leave()
    }
  }, [scope, everyMs, summaryOnly, enabled, accountId])
  return { ...state, refresh: () => refresh.current() }
}
