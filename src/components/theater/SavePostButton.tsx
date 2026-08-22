'use client'

import { useEffect, useRef, useState } from 'react'
import { Bookmark, Check, Loader2 } from 'lucide-react'
import { sourceUrl } from '@/lib/activity/preview-path'
import { theaterItemKey, type TheaterItem, type TheaterPersonalChrome } from './types'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** Cross-mount cache of "is this post already in the viewer's collection?" */
const ownershipCache = new Map<string, boolean>()

export function SavePostButton({
  current,
  className,
  iconOnly,
}: {
  current: TheaterItem
  /** Full button class string — the caller owns the visual style. */
  className: string
  /** Mobile action row: icon + aria-label only. */
  iconOnly?: boolean
}) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const key = theaterItemKey(current)

  useEffect(() => {
    setStatus('idle')
  }, [key])

  useEffect(() => {
    if (!current.bookmarkId) return
    if (ownershipCache.has(key)) {
      if (ownershipCache.get(key)) setStatus('saved')
      return
    }
    let cancelled = false
    const q = new URLSearchParams({ hideArchived: 'false', filter: 'all', limit: '5' })
    q.append('id', current.bookmarkId)
    fetch(`/api/feed?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const owned = !!(d?.items ?? []).find(
          (f: { id: string; platform?: string }) =>
            (f.platform ?? 'twitter') === current.platform && f.id === current.bookmarkId,
        )
        ownershipCache.set(key, owned)
        if (!cancelled && owned) setStatus('saved')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [key, current.bookmarkId, current.platform])

  useEffect(() => {
    function handleSaved(e: Event) {
      const detail = (e as CustomEvent<{ key?: string }>).detail
      if (detail?.key === key) setStatus('saved')
    }
    window.addEventListener('theater-post-saved', handleSaved)
    return () => window.removeEventListener('theater-post-saved', handleSaved)
  }, [key])

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [],
  )

  const handleSave = async () => {
    if (status === 'saving' || status === 'saved' || !current.bookmarkId) return
    setStatus('saving')
    try {
      const url = sourceUrl(current.platform, current.author, current.bookmarkId)
      if (!url) throw new Error('No source URL for this post')
      const res = await fetch('/api/bookmarks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || data?.error) throw new Error(data?.error || 'Save failed')
      ownershipCache.set(key, true)
      setStatus('saved')
    } catch {
      setStatus('error')
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setStatus('idle'), 2000)
    }
  }

  const visibleLabel = status === 'saved' ? 'Saved' : status === 'error' ? 'Try again' : 'Save'
  const icon =
    status === 'saving' ? (
      <Loader2 size={iconOnly ? 16 : 14} className="animate-spin" />
    ) : status === 'saved' ? (
      <Check size={iconOnly ? 16 : 14} />
    ) : (
      <Bookmark size={iconOnly ? 16 : 14} />
    )

  return (
    <button
      type="button"
      onClick={() => void handleSave()}
      disabled={status === 'saving' || status === 'saved'}
      className={className}
      aria-label={iconOnly ? (status === 'saving' ? 'Saving' : visibleLabel) : undefined}
    >
      {icon}
      {!iconOnly && <span>{visibleLabel}</span>}
    </button>
  )
}

/**
 * Live-tab save for the personal theater. Uses `savedKeys` from the shell
 * rather than owning a fetch — once saved the button disappears so the Tag
 * icon beside it is both the affordance and the state.
 */
export function PersonalLiveSaveButton({
  current,
  collection,
  className,
  iconSize = 14,
  iconOnly,
}: {
  current: TheaterItem
  collection: TheaterPersonalChrome
  className: string
  iconSize?: number
  iconOnly?: boolean
}) {
  const saved = collection.savedKeys.has(theaterItemKey(current))
  if (saved) return null
  return (
    <button
      type="button"
      onClick={() => collection.onSave(current)}
      className={className}
      aria-label={iconOnly ? 'Save' : undefined}
    >
      <Bookmark size={iconSize} />
      {!iconOnly && <span>Save</span>}
    </button>
  )
}
