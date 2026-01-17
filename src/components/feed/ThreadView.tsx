'use client'

import { AuthorAvatar } from './AuthorAvatar'
import { renderTextWithLinks, renderBionicTextWithLinks } from './utils'
import { usePreferences } from '@/lib/preferences-context'
import type { ThreadItem, MediaItem } from './types'
import { cn } from '@/lib/utils'
import { ExternalLink, ChevronUp } from 'lucide-react'

interface ThreadViewProps {
  thread: ThreadItem[]
  currentPosition: number
  isComplete: boolean
  isSelfThread: boolean
  /** Called when user clicks a tweet to navigate to it (only for bookmarked tweets) */
  onTweetClick?: (id: string) => void
  /** Called when user selects a tweet to preview its media */
  onTweetSelect?: (item: ThreadItem) => void
  /** Currently selected tweet ID for preview */
  selectedId?: string | null
}

/**
 * Displays a thread chain in a clean, readable format.
 * Designed for easy scanning with clear visual hierarchy.
 */
export function ThreadView({
  thread,
  currentPosition,
  isComplete,
  isSelfThread,
  onTweetClick,
  onTweetSelect,
  selectedId,
}: ThreadViewProps): React.ReactElement {
  const { preferences } = usePreferences()
  const bionicReading = preferences.bionicReading

  // Filter out the current tweet - it's already shown in the main lightbox
  const contextTweets = thread.filter((_, idx) => idx !== currentPosition - 1)

  // If there's no context (only the current tweet), show a message
  if (contextTweets.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 italic py-2">
        This is the start of the thread.
      </div>
    )
  }

  // Split into "before" and "after" the current tweet
  const beforeCurrent = thread.slice(0, currentPosition - 1)
  const afterCurrent = thread.slice(currentPosition)

  return (
    <div className="thread-view">
      {/* Position indicator */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {isSelfThread ? 'Thread by same author' : 'Conversation'}
        </span>
        <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
          Tweet {currentPosition} of {thread.length}
        </span>
      </div>

      {/* Earlier tweets (before current) */}
      {beforeCurrent.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Earlier in thread
          </div>
          <div className="relative space-y-1">
            {beforeCurrent.map((item, idx) => (
              <ThreadTweetCard
                key={item.id}
                item={item}
                isFirst={idx === 0}
                isSelfThread={isSelfThread}
                bionicReading={bionicReading}
                onTweetClick={onTweetClick}
                onTweetSelect={onTweetSelect}
                isSelected={selectedId === item.id}
                showConnector={idx < beforeCurrent.length - 1}
              />
            ))}
            {/* Connector to current tweet */}
            <div className="flex items-center gap-2 py-2 pl-5">
              <div className="w-0.5 h-4 bg-purple-300 dark:bg-purple-600" />
              <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                ↓ Currently viewing
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Later tweets (after current) */}
      {afterCurrent.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 pb-3">
            <div className="w-0.5 h-4 bg-purple-300 dark:bg-purple-600" />
            <span className="text-xs text-purple-600 dark:text-purple-400 font-medium">
              ↓ Continues below
            </span>
          </div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Later in thread
          </div>
          <div className="relative space-y-1">
            {afterCurrent.map((item, idx) => (
              <ThreadTweetCard
                key={item.id}
                item={item}
                isFirst={false}
                isSelfThread={isSelfThread}
                bionicReading={bionicReading}
                onTweetClick={onTweetClick}
                onTweetSelect={onTweetSelect}
                isSelected={selectedId === item.id}
                showConnector={idx < afterCurrent.length - 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* Incomplete thread notice */}
      {!isComplete && (
        <div className="mt-4 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <ChevronUp className="w-3 h-3" />
          <span>Some earlier tweets couldn&apos;t be loaded</span>
        </div>
      )}
    </div>
  )
}

/**
 * Individual tweet card in thread context
 */
function ThreadTweetCard({
  item,
  isFirst,
  isSelfThread,
  bionicReading,
  onTweetClick,
  onTweetSelect,
  isSelected,
  showConnector,
}: {
  item: ThreadItem
  isFirst: boolean
  isSelfThread: boolean
  bionicReading: boolean
  onTweetClick?: (id: string) => void
  onTweetSelect?: (item: ThreadItem) => void
  isSelected?: boolean
  showConnector: boolean
}): React.ReactElement {
  const isSaved = item.source === 'bookmarked'
  const hasMedia = item.media && item.media.length > 0

  // Handle click - select for preview, or navigate if saved and double-clicked
  const handleClick = (): void => {
    if (onTweetSelect) {
      onTweetSelect(item)
    }
  }

  const handleDoubleClick = (): void => {
    if (isSaved && onTweetClick) {
      onTweetClick(item.id)
    }
  }

  return (
    <div className="relative group">
      {/* Connector line */}
      {showConnector && (
        <div
          className="absolute left-5 top-12 -bottom-1 w-0.5 bg-gray-200 dark:bg-gray-700"
          aria-hidden="true"
        />
      )}

      <div
        className={cn(
          'relative py-3 px-3 -mx-3 rounded-lg transition-all duration-200 cursor-pointer',
          'hover:bg-gray-50 dark:hover:bg-gray-800/30',
          isSelected && 'bg-purple-50 dark:bg-purple-900/20 ring-2 ring-purple-400 dark:ring-purple-500',
          !isSaved && !isSelected && 'opacity-80'
        )}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick()
          }
        }}
      >
        <div className="flex gap-3">
          <div className="flex-shrink-0">
            <AuthorAvatar
              author={item.author}
              src={item.authorProfileImageUrl}
              size="sm"
            />
          </div>

          <div className="flex-1 min-w-0">
            {/* Author line */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                {item.authorName || item.author}
              </span>
              <span className="text-gray-500 dark:text-gray-400 text-xs">
                @{item.author}
              </span>

              {isFirst && !isSelfThread && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  · Thread start
                </span>
              )}

              {!isSaved && (
                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-100/80 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400">
                  <ExternalLink className="w-2.5 h-2.5" />
                  Not saved
                </span>
              )}
            </div>

            {/* Tweet text */}
            <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {bionicReading
                ? renderBionicTextWithLinks(item.text)
                : renderTextWithLinks(item.text)}
            </div>

            {/* Media thumbnails */}
            {hasMedia && (
              <div className="flex gap-1.5 mt-2">
                {item.media!.slice(0, 4).map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800',
                      isSelected ? 'w-16 h-16' : 'w-14 h-14'
                    )}
                  >
                    <img
                      src={m.thumbnailUrl || m.url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {(m.mediaType === 'video' || m.mediaType === 'gif') && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <PlayIcon className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                ))}
                {item.media!.length > 4 && (
                  <div className={cn(
                    'rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs text-gray-500',
                    isSelected ? 'w-16 h-16' : 'w-14 h-14'
                  )}>
                    +{item.media!.length - 4}
                  </div>
                )}
              </div>
            )}

            {/* Timestamp + interaction hint */}
            <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              {item.createdAt && <span>{formatThreadDate(item.createdAt)}</span>}
              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-purple-500 dark:text-purple-400">
                · {hasMedia ? 'Click to preview' : 'Click to select'}{isSaved ? ' · Double-click to open' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Small media thumbnail grid for thread items
 */
function _MediaThumbnails({ media }: { media: MediaItem[] }): React.ReactElement {
  const displayMedia = media.slice(0, 4)

  return (
    <div className="flex gap-1.5 mt-3">
      {displayMedia.map((m, idx) => (
        <div
          key={m.id}
          className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 ring-1 ring-black/5 dark:ring-white/5"
        >
          <img
            src={m.thumbnailUrl || m.url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {m.mediaType === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <PlayIcon className="w-8 h-8 text-white drop-shadow-lg" />
            </div>
          )}
          {media.length > 4 && idx === 3 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm font-semibold">
              +{media.length - 4}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Format date for thread display
 */
function formatThreadDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } else if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  } else {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
  }
}

/**
 * Play icon for video thumbnails
 */
function PlayIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
