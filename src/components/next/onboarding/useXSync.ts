'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseSyncErrorEvent, type SyncErrorCode } from '@/lib/sync/messages'
import { useBusyLogo } from '../logo-busy'

/**
 * Drives `GET /api/sync` (server-sent events) for the onboarding screen:
 * pages fetched from X, each bookmark processed, then complete or an error.
 * The same stream the current sync UI uses; this only shapes it for display.
 */
export interface SyncThumb {
  id: string
  img: string | null
}

export interface XSyncState {
  status: 'idle' | 'running' | 'done' | 'error'
  /** Bookmarks X has handed over so far (across pages). */
  found: number
  /** Bookmarks processed into saves so far. */
  processed: number
  /** Total to process, once X has given every page. */
  total: number | null
  added: number
  pages: number
  /** Posts as they arrive, newest first (for the tiles). */
  thumbs: SyncThumb[]
  error: string | null
  errorCode: SyncErrorCode | null
}

const INITIAL: XSyncState = {
  status: 'idle',
  found: 0,
  processed: 0,
  total: null,
  added: 0,
  pages: 0,
  thumbs: [],
  error: null,
  errorCode: null,
}

type Bookmark = {
  id?: string
  platform?: string
  media?: { thumbnailUrl?: string | null }[] | null
}

function thumbOf(bookmark: Bookmark | undefined): SyncThumb | null {
  if (!bookmark?.id) return null
  return { id: bookmark.id, img: bookmark.media?.find((m) => m.thumbnailUrl)?.thumbnailUrl ?? null }
}

export function useXSync(): XSyncState & { start: () => void } {
  const [state, setState] = useState<XSyncState>(INITIAL)
  useBusyLogo('x-sync', state.status === 'running')
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => () => sourceRef.current?.close(), [])

  const start = useCallback(() => {
    sourceRef.current?.close()
    setState({ ...INITIAL, status: 'running' })
    const source = new EventSource('/api/sync')
    sourceRef.current = source
    const data = <T>(e: Event): T | null => {
      try {
        return JSON.parse((e as MessageEvent<string>).data) as T
      } catch {
        return null
      }
    }
    source.addEventListener('page', (e) => {
      const d = data<{ pageNumber?: number; tweetsFound?: number }>(e)
      setState((s) => ({
        ...s,
        pages: d?.pageNumber ?? s.pages + 1,
        found: s.found + (d?.tweetsFound ?? 0),
      }))
    })
    source.addEventListener('processing', (e) => {
      const d = data<{ current?: number; total?: number; bookmark?: Bookmark }>(e)
      const thumb = thumbOf(d?.bookmark)
      setState((s) => ({
        ...s,
        processed: d?.current ?? s.processed + 1,
        total: d?.total ?? s.total,
        added: s.added + 1,
        thumbs: thumb ? [thumb, ...s.thumbs].slice(0, 12) : s.thumbs,
      }))
    })
    source.addEventListener('progress', (e) => {
      const d = data<{ total?: number; new?: number; duplicates?: number }>(e)
      if (!d) return
      setState((s) => ({
        ...s,
        total: d.total ?? s.total,
        processed: (d.new ?? 0) + (d.duplicates ?? 0) || s.processed,
        added: d.new ?? s.added,
      }))
    })
    source.addEventListener('duplicate', () => {
      setState((s) => ({ ...s, processed: s.processed + 1 }))
    })
    source.addEventListener('complete', (e) => {
      const d = data<{ stats?: { total?: number; new?: number } }>(e)
      setState((s) => ({
        ...s,
        status: 'done',
        total: d?.stats?.total ?? s.total,
        processed: d?.stats?.total ?? s.processed,
        added: d?.stats?.new ?? s.added,
      }))
      source.close()
    })
    source.addEventListener('error', (e) => {
      // A named `error` event carries a message; a bare one is the stream
      // closing (normal right after `complete`).
      const parsed = parseSyncErrorEvent(e)
      setState((s) =>
        s.status === 'done'
          ? s
          : { ...s, status: 'error', error: parsed.message, errorCode: parsed.code },
      )
      source.close()
    })
  }, [])

  return { ...state, start }
}
