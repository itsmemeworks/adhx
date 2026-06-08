'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  EyeOff,
  ChevronDown,
  SlidersHorizontal,
  Instagram,
  Youtube,
  LayoutGrid,
  List as ListIcon,
  LayoutDashboard,
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
}

function PlatformIcon({ value, className }: { value: PlatformFilter; className?: string }) {
  if (value === 'twitter') return <PlatformGlyph platform="x" className={className} />
  if (value === 'instagram') return <Instagram className={className} />
  if (value === 'tiktok') return <PlatformGlyph platform="tiktok" className={className} />
  if (value === 'youtube') return <Youtube className={className} />
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
  stats,
}: FilterBarProps): React.ReactElement {
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const platformBtnRef = useRef<HTMLButtonElement>(null)
  const sortBtnRef = useRef<HTMLButtonElement>(null)
  const currentPlatform = PLATFORM_OPTIONS.find((o) => o.value === platform) || PLATFORM_OPTIONS[0]

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
    </div>
  )
}
