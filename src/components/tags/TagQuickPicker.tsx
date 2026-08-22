'use client'

import { useEffect, useRef, useState } from 'react'
import { notifyTagsChanged } from '@/lib/client-events'
import { Check, Loader2, Plus, Tag as TagIcon, X } from 'lucide-react'
import { kebabTagInput, sanitizeTag } from '@/lib/utils/tag'
import type { TagItem } from '@/components/feed/types'

export interface TagQuickPickerProps {
  platform: string
  bookmarkId: string
  open: boolean
  onClose: () => void
}

// This surface is ALWAYS dark (the theater is always dark, regardless of the
// site's light/dark theme) — hardcoded like SignInModal.tsx rather than
// pulling from the Matter tokens, which flip with the `light`/`dark` class.
const INK = '#f3ece0'
const MUTED = '#857a69'
const SUBTLE = '#b8ac99'
const PANEL = '#201b16'
const BORDER = '#322b23'
const ACCENT = '#d26b40'
const ERROR = '#e08a6a'

// Keys the theater's window-level keydown handler acts on — blocked from
// bubbling past the popover while it's open, mirroring SignInModal.tsx.
const THEATER_SHORTCUT_KEYS = new Set([
  ' ',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'm',
  'M',
  'j',
  'J',
  'k',
  'K',
])

/**
 * Shared dark popover for tagging a single post — used by the collection
 * theater's `Tag` action (unified-theater-collection.md §4). Self-contained: it
 * fetches the user's tags (`/api/tags`) and this post's current tags
 * (`/api/feed?id=&platform=`, the only endpoint that returns a bookmark's
 * tags outside a full feed page) on open, then toggles membership via
 * `/api/bookmarks/[id]/tags` with optimistic checkbox state.
 */
