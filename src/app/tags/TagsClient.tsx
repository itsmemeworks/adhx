'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  Bookmark,
  Check,
  ExternalLink,
  Eye,
  Flame,
  Globe,
  Link as LinkIcon,
  Lock,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react'
import type { FeedItem, TagItem } from '@/components/feed/types'
import { CLIENT_EVENTS, notifyCollectionChanged } from '@/lib/client-events'
import { CollectionPosterCard, type PosterTile } from '@/components/tags'
import { cn } from '@/lib/utils'

/** Owner-level Discovery totals for the "This week" summary card (docs/specs/discovery-leaderboards.md §6). */
interface OwnerStats {
  viewCount: number
  cloneCount: number
  bestRank: number | null
}

const PREVIEW_LIMIT = 4

/**
 * `/tags` — a home for every tag playlist (unified-theater-collection.md §4):
 * count, public status, a content-mosaic "poster" card (Option C), and the
 * same make-public flow FilterBar's selected-tag toolbar uses (`FilterBar.tsx`
 * — PATCH `/api/tags` idempotent make-public, then copy the friendly
 * `/t/{username}/{tag}` URL).
 */
export function TagsClient() {
  const [tags, setTags] = useState<TagItem[] | null>(null)
  // Header search on /tags (icon → expand, placeholder "Tags") has no
  // collection to filter — it filters this tag list instead, via the
  // cross-component custom-event pattern in CLAUDE.md. Header dispatches
  // `tags-search` on every keystroke; we just listen.
  const [searchQuery, setSearchQuery] = useState('')
  const [ownerStats, setOwnerStats] = useState<OwnerStats | null>(null)
  const [busyTag, setBusyTag] = useState<string | null>(null)
  const [copiedTag, setCopiedTag] = useState<string | null>(null)
  const [copyHintTag, setCopyHintTag] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [previews, setPreviews] = useState<Record<string, FeedItem[]>>({})
  const [previewsLoading, setPreviewsLoading] = useState<Record<string, boolean>>({})
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadTags = useCallback(async () => {
    try {
      const r = await fetch('/api/tags')
      const d = r.ok ? await r.json() : null
      setTags(d?.tags ?? [])
      setOwnerStats(d?.stats ?? null)
    } catch {
      setTags((prev) => prev ?? [])
    }
  }, [])

  useEffect(() => {
    void loadTags()
  }, [loadTags])

  /**
   * Stay live while mounted. This page used to fetch once and subscribe to
   * nothing (state review, 2026-08-22), so tagging a post in the theater — or
   * cloning a playlist, which adds a whole tag — left these counts, and even
   * the presence of a brand-new tag, wrong until a reload. Every tag/collection
   * mutation in the app announces itself; listen for it.
   */
  useEffect(() => {
    const refresh = () => void loadTags()
    window.addEventListener(CLIENT_EVENTS.tagsChanged, refresh)
    window.addEventListener(CLIENT_EVENTS.feedChanged, refresh)
    return () => {
      window.removeEventListener(CLIENT_EVENTS.tagsChanged, refresh)
      window.removeEventListener(CLIENT_EVENTS.feedChanged, refresh)
    }
  }, [loadTags])

  // Fetch a small content preview per tag once the tag list is known. Keyed
  // off the set of tag names (not the `tags` array itself) so re-fetching
  // isn't triggered by unrelated state updates (isPublic/shareUrl toggles).
  const tagKey = (tags ?? []).map((t) => t.tag).join(' ')
  useEffect(() => {
    const tagNames = tagKey ? tagKey.split(' ') : []
    if (tagNames.length === 0) return
    let cancelled = false
    setPreviewsLoading(Object.fromEntries(tagNames.map((t) => [t, true])))
    tagNames.forEach((tag) => {
      fetch(
        `/api/feed?tag=${encodeURIComponent(tag)}&hideArchived=false&limit=${PREVIEW_LIMIT}&filter=all`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled) return
          setPreviews((prev) => ({ ...prev, [tag]: d?.items ?? [] }))
        })
        .catch(() => {
          if (cancelled) return
          setPreviews((prev) => ({ ...prev, [tag]: [] }))
        })
        .finally(() => {
          if (cancelled) return
          setPreviewsLoading((prev) => ({ ...prev, [tag]: false }))
        })
    })
    return () => {
      cancelled = true
    }
  }, [tagKey])

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
      if (copyHintTimeoutRef.current) clearTimeout(copyHintTimeoutRef.current)
    },
    [],
  )

  useEffect(() => {
    const handler = (e: Event) => setSearchQuery((e as CustomEvent<string>).detail ?? '')
    window.addEventListener('tags-search', handler)
    return () => window.removeEventListener('tags-search', handler)
  }, [])

  function flashCopied(tag: string) {
    setCopiedTag(tag)
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    copiedTimeoutRef.current = setTimeout(() => setCopiedTag(null), 2000)
  }

  function flashCopyHint(tag: string) {
    setCopyHintTag(tag)
    if (copyHintTimeoutRef.current) clearTimeout(copyHintTimeoutRef.current)
    copyHintTimeoutRef.current = setTimeout(() => setCopyHintTag(null), 4000)
  }

  function setError(tag: string, message: string) {
    setErrors((prev) => ({ ...prev, [tag]: message }))
  }

  function clearError(tag: string) {
    setErrors((prev) => {
      if (!(tag in prev)) return prev
      const next = { ...prev }
      delete next[tag]
      return next
    })
  }

  /**
   * Clipboard copy is attempted independently of the PATCH — success flashes
   * the "Copied" state on the card; a rejection (focus/permissions, common
   * outside a direct user gesture) still leaves the share URL rendered and
   * selectable, plus a non-blocking hint instead of silently doing nothing.
   */
  async function copyShareUrl(shareUrl: string, tag: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${shareUrl}`)
      flashCopied(tag)
    } catch {
      flashCopyHint(tag)
    }
  }

  /**
   * "Make public" — idempotent, always re-PATCHes rather than short-
   * circuiting on the current `isPublic`, same as
   * `FilterBar.handleShareAsTheater`, so the copied URL always comes from
   * the authoritative API response.
   *
   * The card's public state is updated as soon as the PATCH succeeds,
   * regardless of whether the clipboard copy that follows succeeds — and
   * any failure along the way (network error, non-OK response) surfaces as
   * a visible error on the card instead of a silent dead click.
   */
  async function handleMakePublic(tag: string) {
    setBusyTag(tag)
    clearError(tag)
    try {
      let res: Response
      try {
        res = await fetch('/api/tags', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag, isPublic: true }),
        })
      } catch {
        setError(tag, "Couldn't reach the server — try again.")
        return
      }
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.shareUrl) {
        setError(tag, data?.error || "Couldn't make this tag public — try again.")
        return
      }
      setTags((prev) =>
        (prev ?? []).map((t) =>
          t.tag === tag ? { ...t, isPublic: true, shareUrl: data.shareUrl } : t,
        ),
      )
      await copyShareUrl(data.shareUrl, tag)
    } finally {
      setBusyTag(null)
    }
  }

  async function handleMakePrivate(tag: string) {
    setBusyTag(tag)
    clearError(tag)
    try {
      let res: Response
      try {
        res = await fetch('/api/tags', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag, isPublic: false }),
        })
      } catch {
        setError(tag, "Couldn't reach the server — try again.")
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(tag, data?.error || "Couldn't update this tag — try again.")
        return
      }
      setTags((prev) => (prev ?? []).map((t) => (t.tag === tag ? { ...t, isPublic: false } : t)))
    } finally {
      setBusyTag(null)
    }
  }

  async function handleDelete(tag: string) {
    setBusyTag(tag)
    clearError(tag)
    try {
      let res: Response
      try {
        res = await fetch('/api/tags', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag }),
        })
      } catch {
        setError(tag, "Couldn't reach the server — try again.")
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(tag, data?.error || "Couldn't delete this tag — try again.")
        return
      }
      setTags((prev) => (prev ?? []).filter((t) => t.tag !== tag))
      notifyCollectionChanged({ tagsChanged: true, refetchFeed: false })
    } finally {
      setBusyTag(null)
    }
  }

  const trimmedQuery = searchQuery.trim().toLowerCase()
  const visibleTags = trimmedQuery
    ? (tags ?? []).filter((t) => t.tag.toLowerCase().includes(trimmedQuery))
    : (tags ?? [])

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-[920px] mx-auto px-4 sm:px-8 py-8 sm:py-10 flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-serif text-[30px] sm:text-[38px] font-semibold tracking-tight text-ink mb-1">
              Tags
            </h1>
            <p className="text-[15px] text-ink-2">
              Your playlists — share any of them as a looping theater
            </p>
          </div>

          {ownerStats && tags?.some((t) => t.isPublic) && (
            <div className="flex-none rounded-xl border border-hairline bg-surface px-4 py-2.5">
              <div className="font-mono text-[9.5px] uppercase tracking-wide text-ink-3">
                This week
              </div>
              <div className="mt-1 flex items-center gap-2 font-mono text-[12.5px] text-ink">
                <span className="flex items-center gap-1">
                  <Eye size={12} />
                  <span>{ownerStats.viewCount} views</span>
                </span>
                <span aria-hidden className="text-ink-3">
                  ·
                </span>
                <span className="flex items-center gap-1">
                  <Bookmark size={12} />
                  <span>{ownerStats.cloneCount} saves</span>
                </span>
                {ownerStats.bestRank != null && (
                  <>
                    <span aria-hidden className="text-ink-3">
                      ·
                    </span>
                    <span className="flex items-center gap-1 text-[#e88a5e]">
                      <Flame size={12} fill="currentColor" />
                      <span>best rank #{ownerStats.bestRank}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {tags === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[240px] rounded-[14px] bg-inset animate-pulse" />
            ))}
          </div>
        ) : tags.length === 0 ? (
          <div className="rounded-card border border-hairline bg-surface p-8 text-center">
            <TagIcon className="h-8 w-8 mx-auto mb-3 text-ink-3" />
            <p className="text-[14.5px] text-ink-2">
              No tags yet — tag a post in the theater, then manage it here.
            </p>
          </div>
        ) : visibleTags.length === 0 ? (
          <div className="rounded-card border border-hairline bg-surface p-8 text-center">
            <TagIcon className="h-8 w-8 mx-auto mb-3 text-ink-3" />
            <p className="text-[14.5px] text-ink-2">{`No tags match '${searchQuery}'`}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleTags.map((t) => (
              <TagPosterCard
                key={t.tag}
                tag={t}
                busy={busyTag === t.tag}
                copied={copiedTag === t.tag}
                copyHint={copyHintTag === t.tag}
                error={errors[t.tag]}
                previewItems={previews[t.tag]}
                previewLoading={previewsLoading[t.tag] ?? true}
                onMakePublic={() => handleMakePublic(t.tag)}
                onCopyUrl={() => t.shareUrl && copyShareUrl(t.shareUrl, t.tag)}
                onMakePrivate={() => handleMakePrivate(t.tag)}
                onDelete={() => handleDelete(t.tag)}
              />
            ))}
          </div>
        )}

        {ownerStats?.bestRank != null && (
          <LeaderboardCrossPromo bestRank={ownerStats.bestRank} tags={tags} />
        )}
      </div>
    </div>
  )
}

/** "#tag is #N on this week's leaderboard" cross-promo — only rendered when
 * the owner has at least one tag charting (see `ownerStats.bestRank`). */
function LeaderboardCrossPromo({ bestRank, tags }: { bestRank: number; tags: TagItem[] | null }) {
  const bestTag = tags?.find((t) => t.rank === bestRank)?.tag

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-hairline bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-clay-grad">
          <Flame size={18} className="text-white" fill="currentColor" />
        </div>
        <div>
          <p className="font-serif text-[15px] text-ink">
            {bestTag ? (
              <>
                #{bestTag} is #{bestRank} on this week&apos;s leaderboard
              </>
            ) : (
              <>You&apos;re #{bestRank} on this week&apos;s leaderboard</>
            )}
          </p>
          <p className="font-mono text-[11px] text-ink-3">sharing the link counts</p>
        </div>
      </div>
      <Link
        href="/leaderboard"
        className="inline-flex flex-none items-center rounded-full border border-hairline px-3.5 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink"
      >
        See the leaderboard →
      </Link>
    </div>
  )
}

/** Content-mosaic preview → poster tiles. Media posts show their thumbnail,
 * text posts fall back to a short excerpt (rendered by `PosterCard` itself). */
function toPosterTiles(items: FeedItem[] | undefined): PosterTile[] {
  if (!items) return []
  return items.map((item) => {
    const media = item.media?.[0]
    const isArticle = item.category === 'article'
    const thumbnailUrl = media?.thumbnailUrl || (isArticle ? item.articlePreview?.imageUrl : null)
    return { thumbnailUrl, text: item.text }
  })
}

/**
 * Visibility control in the action row under the mosaic — both the state
 * indicator AND the toggle (owner review: "what's the point in having Make
 * Public in a different place from Make Private?"). Public shows Globe + a
 * live-dot; private shows Lock. Same surface-pill recipe as copy/open.
 */
function VisibilityToggle({
  isPublic,
  busy,
  onMakePublic,
  onMakePrivate,
}: {
  isPublic: boolean
  busy: boolean
  onMakePublic: () => void
  onMakePrivate: () => void
}) {
  const toggle = isPublic
    ? { label: 'Public', aria: 'Make private', action: onMakePrivate, Icon: Globe }
    : { label: 'Private', aria: 'Make public', action: onMakePublic, Icon: Lock }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        toggle.action()
      }}
      disabled={busy}
      aria-label={toggle.aria}
      title={toggle.aria}
      className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-inset px-2.5 py-1 text-[10.5px] font-semibold text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-60"
    >
      {isPublic && <span className="h-1.5 w-1.5 flex-none rounded-full bg-live" aria-hidden />}
      <toggle.Icon size={11} />
      <span>{toggle.label}</span>
    </button>
  )
}

const ACTION_ICON =
  'flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-ink-2 transition-colors hover:bg-inset hover:text-ink'

function TagPosterCard({
  tag,
  busy,
  copied,
  copyHint,
  error,
  previewItems,
  previewLoading,
  onMakePublic,
  onCopyUrl,
  onMakePrivate,
  onDelete,
}: {
  tag: TagItem
  busy: boolean
  copied: boolean
  copyHint: boolean
  error?: string
  previewItems?: FeedItem[]
  previewLoading: boolean
  onMakePublic: () => void
  onCopyUrl: () => void
  onMakePrivate: () => void
  onDelete: () => void
}) {
  const tiles = toPosterTiles(previewItems)
  const tilesLoading = previewLoading && previewItems === undefined

  return (
    <div className="flex flex-col gap-2">
      <CollectionPosterCard
        tag={tag.tag}
        count={tag.count}
        tiles={tiles}
        tilesLoading={tilesLoading}
        href={`/library?tag=${encodeURIComponent(tag.tag)}`}
        badge={
          <VisibilityToggle
            isPublic={!!tag.isPublic}
            busy={busy}
            onMakePublic={onMakePublic}
            onMakePrivate={onMakePrivate}
          />
        }
        rank={tag.isPublic ? (tag.rank ?? null) : null}
        stats={
          tag.isPublic
            ? { viewCount: tag.viewCount ?? 0, cloneCount: tag.cloneCount ?? 0, rank: null }
            : null
        }
      >
        {tag.isPublic && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCopyUrl()
              }}
              title="Copy link"
              aria-label="Copy link"
              className={ACTION_ICON}
            >
              {copied ? <Check size={14} className="text-done" /> : <LinkIcon size={14} />}
            </button>
            {tag.shareUrl && (
              <a
                href={tag.shareUrl}
                title="Open"
                aria-label="Open"
                onClick={(e) => e.stopPropagation()}
                className={ACTION_ICON}
              >
                <ExternalLink size={14} />
              </a>
            )}
          </>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          disabled={busy}
          title="Delete tag"
          aria-label={`Delete #${tag.tag}`}
          className={cn(
            ACTION_ICON,
            'hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-600 disabled:opacity-60 dark:hover:text-red-400',
          )}
        >
          <Trash2 size={14} />
        </button>
      </CollectionPosterCard>

      {copyHint && (
        <p className="text-[11.5px] text-ink-3">
          Couldn&apos;t copy automatically — the link above is ready to select.
        </p>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-[12px] text-red-600 dark:text-red-400">
          <AlertCircle size={12} className="flex-none" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
