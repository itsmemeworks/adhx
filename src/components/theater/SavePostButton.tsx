'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bookmark, Check, Loader2, Tag as TagIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sourceUrl } from '@/lib/activity/preview-path'
import { tagActionLabel } from '@/lib/utils/tag'
import { theaterItemKey, type TheaterItem, type TheaterPersonalChrome } from './types'
import { StageGlass } from './StageGlass'
import { TheaterTagCount } from './TheaterTagCount'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'tag' | 'error'

/** How long the "Saved" confirmation holds before the pill becomes Tag. */
export const SAVE_TO_TAG_MS = 1_050

/** Cross-mount cache of "is this post already in the viewer's collection?" */
const ownershipCache = new Map<string, boolean>()

/** Test-only: drop cached ownership so cases can share a post id. */
export function resetSavePostOwnershipCache(): void {
  ownershipCache.clear()
}

export function SavePostButton({
  current,
  className,
  iconOnly,
  onTag,
  tags,
}: {
  current: TheaterItem
  /** Full button class string — the caller owns the visual style. */
  className: string
  /** Mobile action row: icon + aria-label only. */
  iconOnly?: boolean
  /**
   * After a just-now save (autosave or tap), the pill morphs Save → Saved →
   * Tag. Already-owned posts skip the celebration and land on Tag. Without
   * this callback the button stays on Saved (the old dead-end).
   */
  onTag?: () => void
  /** Current tags on this post — fills the Tag icon and shows a count (max 5). */
  tags?: string[]
}) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const celebratingRef = useRef(false)
  const key = theaterItemKey(current)

  useEffect(() => {
    setStatus('idle')
    celebratingRef.current = false
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [key])

  useEffect(() => {
    if (!current.bookmarkId) return
    if (ownershipCache.has(key)) {
      if (ownershipCache.get(key) && !celebratingRef.current) {
        setStatus(onTag ? 'tag' : 'saved')
      }
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
        if (!cancelled && owned && !celebratingRef.current) {
          setStatus(onTag ? 'tag' : 'saved')
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [key, current.bookmarkId, current.platform, onTag])

  const onTagRef = useRef(onTag)
  onTagRef.current = onTag

  const landOnSaved = useCallback(() => {
    celebratingRef.current = true
    ownershipCache.set(key, true)
    setStatus('saved')
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (!onTagRef.current) return
    timeoutRef.current = setTimeout(() => {
      celebratingRef.current = false
      setStatus('tag')
      timeoutRef.current = null
    }, SAVE_TO_TAG_MS)
  }, [key])

  useEffect(() => {
    function handleSaved(e: Event) {
      const detail = (e as CustomEvent<{ key?: string }>).detail
      if (detail?.key === key) landOnSaved()
    }
    window.addEventListener('theater-post-saved', handleSaved)
    return () => window.removeEventListener('theater-post-saved', handleSaved)
  }, [key, landOnSaved])

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [],
  )

  const handleSave = async () => {
    if (status === 'saving' || status === 'saved' || status === 'tag' || !current.bookmarkId) return
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
      landOnSaved()
    } catch {
      setStatus('error')
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setStatus('idle'), 2000)
    }
  }

  const tagCount = tags?.length ?? 0
  const tagLabel = tagActionLabel(tagCount)
  const hotkeyAction =
    status === 'tag' ? 'tag' : status === 'idle' || status === 'error' ? 'save' : undefined
  const visibleLabel =
    status === 'saved'
      ? 'Saved'
      : status === 'tag'
        ? 'Tag'
        : status === 'error'
          ? 'Try again'
          : 'Save'
  const iconSize = iconOnly ? 16 : 14
  const icon =
    status === 'saving' ? (
      <Loader2 size={iconSize} className="animate-spin" />
    ) : status === 'saved' ? (
      <Check size={iconSize} className="text-done" />
    ) : status === 'tag' ? (
      <TagIcon
        size={iconSize}
        className={tagCount > 0 ? 'text-clay' : undefined}
        fill={tagCount > 0 ? 'currentColor' : 'none'}
      />
    ) : (
      <Bookmark size={iconSize} />
    )

  return (
    <StageGlass
      as="button"
      type="button"
      onClick={() => {
        if (status === 'tag') {
          onTag?.()
          return
        }
        void handleSave()
      }}
      disabled={status === 'saving' || status === 'saved'}
      className={cn(
        className,
        // Tag is a glass action like Share — clay lives on the icon only.
        // `border-clay/50` is a no-op (hex CSS vars drop Tailwind /NN) and
        // tw-merge would steal the white glass border if we left it here.
        status === 'tag' && 'border-white/25',
        status === 'saved' && 'animate-save-pop',
        status === 'tag' && iconOnly && 'relative',
      )}
      aria-label={
        iconOnly
          ? status === 'saving'
            ? 'Saving'
            : status === 'tag'
              ? tagLabel
              : visibleLabel
          : status === 'tag'
            ? tagLabel === 'Tag'
              ? 'Tag this post'
              : tagLabel
            : undefined
      }
      data-theater-action={hotkeyAction}
    >
      <span
        key={status}
        className={cn('inline-flex items-center gap-1.5', status === 'tag' && 'animate-tag-in')}
      >
        {icon}
        {!iconOnly && <span>{visibleLabel}</span>}
        {status === 'tag' && !iconOnly && <TheaterTagCount count={tagCount} />}
      </span>
      {status === 'tag' && iconOnly && <TheaterTagCount count={tagCount} variant="badge" />}
      {status === 'saved' && (
        <span className="sr-only" aria-live="polite">
          Added to Saved
        </span>
      )}
    </StageGlass>
  )
}

/**
 * Live-tab save for the personal theater. Uses `savedKeys` from the shell
 * rather than owning a fetch — once saved the button collapses out so the
 * Tag icon beside it is both the affordance and the state.
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
  const [exiting, setExiting] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    if (!saved) {
      setExiting(false)
      setGone(false)
      return
    }
    setExiting(true)
    const timer = window.setTimeout(() => setGone(true), 280)
    return () => window.clearTimeout(timer)
  }, [saved])

  if (gone) return null
  return (
    <StageGlass
      as="button"
      type="button"
      onClick={() => collection.onSave(current)}
      className={cn(
        className,
        'overflow-hidden',
        exiting && 'animate-save-slot-out pointer-events-none',
      )}
      aria-label={iconOnly ? 'Save' : undefined}
      tabIndex={exiting ? -1 : undefined}
      data-theater-action={exiting ? undefined : 'save'}
    >
      <Bookmark size={iconSize} />
      {!iconOnly && <span>Save</span>}
    </StageGlass>
  )
}
