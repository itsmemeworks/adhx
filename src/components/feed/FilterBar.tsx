'use client'

import { useState } from 'react'
import { EyeOff, ChevronDown, SlidersHorizontal, Instagram, Youtube, LayoutGrid, List as ListIcon, LayoutDashboard } from 'lucide-react'
import { FILTER_OPTIONS, PLATFORM_OPTIONS, type FilterType, type SortType, type SortDirection, type TagItem, type PlatformFilter } from './types'
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
            {([
              ['grid', LayoutGrid, 'Grid'],
              ['list', ListIcon, 'List'],
              ['bento', LayoutDashboard, 'Bento'],
            ] as const).map(([id, Ico, label]) => (
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
          <div className="relative flex-shrink-0">
            <button
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
              <ChevronDown className={cn('w-3.5 h-3.5', platform !== 'all' ? 'text-white' : 'text-ink-3')} />
            </button>

            {showPlatformDropdown && (
              <>
                <div className="fixed inset-0 z-[100]" onClick={() => setShowPlatformDropdown(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-surface rounded-card shadow-m-sm border border-hairline py-2 z-[101]">
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
                </div>
              </>
            )}
          </div>
        )}

        {/* Sort dropdown pill */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowSortDropdown((v) => !v)}
            className="flex items-center gap-1.5 px-3.5 py-[7px] rounded-full text-[13.5px] font-semibold whitespace-nowrap bg-surface border border-hairline text-ink-2 hover:text-ink transition-all duration-150"
            title="Sort options"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-ink-3" />
            <span>{sort === 'added' ? 'Added' : 'Posted'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-ink-3" />
          </button>

          {showSortDropdown && (
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setShowSortDropdown(false)} />
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-surface rounded-card shadow-m-sm border border-hairline py-2 z-[101]">
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
              </div>
            </>
          )}
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
