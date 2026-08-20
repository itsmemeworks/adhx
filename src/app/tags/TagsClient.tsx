'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, ExternalLink, Lock, Repeat, Tag as TagIcon } from 'lucide-react'
import type { TagItem } from '@/components/feed/types'
import { cn } from '@/lib/utils'

/**
 * `/tags` — a home for every tag collection (unified-theater-triage.md §4):
 * count, public status, and the same "Share as theater" flow FilterBar's
 * selected-tag toolbar uses (`FilterBar.tsx` — PATCH `/api/tags` idempotent
 * make-public, then copy the friendly `/t/{username}/{tag}` URL).
 */
export function TagsClient() {
  const [tags, setTags] = useState<TagItem[] | null>(null)
  const [busyTag, setBusyTag] = useState<string | null>(null)
  const [copiedTag, setCopiedTag] = useState<string | null>(null)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/tags')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setTags(d?.tags ?? []))
      .catch(() => !cancelled && setTags([]))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    },
    [],
  )

  function flashCopied(tag: string) {
    setCopiedTag(tag)
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    copiedTimeoutRef.current = setTimeout(() => setCopiedTag(null), 2000)
  }

  async function copyShareUrl(shareUrl: string, tag: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${shareUrl}`)
      flashCopied(tag)
    } catch {
      // Clipboard denial has nothing actionable to show beyond the button itself.
    }
  }

  /**
   * Idempotent — always re-PATCHes rather than short-circuiting on the
   * current `isPublic`, same as `FilterBar.handleShareAsTheater`, so the
   * copied URL always comes from the authoritative API response.
   */
  async function handleShareAsTheater(tag: string) {
    setBusyTag(tag)
    try {
      const res = await fetch('/api/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, isPublic: true }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.shareUrl) return
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
    try {
      const res = await fetch('/api/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, isPublic: false }),
      })
      if (!res.ok) return
      setTags((prev) => (prev ?? []).map((t) => (t.tag === tag ? { ...t, isPublic: false } : t)))
    } finally {
      setBusyTag(null)
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-[920px] mx-auto px-4 sm:px-8 py-8 sm:py-10 flex flex-col gap-6">
        <div>
          <h1 className="font-serif text-[30px] sm:text-[38px] font-semibold tracking-tight text-ink mb-1">
            Tags
          </h1>
          <p className="text-[15px] text-ink-2">
            Your collections — share any of them as a looping theater
          </p>
        </div>

        {tags === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[164px] rounded-card bg-inset animate-pulse" />
            ))}
          </div>
        ) : tags.length === 0 ? (
          <div className="rounded-card border border-hairline bg-surface p-8 text-center">
            <TagIcon className="h-8 w-8 mx-auto mb-3 text-ink-3" />
            <p className="text-[14.5px] text-ink-2">
              No tags yet — create one from the Collection filter bar.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tags.map((t) => (
              <TagCard
                key={t.tag}
                tag={t}
                busy={busyTag === t.tag}
                copied={copiedTag === t.tag}
                onShareAsTheater={() => handleShareAsTheater(t.tag)}
                onCopyUrl={() => t.shareUrl && copyShareUrl(t.shareUrl, t.tag)}
                onMakePrivate={() => handleMakePrivate(t.tag)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TagCard({
  tag,
  busy,
  copied,
  onShareAsTheater,
  onCopyUrl,
  onMakePrivate,
}: {
  tag: TagItem
  busy: boolean
  copied: boolean
  onShareAsTheater: () => void
  onCopyUrl: () => void
  onMakePrivate: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-hairline bg-surface p-5 shadow-m-sm">
      <div className="flex items-center gap-2">
        <TagIcon size={15} className="flex-none text-clay" />
        <span className="min-w-0 truncate text-[16px] font-bold text-ink">#{tag.tag}</span>
        {tag.isPublic && (
          <span className="flex-none rounded-full bg-done/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-done">
            Public
          </span>
        )}
      </div>

      <span className="font-mono text-[12.5px] text-ink-3">
        {tag.count} post{tag.count === 1 ? '' : 's'}
      </span>

      {tag.isPublic && tag.shareUrl && (
        <button
          type="button"
          onClick={onCopyUrl}
          title="Copy link"
          className="flex items-center gap-1.5 rounded-lg bg-inset px-2.5 py-1.5 text-left font-mono text-[11.5px] text-ink-2 transition-colors hover:text-ink"
        >
          {copied ? (
            <Check size={12} className="flex-none text-done" />
          ) : (
            <Copy size={12} className="flex-none" />
          )}
          <span className="truncate">adhx.com{tag.shareUrl}</span>
        </button>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Link
          href={`/?tag=${encodeURIComponent(tag.tag)}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
        >
          View
        </Link>
        <button
          type="button"
          onClick={onShareAsTheater}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full bg-clay-grad px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Repeat size={12} />
          Share as theater
        </button>
        {tag.isPublic && tag.shareUrl && (
          <a
            href={tag.shareUrl}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-3 transition-colors hover:text-ink"
          >
            Open
            <ExternalLink size={11} />
          </a>
        )}
        {tag.isPublic && (
          <button
            type="button"
            onClick={onMakePrivate}
            disabled={busy}
            className={cn(
              'ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-3 transition-colors hover:text-ink disabled:opacity-60',
            )}
          >
            <Lock size={11} />
            Make private
          </button>
        )}
      </div>
    </div>
  )
}
