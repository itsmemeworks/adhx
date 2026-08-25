'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Eye,
  EyeOff,
  ChevronDown,
  SlidersHorizontal,
  LayoutGrid,
  List as ListIcon,
  LayoutDashboard,
  Tag as TagIcon,
  Check,
  Globe,
  Lock,
  Link2,
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
import { kebabTagInput, sanitizeTag } from '@/lib/utils/tag'

interface FilterBarProps {
  filter: FilterType
  onFilterChange: (filter: FilterType) => void
  platform?: PlatformFilter
  onPlatformChange?: (platform: PlatformFilter) => void
  sort: SortType
  onSortChange: (sort: SortType) => void
  sortDirection: SortDirection
  onSortDirectionChange: (dir: SortDirection) => void
  hideArchived: boolean
  onHideArchivedChange: (hideArchived: boolean) => void
  view?: FeedView
  onViewChange?: (view: FeedView) => void
  // Tagging is removed in the Matter redesign. These props are retained so
  // existing callers (page.tsx) continue to compile, but they are not used.
  selectedTags?: string[]
  onSelectedTagsChange?: (tags: string[]) => void
  availableTags?: TagItem[]
  stats: { total: number; active: number }
  onTagUpdated?: (tag: string, isPublic: boolean, shareUrl: string) => void
  // Tags: create + fill (unified-theater-collection §4). `tagSelect` is the tag
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
  hideArchived,
  onHideArchivedChange,
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
   * "Make public": marks the tag public (idempotent — safe to call even
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

  /** The toggle's other half: make the selected tag private again. */
  async function handleMakePrivate(tag: string) {
    setSharing(true)
    try {
      const res = await fetch('/api/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, isPublic: false }),
      })
      if (!res.ok) return
      onTagUpdated?.(tag, false, '')
    } catch {
      // Best-effort, same as handleShareAsTheater.
    } finally {
      setSharing(false)
    }
  }

  return (
    // Header is sticky `top-0` / `h-16`. Stick just below it so #tag + Done
    // adding stay on screen while the grid scrolls (a matching `top-0` hid
    // this row under the header).
    <div className="sticky top-16 z-30 bg-paper/95 backdrop-blur-sm border-b border-hairline">
      <div className="flex items-center gap-2 px-4 sm:px-[26px] py-3 overflow-x-auto scrollbar-hide">
        {/* Left side: type filter pills, OR — while a tag is selected — the
            tag's identity + actions (formerly a separate toolbar row below
            the filter bar, now folded into it). Type filtering is
            deliberately dropped while a tag is active; clearing the tag (✕)
            or deselecting it via the Tags dropdown restores the pills. */}
        {selectedTag ? (
          <div className="flex flex-shrink-0 items-center gap-3">
            <span className="min-w-0 truncate text-[17px] font-bold text-ink">#{selectedTag}</span>
            <span className="flex-none font-mono text-[12px] text-ink-3">
              {selectedTagInfo?.count ?? 0} post{selectedTagInfo?.count === 1 ? '' : 's'}
            </span>
            {copiedLabel && (
              <span className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full bg-inset px-2.5 py-1 font-mono text-[11px] text-ink-2">
                <Check size={12} className="text-done" />
                <span>{copiedLabel} copied</span>
              </span>
            )}
            {onTagSelectChange && (
              <button
                type="button"
                onClick={() => onTagSelectChange(tagSelect === selectedTag ? null : selectedTag)}
                className={cn(
                  'flex-shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-[7px] text-[13px] font-semibold transition-colors',
                  tagSelect === selectedTag
                    ? 'bg-done/15 text-done'
                    : 'bg-surface border border-hairline text-ink-2 hover:text-ink',
                )}
              >
                <ListChecks size={13} />
                <span>{tagSelect === selectedTag ? 'Done adding' : 'Add posts'}</span>
              </button>
            )}
            {/* ONE visibility control — the state IS the action, styled like
                its sibling Add-posts button so it reads as a standard dash
                button (the /tags cards carry the same single-toggle rule). */}
            <button
              type="button"
              onClick={() =>
                void (selectedTagInfo?.isPublic
                  ? handleMakePrivate(selectedTag)
                  : handleShareAsTheater(selectedTag))
              }
              disabled={sharing}
              aria-label={selectedTagInfo?.isPublic ? 'Make private' : 'Make public'}
              title={selectedTagInfo?.isPublic ? 'Make private' : 'Make public'}
              className="flex-shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface border border-hairline px-3.5 py-[7px] text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-60"
            >
              {selectedTagInfo?.isPublic ? (
                <>
                  <span className="h-1.5 w-1.5 flex-none rounded-full bg-live" aria-hidden />
                  <Globe size={13} />
                  <span>Public</span>
                </>
              ) : (
                <>
                  <Lock size={13} />
                  <span>Private</span>
                </>
              )}
            </button>
            {selectedTagInfo?.isPublic && (
              <button
                type="button"
                onClick={() => void handleShareAsTheater(selectedTag)}
                disabled={sharing}
                aria-label="Copy share link"
                title="Copy share link"
                className="flex-shrink-0 inline-flex items-center justify-center rounded-full bg-surface border border-hairline p-[9px] text-ink-2 transition-colors hover:text-ink disabled:opacity-60"
              >
                <Link2 size={13} />
              </button>
            )}
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
        ) : (
          FILTER_OPTIONS.map((opt) => {
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
          })
        )}

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
                      onChange={(e) => setNewTagValue(kebabTagInput(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation()
                          setShowNewTagForm(false)
                          setNewTagValue('')
                        }
                      }}
                      placeholder="tag name"
                      maxLength={15}
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
                  <span>New tag</span>
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

        {/* The archive view switch — hidden while a tag is selected: a tag is
            a deliberately curated set, so this doesn't apply there (the feed
            fetch ignores archive state for tag views too).

            Two views: active collection, or archived posts only. The LABEL
            names what you will see after pressing it. It is NOT an orange
            CTA — a view switch is not a call to action, so both states use
            the same quiet surface and only the label and count change.

            Vocabulary note: the flag is still `hideArchived` and the column is
            still archived_posts. Renaming a shipped API and a DB column is a
            separate job from fixing the words people read. */}
        {selectedTags.length === 0 && (
          <button
            onClick={() => onHideArchivedChange(!hideArchived)}
            aria-pressed={!hideArchived}
            title={hideArchived ? 'Show only archived posts' : 'Show only your active collection'}
            className="flex flex-shrink-0 items-center gap-2 rounded-full border border-hairline bg-surface px-3.5 py-[7px] text-[13.5px] font-semibold whitespace-nowrap text-ink-2 transition-colors duration-150 hover:text-ink"
          >
            {hideArchived ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            <span>{hideArchived ? 'Show archived' : 'Hide archived'}</span>
            <span className="rounded-full bg-inset px-[7px] py-px text-[11.5px] text-ink-2">
              {hideArchived ? stats.active : Math.max(0, stats.total - stats.active)}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
