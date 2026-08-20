'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  EyeOff,
  ChevronDown,
  SlidersHorizontal,
  LayoutGrid,
  List as ListIcon,
  LayoutDashboard,
  Tag as TagIcon,
  Repeat,
  Check,
  X,
  Plus,
  ListChecks,
} from 'lucide-react'
import {
  FILTER_OPTIONS,
  PLATFORM_OPTIONS,
  type FilterType,
  type SortType,
  type SortDirection,
  type TagItem,
  type PlatformFilter,
} from './types'
import type { FeedView } from './FeedGrid'
import { PlatformGlyph } from '@/components/matter'
import { cn } from '@/lib/utils'
import { sanitizeTag } from '@/lib/utils/tag'

interface FilterBarProps {
  filter: FilterType
  onFilterChange: (filter: FilterType) => void
  platform?: PlatformFilter
  onPlatformChange?: (platform: PlatformFilter) => void
  sort: SortType
  onSortChange: (sort: SortType) => void
  sortDirection: SortDirection
  onSortDirectionChange: (dir: SortDirection) => void
  unreadOnly: boolean
  onUnreadOnlyChange: (unreadOnly: boolean) => void
  view?: FeedView
  onViewChange?: (view: FeedView) => void
  // Tagging is removed in the Matter redesign. These props are retained so
  // existing callers (page.tsx) continue to compile, but they are not used.
  selectedTags?: string[]
  onSelectedTagsChange?: (tags: string[]) => void
  availableTags?: TagItem[]
  stats: { total: number; unread: number }
  onTagUpdated?: (tag: string, isPublic: boolean, shareUrl: string) => void
  // Tags: create + fill (unified-theater-triage §4). `tagSelect` is the tag
  // currently in grid "Add posts" selection mode (null when inactive).
  tagSelect?: string | null
  onTagSelectChange?: (tag: string | null) => void
}

// All four platforms render through the app's own PlatformGlyph — lucide v1
// removed its brand icons (Instagram/Youtube), and the in-house glyphs match
// the rest of the UI anyway.
function PlatformIcon({ value, className }: { value: PlatformFilter; className?: string }) {
  if (value === 'twitter') return <PlatformGlyph platform="x" className={className} />
  if (value === 'instagram') return <PlatformGlyph platform="instagram" className={className} />
  if (value === 'tiktok') return <PlatformGlyph platform="tiktok" className={className} />
  if (value === 'youtube') return <PlatformGlyph platform="youtube" className={className} />
  return null
}

/**
 * A dropdown menu rendered in a portal on `document.body`, anchored under its
 * trigger button. The filter row is `overflow-x-auto` (so the pills scroll on
 * mobile), which clips an `absolute` dropdown — the portal escapes that, and
 * `fixed` positioning from the trigger's rect keeps it aligned. Right-edge
 * aligned, clamped to the viewport.
 */