export function TagQuickPicker({
  platform,
  bookmarkId,
  open,
  onClose,
}: TagQuickPickerProps): React.ReactElement | null {
  const [tags, setTags] = useState<TagItem[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [newTagValue, setNewTagValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setNewTagValue('')
    setLoading(true)
    let cancelled = false

    async function load() {
      try {
        const [tagsRes, feedRes] = await Promise.all([
          fetch('/api/tags'),
          fetch(
            `/api/feed?id=${encodeURIComponent(bookmarkId)}&platform=${encodeURIComponent(platform)}`,
          ),
        ])
        const tagsData = await tagsRes.json().catch(() => ({ tags: [] as TagItem[] }))
        const feedData = await feedRes.json().catch(() => ({ items: [] as { tags?: string[] }[] }))
        if (cancelled) return
        setTags(tagsData.tags ?? [])
        const currentTags: string[] = feedData.items?.[0]?.tags ?? []
        setChecked(new Set(currentTags))
      } catch {
        if (!cancelled) setError('Failed to load tags')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [open, bookmarkId, platform])

  // Capture-phase Escape + theater-shortcut suppression (SignInModal pattern)
  // so ↓/↑/space/m/j/k don't drive the background stage while this is open.
  useEffect(() => {
    if (!open) return
    function handleKeyDownCapture(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        onClose()
        return
      }
      const target = e.target as HTMLElement | null
      const tagName = target?.tagName
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable) return
      if (THEATER_SHORTCUT_KEYS.has(e.key)) {
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', handleKeyDownCapture, true)
    return () => window.removeEventListener('keydown', handleKeyDownCapture, true)
  }, [open, onClose])

  if (!open) return null

  async function toggleTag(tag: string): Promise<void> {
    const wasChecked = checked.has(tag)
    const nextChecked = new Set(checked)
    if (wasChecked) nextChecked.delete(tag)
    else nextChecked.add(tag)
    setError(null)
    setChecked(nextChecked)
    try {
      const res = await fetch(
        `/api/bookmarks/${encodeURIComponent(bookmarkId)}/tags?platform=${encodeURIComponent(platform)}`,
        {
          method: wasChecked ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag }),
        },
      )
      if (!res.ok) throw new Error(`tag toggle failed: ${res.status}`)
      if (!wasChecked) {
        // Newly-created tag (not yet in the /api/tags list) — add it locally
        // with count 1 so it shows up without a refetch.
        setTags((prev) =>
          prev.some((t) => t.tag === tag)
            ? prev.map((t) => (t.tag === tag ? { ...t, count: t.count + 1 } : t))
            : [...prev, { tag, count: 1 }],
        )
      }
      // Announce the post's full updated tag list (unified-theater-collection.md
      // §4/§B) so any open collection queue can patch its snapshot without a
      // refetch — see TheaterShell's `bookmark-tags-changed` listener.
      notifyTagsChanged({ platform, bookmarkId, tags: Array.from(nextChecked) })
    } catch {
      // Revert on failure.
      setChecked((prev) => {
        const next = new Set(prev)
        if (wasChecked) next.add(tag)
        else next.delete(tag)
        return next
      })
      setError('Failed to update tag')
    }
  }

  function handleCreateTag(e: React.FormEvent): void {
    e.preventDefault()
    const clean = sanitizeTag(newTagValue)
    if (!clean) {
      setError('Invalid tag')
      return
    }
    setNewTagValue('')
    if (!checked.has(clean)) void toggleTag(clean)
  }

  const sanitizedPreview = sanitizeTag(newTagValue)
  const showPreview =
    newTagValue.trim() !== '' && sanitizedPreview !== newTagValue.trim().toLowerCase()

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(8,7,10,.72)', backdropFilter: 'blur(8px)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tag this post"
        className="w-full max-w-[320px] rounded-2xl border p-5 shadow-2xl"
        style={{ backgroundColor: PANEL, borderColor: BORDER }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2
            className="flex items-center gap-1.5 text-[15px] font-semibold"
            style={{ color: INK }}
          >
            <TagIcon size={15} style={{ color: SUBTLE }} />
            <span>Tags</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ color: SUBTLE }}
            className="transition-opacity hover:opacity-70"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: SUBTLE }} />
          </div>
        ) : (
          <div className="-mx-1 max-h-[240px] overflow-y-auto">
            {tags.length === 0 && (
              <p className="px-1 py-2 text-[13px]" style={{ color: MUTED }}>
                No tags yet — create one below.
              </p>
            )}
            {tags.map((t) => {
              const isChecked = checked.has(t.tag)
              return (
                <button
                  key={t.tag}
                  type="button"
                  onClick={() => void toggleTag(t.tag)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/5"
                >
                  <span
                    className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border-2"
                    style={{
                      borderColor: isChecked ? ACCENT : BORDER,
                      backgroundColor: isChecked ? ACCENT : 'transparent',
                    }}
                    aria-hidden
                  >
                    {isChecked && <Check size={12} className="text-white" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ color: INK }}>
                    #{t.tag}
                  </span>
                  <span className="flex-none text-[11.5px]" style={{ color: MUTED }}>
                    {t.count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <form
          onSubmit={handleCreateTag}
          className="mt-3 flex items-center gap-2 border-t pt-3"
          style={{ borderColor: BORDER }}
        >
          <Plus size={14} style={{ color: SUBTLE }} className="flex-none" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={newTagValue}
            onChange={(e) => {
              setNewTagValue(kebabTagInput(e.target.value))
              setError(null)
            }}
            placeholder="New tag"
            aria-label="New tag name"
            maxLength={15}
            className="min-w-0 flex-1 bg-transparent text-base outline-none sm:text-[13.5px]"
            style={{ color: INK, caretColor: INK }}
          />
          {newTagValue.trim() && (
            <button
              type="submit"
              className="flex-none min-h-[44px] px-1 text-[12.5px] font-semibold"
              style={{ color: ACCENT }}
            >
              Add
            </button>
          )}
        </form>
        {showPreview && sanitizedPreview && (
          <p className="mt-1 text-[11.5px]" style={{ color: MUTED }}>
            → #{sanitizedPreview}
          </p>
        )}
        {error && (
          <p className="mt-1 text-[11.5px]" style={{ color: ERROR }}>
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
