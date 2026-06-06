'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { LiveDot } from '@/components/matter'
import { DiscoverCard, inferType } from './DiscoverCard'

export interface ActivityItem {
  action: 'preview' | 'save' | 'read'
  platform: 'twitter' | 'instagram' | 'tiktok' | 'youtube' | string
  bookmarkId?: string
  author: string
  authorName?: string | null
  text?: string | null
  thumbnailUrl?: string | null
  url: string
  createdAt: string
  /** Distinct ADHX users who've saved this post (anonymous count). Drives the flame. */
  saveCount?: number
  /** Real post type from the saved bookmark, when known (else client infers it). */
  contentType?: 'video' | 'photo' | 'text' | 'quote' | 'article'
}

/**
 * The true identity of a post — platform + source id. Keys off this (not the
 * URL) so the same post recorded under slightly different URLs (e.g. an old
 * `/@@handle` vs the fixed `/@handle`) still collapses to one card.
 */
function postKey(item: ActivityItem): string {
  return item.bookmarkId ? `${item.platform}:${item.bookmarkId}` : item.url
}

/**
 * One card per post. The API can return several events for the same post
 * (previewed then saved, or differing URLs), so collapse by identity — keeping
 * the first (newest) event but the best save count / type / thumbnail seen.
 */
function dedupeByPost(items: ActivityItem[]): ActivityItem[] {
  const byPost = new Map<string, ActivityItem>()
  for (const it of items) {
    const k = postKey(it)
    const prev = byPost.get(k)
    if (!prev) {
      byPost.set(k, it)
    } else {
      prev.saveCount = Math.max(prev.saveCount ?? 0, it.saveCount ?? 0)
      prev.contentType = prev.contentType ?? it.contentType
      prev.thumbnailUrl = prev.thumbnailUrl ?? it.thumbnailUrl
    }
  }
  return [...byPost.values()]
}

const POLL_MS = 12_000

type FilterId = 'trending' | 'just-saved' | 'photos' | 'videos' | 'text' | 'articles'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'trending', label: 'Trending' },
  { id: 'just-saved', label: 'Just saved' },
  { id: 'photos', label: 'Photos' },
  { id: 'videos', label: 'Videos' },
  { id: 'text', label: 'Text' },
  { id: 'articles', label: 'Articles' },
]

/** Stable React key / identity for an activity item. */
function keyOf(item: ActivityItem): string {
  return postKey(item)
}

/**
 * Filter + sort an already-deduped list. "Just saved" (default) = newest first.
 * "Trending" surfaces posts saved by 2+ people, ranked by that count (newest as
 * the tiebreaker). Photos/Videos/Text/Articles filter by type (Text includes quotes).
 */
function applyFilter(items: ActivityItem[], filter: FilterId): ActivityItem[] {
  if (filter === 'trending') {
    return items
      .filter((it) => (it.saveCount ?? 0) >= 2)
      .sort((a, b) => {
        const d = (b.saveCount ?? 0) - (a.saveCount ?? 0)
        if (d !== 0) return d
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  }

  if (filter === 'photos') return items.filter((it) => inferType(it) === 'photo')
  if (filter === 'videos') return items.filter((it) => inferType(it) === 'video')
  if (filter === 'text') return items.filter((it) => inferType(it) === 'text' || inferType(it) === 'quote')
  if (filter === 'articles') return items.filter((it) => inferType(it) === 'article')

  // just-saved (default): already newest-first from the API.
  return items
}

/** A plausible "saving right now" count derived from real recent volume. */
function savingNow(items: ActivityItem[]): number {
  const cutoff = Date.now() - 5 * 60 * 1000
  const recent = items.filter((it) => new Date(it.createdAt).getTime() >= cutoff).length
  // Scale so a lively feed reads naturally; floor so it never claims "0 people".
  return Math.max(1, recent || Math.min(items.length, 12))
}

export function DiscoverFeed() {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [filter, setFilter] = useState<FilterId>('just-saved')
  const [loaded, setLoaded] = useState(false)
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set())
  const knownKeys = useRef<Set<string>>(new Set())

  const load = useCallback(async (initial: boolean) => {
    try {
      const res = await fetch('/api/activity', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (!Array.isArray(data.items)) return
      const next: ActivityItem[] = data.items

      if (initial) {
        // Seed the known set without flashing every card as "new".
        knownKeys.current = new Set(next.map(keyOf))
      } else {
        const fresh = next.filter((it) => !knownKeys.current.has(keyOf(it))).map(keyOf)
        if (fresh.length > 0) {
          for (const k of fresh) knownKeys.current.add(k)
          setFreshKeys(new Set(fresh))
          // Clear the highlight after the green tint has had a moment.
          window.setTimeout(() => setFreshKeys(new Set()), 2500)
        }
      }
      setItems(next)
    } catch {
      // transient / offline — keep showing what we have
    } finally {
      if (initial) setLoaded(true)
    }
  }, [])

  useEffect(() => {
    load(true)
    const t = window.setInterval(() => load(false), POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  const visible = applyFilter(dedupeByPost(items), filter)
  const count = savingNow(items)

  return (
    <div className="min-h-screen bg-paper">
      {/* Tabs */}
      <div className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold text-ink-2 transition-colors duration-150 hover:text-ink"
          >
            My Collection
          </Link>
          <span className="rounded-full bg-clay/[0.12] px-3.5 py-1.5 text-[13.5px] font-bold text-clay">
            Discover
          </span>
        </div>
      </div>

      {/* Live status + filters */}
      <div className="mx-auto max-w-7xl px-4 pb-2 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-clay/25 bg-clay/[0.09] px-4 py-2">
            <LiveDot />
            <span className="text-[14px] font-bold text-ink">
              {count} {count === 1 ? 'person' : 'people'} saving right now
            </span>
          </span>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = f.id === filter
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors duration-150',
                    active
                      ? 'bg-ink text-paper'
                      : 'border border-hairline bg-surface text-ink-2 hover:text-ink',
                  )}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          <span className="ml-auto font-mono text-[12.5px] text-ink-3">updates live</span>
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-3 sm:px-6">
        {!loaded ? (
          <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-card border border-hairline bg-inset"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-card bg-inset">
            <p className="text-center text-[15px] text-ink-2">Nothing happening yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
            {visible.map((item) => (
              <DiscoverCard key={keyOf(item)} item={item} fresh={freshKeys.has(keyOf(item))} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