function AnchoredMenu({
  open,
  onClose,
  anchorRef,
  width,
  children,
}: {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
  width: number
  children: React.ReactNode
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const place = () => {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
      setPos({ top: r.bottom + 6, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef, width])

  if (!open || typeof document === 'undefined' || !pos) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[200]" onClick={onClose} />
      <div
        className="fixed z-[201] bg-surface rounded-card shadow-m-sm border border-hairline py-2"
        style={{ top: pos.top, left: pos.left, width }}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}

export function FilterBar({
  filter,
  onFilterChange,
  platform = 'all',
  onPlatformChange,
  sort,
  onSortChange,
  sortDirection,
  onSortDirectionChange,
  unreadOnly,
  onUnreadOnlyChange,
  view = 'grid',
  onViewChange,
  selectedTags = [],
  onSelectedTagsChange,
  availableTags = [],
  stats,
  onTagUpdated,
  tagSelect = null,
  onTagSelectChange,
}: FilterBarProps): React.ReactElement {
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [showTagsDropdown, setShowTagsDropdown] = useState(false)
  const [showNewTagForm, setShowNewTagForm] = useState(false)
  const [newTagValue, setNewTagValue] = useState('')
  const [sharing, setSharing] = useState(false)
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const platformBtnRef = useRef<HTMLButtonElement>(null)
  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const tagsBtnRef = useRef<HTMLButtonElement>(null)
  const newTagInputRef = useRef<HTMLInputElement>(null)
  const currentPlatform = PLATFORM_OPTIONS.find((o) => o.value === platform) || PLATFORM_OPTIONS[0]
  const selectedTag = selectedTags[0]
  const selectedTagInfo = selectedTag ? availableTags.find((t) => t.tag === selectedTag) : undefined
  const newTagPreview = sanitizeTag(newTagValue)

  useEffect(
    () => () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    },
    [],
  )

  // Exit "Add posts" selection mode on Escape, wherever focus is — the grid
  // itself has no callback wired (FilterBar owns onTagSelectChange), so this
  // is the one place Esc-to-finish is implemented.
  useEffect(() => {
    if (!tagSelect || !onTagSelectChange) return
    const exitSelect = onTagSelectChange
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') exitSelect(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tagSelect, onTagSelectChange])

  useEffect(() => {
    if (showNewTagForm) newTagInputRef.current?.focus()
  }, [showNewTagForm])

  /**
   * "+ New tag": a tag exists once one post carries it, so there's no create
   * endpoint — Enter just selects it as the active filter AND flips on grid
   * "Add posts" selection mode so the user can start tagging immediately.
   */
  function handleCreateTag(e: React.FormEvent) {
    e.preventDefault()
    const tag = sanitizeTag(newTagValue)
    if (!tag) return
    onSelectedTagsChange?.([tag])
    onTagSelectChange?.(tag)
    setShowNewTagForm(false)
    setNewTagValue('')
    setShowTagsDropdown(false)
  }

  /**
   * "Share as theater": marks the tag public (idempotent — safe to call even
   * when it's already public) via the existing `/api/tags` PATCH flow, then
   * copies the friendly `/t/{username}/{tag}` URL the response returns.
   * Always re-PATCHes rather than short-circuiting on `isPublic` so the copy
   * URL comes straight from the authoritative API response instead of being
   * reconstructed client-side.
   */
  async function handleShareAsTheater(tag: string) {
    setSharing(true)
    try {
      const res = await fetch('/api/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, isPublic: true }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.shareUrl) return
      onTagUpdated?.(tag, true, data.shareUrl)
      const fullUrl = `${window.location.origin}${data.shareUrl}`
      await navigator.clipboard.writeText(fullUrl)
      setCopiedLabel(fullUrl.replace(/^https?:\/\//, ''))
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
      copiedTimeoutRef.current = setTimeout(() => setCopiedLabel(null), 4000)
    } catch {
      // Best-effort — a network/clipboard hiccup here isn't worth surfacing
      // as an error state; the button stays clickable to retry.
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="sticky top-0 z-30 bg-paper/95 backdrop-blur-sm border-b border-hairline">
      <div className="flex items-center gap-2 px-4 sm:px-[26px] py-3 overflow-x-auto scrollbar-hide">
        {/* Type filter pills */}
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onFilterChange(opt.value)}
              className={cn(
                'flex-shrink-0 px-3.5 py-[7px] rounded-full text-[13.5px] font-semibold whitespace-nowrap transition-all duration-150',
                active
                  ? 'bg-clay-grad text-white shadow-glow'
                  : 'bg-surface border border-hairline text-ink-2 hover:text-ink',
              )}
            >
              {opt.label}
            </button>
          )
        })}

        {/* Spacer */}
        <div className="flex-1 min-w-2" />

        {/* Grid / List / Bento view switcher */}
        {onViewChange && (
          <div className="flex-shrink-0 flex items-center gap-0.5 p-[3px] rounded-[10px] bg-inset">
            {(
              [
                ['grid', LayoutGrid, 'Grid'],
                ['list', ListIcon, 'List'],
                ['bento', LayoutDashboard, 'Bento'],
              ] as const
            ).map(([id, Ico, label]) => (
              <button
                key={id}
                onClick={() => onViewChange(id)}
                aria-label={`${label} view`}
                aria-pressed={view === id}
                className={cn(
                  'w-[34px] h-8 rounded-lg flex items-center justify-center transition-colors duration-150',
                  view === id ? 'bg-surface text-clay shadow-m-xs' : 'text-ink-3 hover:text-ink-2',
                )}
              >
                <Ico className="w-[17px] h-[17px]" />
              </button>
            ))}
          </div>
        )}

        {/* Platform dropdown pill */}
        {onPlatformChange && (
          <div className="flex-shrink-0">
            <button
              ref={platformBtnRef}
              onClick={() => setShowPlatformDropdown((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[13.5px] font-semibold whitespace-nowrap transition-all duration-150',
                platform !== 'all'
                  ? 'bg-clay-grad text-white shadow-glow'
                  : 'bg-surface border border-hairline text-ink-2 hover:text-ink',
              )}
              title="Filter by platform"
            >
              {platform !== 'all' ? (
                <PlatformIcon value={platform} className="w-3.5 h-3.5" />
              ) : (
                <PlatformGlyph platform="x" size={12} className="text-ink-3" />
              )}
              <span className="max-w-[110px] truncate">{currentPlatform.label}</span>
              <ChevronDown
                className={cn('w-3.5 h-3.5', platform !== 'all' ? 'text-white' : 'text-ink-3')}
              />
            </button>

            <AnchoredMenu
              open={showPlatformDropdown}
              onClose={() => setShowPlatformDropdown(false)}
              anchorRef={platformBtnRef}
              width={192}
            >
              {PLATFORM_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    onPlatformChange(opt.value)
                    setShowPlatformDropdown(false)
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                    platform === opt.value ? 'text-clay font-medium' : 'text-ink-2 hover:bg-inset',
                  )}
                >
                  <PlatformIcon value={opt.value} className="w-4 h-4 flex-shrink-0" />
                  <span>{opt.label}</span>
                </button>
              ))}
            </AnchoredMenu>
          </div>
        )}

        {/* Tags dropdown pill — selecting a tag drives the selected-tag
            toolbar below (count + Public chip + Share as theater). Stays
            visible with zero tags when tag-creation (onTagSelectChange) is
            wired, so the first tag can be created from an empty state. */}
        {onSelectedTagsChange && (availableTags.length > 0 || onTagSelectChange) && (
          <div className="flex-shrink-0">
            <button
              ref={tagsBtnRef}
              onClick={() => setShowTagsDropdown((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[13.5px] font-semibold whitespace-nowrap transition-all duration-150',
                selectedTag
                  ? 'bg-clay-grad text-white shadow-glow'
                  : 'bg-surface border border-hairline text-ink-2 hover:text-ink',
              )}
              title="Filter by tag"
            >
              <TagIcon className={cn('w-3.5 h-3.5', selectedTag ? 'text-white' : 'text-ink-3')} />
              <span className="max-w-[110px] truncate">
                {selectedTag ? `#${selectedTag}` : 'Tags'}
              </span>
              <ChevronDown
                className={cn('w-3.5 h-3.5', selectedTag ? 'text-white' : 'text-ink-3')}
              />
            </button>

            <AnchoredMenu
              open={showTagsDropdown}
              onClose={() => {
                setShowTagsDropdown(false)
                setShowNewTagForm(false)
                setNewTagValue('')
              }}
              anchorRef={tagsBtnRef}
              width={220}
            >
              {availableTags.map((t) => (
                <button
                  key={t.tag}
                  onClick={() => {
                    onSelectedTagsChange(selectedTag === t.tag ? [] : [t.tag])
                    setShowTagsDropdown(false)
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                    selectedTag === t.tag ? 'text-clay font-medium' : 'text-ink-2 hover:bg-inset',
                  )}
                >
                  <span className="truncate">#{t.tag}</span>
                  <span className="ml-auto flex-none text-ink-3">{t.count}</span>
                </button>
              ))}

              <div className="my-1 border-t border-hairline" />

              {showNewTagForm ? (
                <form onSubmit={handleCreateTag} className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={newTagInputRef}
                      type="text"
                      value={newTagValue}
                      onChange={(e) => setNewTagValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation()
                          setShowNewTagForm(false)
                          setNewTagValue('')
                        }
                      }}
                      placeholder="tag name"
                      maxLength={10}
                      className="min-w-0 flex-1 rounded-md border border-hairline bg-paper px-2 py-1 text-sm text-ink outline-none focus:border-clay"
                    />
                    <button
                      type="submit"
                      disabled={!newTagPreview}
                      aria-label="Create tag"
                      className="flex-none rounded-md bg-clay-grad p-1.5 text-white disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {newTagValue.trim() && (
                    <p className="mt-1 text-[11px] text-ink-3">
                      {newTagPreview ? `→ #${newTagPreview}` : 'Enter a valid tag'}
                    </p>
                  )}
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewTagForm(true)}
                  className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 text-clay font-medium hover:bg-inset transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New tag
                </button>
              )}
            </AnchoredMenu>
          </div>
        )}

        {/* Sort dropdown pill */}
        <div className="flex-shrink-0">
          <button
            ref={sortBtnRef}
            onClick={() => setShowSortDropdown((v) => !v)}
            className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[13.5px] font-semibold whitespace-nowrap bg-surface border border-hairline text-ink-2 hover:text-ink transition-all duration-150"
            title="Sort options"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-ink-3" />
            <span>{sort === 'added' ? 'Added' : 'Posted'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-ink-3" />
          </button>

          <AnchoredMenu
            open={showSortDropdown}
            onClose={() => setShowSortDropdown(false)}
            anchorRef={sortBtnRef}
            width={176}
          >
            {(['added', 'posted'] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  onSortChange(s)
                }}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm transition-colors',
                  sort === s ? 'text-clay font-medium' : 'text-ink-2 hover:bg-inset',
                )}
              >
                {s === 'added' ? 'Date added' : 'Date posted'}
              </button>
            ))}
            <div className="my-1 border-t border-hairline" />
            {(['desc', 'asc'] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => {
                  onSortDirectionChange(dir)
                }}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm transition-colors',
                  sortDirection === dir ? 'text-clay font-medium' : 'text-ink-2 hover:bg-inset',
                )}
              >
                {dir === 'desc' ? 'Newest first' : 'Oldest first'}
              </button>
            ))}
          </AnchoredMenu>
        </div>

        {/* Unread only toggle */}
        <button
          onClick={() => onUnreadOnlyChange(!unreadOnly)}
          className={cn(
            'flex items-center gap-2 px-3.5 py-[7px] rounded-full text-[13.5px] font-semibold whitespace-nowrap flex-shrink-0 transition-all duration-150',
            unreadOnly
              ? 'bg-clay-grad text-white shadow-glow'
              : 'bg-surface border border-hairline text-ink-2 hover:text-ink',
          )}
        >
          <EyeOff className="w-3.5 h-3.5" />
          <span>Unread only</span>
          <span
            className={cn(
              'text-[11.5px] rounded-full px-[7px] py-px',
              unreadOnly ? 'bg-white/28 text-white' : 'bg-inset text-ink-2',
            )}
          >
            {unreadOnly ? stats.unread : stats.total}
          </span>
        </button>
      </div>

      {/* Selected-tag toolbar: shown while a specific tag is selected — count,
          Public status, and the "Share as theater" flow that publishes the
          tag and copies its `/t/{username}/{tag}` link. */}
      {selectedTag && (
        <div className="flex items-center gap-3 border-t border-hairline px-4 py-2.5 sm:px-[26px]">
          <span className="min-w-0 truncate text-[17px] font-bold text-ink">#{selectedTag}</span>
          <span className="flex-none font-mono text-[12px] text-ink-3">
            {selectedTagInfo?.count ?? 0} post{selectedTagInfo?.count === 1 ? '' : 's'}
          </span>
          {selectedTagInfo?.isPublic && (
            <span className="flex-none rounded-full bg-done/15 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-done">
              Public
            </span>
          )}
          <div className="ml-auto flex flex-none items-center gap-2">
            {copiedLabel && (
              <span className="flex items-center gap-1.5 rounded-full bg-inset px-2.5 py-1 font-mono text-[11px] text-ink-2">
                <Check size={12} className="text-done" />
                {copiedLabel} copied
              </span>
            )}
            {onTagSelectChange && (
              <button
                type="button"
                onClick={() => onTagSelectChange(tagSelect === selectedTag ? null : selectedTag)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3.5 py-[7px] text-[13px] font-semibold transition-colors',
                  tagSelect === selectedTag
                    ? 'bg-done/15 text-done'
                    : 'bg-surface border border-hairline text-ink-2 hover:text-ink',
                )}
              >
                <ListChecks size={13} />
                {tagSelect === selectedTag ? 'Done adding' : 'Add posts'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleShareAsTheater(selectedTag)}
              disabled={sharing}
              className="inline-flex items-center gap-1.5 rounded-full bg-clay-grad px-3.5 py-[7px] text-[13px] font-semibold text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <Repeat size={13} />
              Share as theater
            </button>
            {onSelectedTagsChange && (
              <button
                type="button"
                onClick={() => onSelectedTagsChange([])}
                aria-label="Clear tag filter"
                className="flex-none text-ink-3 transition-colors hover:text-ink"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
