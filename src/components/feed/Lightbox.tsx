'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Check,
  EyeOff,
  Quote,
  Repeat2,
  FileText,
  Download,
  Share2,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { AuthorAvatar } from './AuthorAvatar'
import { TagInput, type TagInputHandle } from './TagInput'
import { renderTextWithLinks, renderBionicTextWithLinks, renderArticleBlock, stripMediaUrls, handleShareMedia, isTouchDevice } from './utils'
import { cn } from '@/lib/utils'
import { usePreferences } from '@/lib/preferences-context'
import type { FeedItem, TagItem } from './types'

// Shared helper: Navigate to parent tweet that quoted this one
function navigateToParent(
  item: FeedItem,
  onNavigateToId?: (id: string, fallbackUrl?: string) => boolean
): void {
  if (item.parentTweets?.[0]?.id && onNavigateToId) {
    const parentTweet = item.parentTweets[0]
    onNavigateToId(parentTweet.id, parentTweet.tweetUrl)
  }
}

// Shared helper: Get thumbnail URL from quoted tweet data
function getQuoteThumbnail(
  quotedTweet?: FeedItem | null,
  quoteContext?: FeedItem['quoteContext']
): string | null {
  // Media thumbnail from quotedTweet
  if (quotedTweet?.media && quotedTweet.media.length > 0) {
    const media = quotedTweet.media[0]
    return media.thumbnailUrl || media.url
  }
  // Article image from quotedTweet
  if (quotedTweet?.articlePreview?.imageUrl) {
    return quotedTweet.articlePreview.imageUrl
  }
  // Article image from quoteContext
  if (quoteContext?.article?.imageUrl) {
    return quoteContext.article.imageUrl
  }
  // Fall back to media entities in articleContent
  if (quotedTweet?.articleContent?.mediaEntities) {
    const firstMediaId = Object.keys(quotedTweet.articleContent.mediaEntities)[0]
    if (firstMediaId) {
      return quotedTweet.articleContent.mediaEntities[firstMediaId]?.url || null
    }
  }
  return null
}

interface LightboxProps {
  item: FeedItem
  index: number
  total: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onMarkRead: () => void
  markingRead: boolean
  onTagAdd: (tag: string) => Promise<void>
  onTagRemove: (tag: string) => Promise<void>
  availableTags: TagItem[]
  unreadOnly?: boolean
  onRemoveItem?: () => void
  onNavigateToId?: (id: string, fallbackUrl?: string) => boolean // Returns true if navigation succeeded (id was in feed)
}

export function Lightbox({
  item,
  index,
  total,
  onClose,
  onPrev,
  onNext,
  onMarkRead,
  markingRead,
  onTagAdd,
  onTagRemove,
  availableTags,
  unreadOnly,
  onRemoveItem,
  onNavigateToId,
}: LightboxProps): React.ReactElement {
  const [showDopamine, setShowDopamine] = useState(false)
  const tagInputRef = useRef<TagInputHandle>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { preferences } = usePreferences()
  const bionicReading = preferences.bionicReading

  useEffect(() => {
    setShowDopamine(false)
  }, [item.id])

  // Swipe navigation for mobile
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function handleTouchStart(e: TouchEvent): void {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      }
    }

    function handleTouchEnd(e: TouchEvent): void {
      if (!touchStartRef.current) return

      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
      }

      const deltaX = touchEnd.x - touchStartRef.current.x
      const deltaY = touchEnd.y - touchStartRef.current.y
      const swipeThreshold = 50

      // Only trigger swipe if horizontal movement is greater than vertical
      // This prevents accidental swipes while scrolling
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > swipeThreshold) {
        if (deltaX > 0) {
          onPrev() // Swipe right = previous
        } else {
          onNext() // Swipe left = next
        }
      }

      touchStartRef.current = null
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onPrev, onNext])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (document.activeElement?.tagName === 'INPUT') return
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        tagInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleMarkReadWithAnimation(): void {
    if (item.isRead) {
      onMarkRead()
      return
    }

    setShowDopamine(true)
    setTimeout(() => onMarkRead(), 150)

    if (unreadOnly && onRemoveItem) {
      setTimeout(() => {
        if (total <= 1) {
          onClose()
        } else if (index >= total - 1) {
          onPrev()
        }
        onRemoveItem()
      }, 600)
    } else {
      setTimeout(() => setShowDopamine(false), 800)
    }
  }

  const hasMedia = item.media && item.media.length > 0
  const primaryMedia = hasMedia ? item.media![0] : null
  const isVideo = primaryMedia?.mediaType === 'video' || primaryMedia?.mediaType === 'animated_gif'

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={onClose}>
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 sm:top-4 right-3 sm:right-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors z-20"
      >
        <X className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      {/* Counter */}
      <div className="absolute top-3 sm:top-4 left-3 sm:left-4 text-white/70 text-xs sm:text-sm z-20">
        {index + 1} / {total}
      </div>

      {/* Navigation - hidden on very small screens, use swipe instead */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onPrev()
        }}
        className="hidden sm:block absolute left-2 md:left-4 top-1/2 -translate-y-1/2 p-2 md:p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
      >
        <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-white" />
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation()
          onNext()
        }}
        className="hidden sm:block absolute right-2 md:right-4 top-1/2 -translate-y-1/2 p-2 md:p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
      >
        <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-white" />
      </button>

      {/* Main content - using max-w instead of w-full so clicks outside content reach background */}
      <div className="max-w-6xl mx-auto" onClick={(e) => e.stopPropagation()}>
        {hasMedia && primaryMedia ? (
          <MediaLightboxContent
            item={item}
            primaryMedia={primaryMedia}
            isVideo={isVideo}
            showDopamine={showDopamine}
            markingRead={markingRead}
            onMarkRead={handleMarkReadWithAnimation}
            onTagAdd={onTagAdd}
            onTagRemove={onTagRemove}
            availableTags={availableTags}
            tagInputRef={tagInputRef}
            bionicReading={bionicReading}
            onNavigateToId={onNavigateToId}
          />
        ) : (
          <TextLightboxContent
            item={item}
            showDopamine={showDopamine}
            markingRead={markingRead}
            onMarkRead={handleMarkReadWithAnimation}
            onTagAdd={onTagAdd}
            onTagRemove={onTagRemove}
            availableTags={availableTags}
            tagInputRef={tagInputRef}
            bionicReading={bionicReading}
            onNavigateToId={onNavigateToId}
          />
        )}
      </div>

      {/* Keyboard hint - hidden on mobile */}
      <div className="hidden sm:block absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-xs">
        &larr; &rarr; navigate | R read | U unread | T tag | Q quoted | P parent | S share | X open | Esc close
      </div>
    </div>
  )
}

interface LightboxContentProps {
  item: FeedItem
  showDopamine: boolean
  markingRead: boolean
  onMarkRead: () => void
  onTagAdd: (tag: string) => Promise<void>
  onTagRemove: (tag: string) => Promise<void>
  availableTags: TagItem[]
  tagInputRef: React.RefObject<TagInputHandle | null>
  bionicReading: boolean
  onNavigateToId?: (id: string, fallbackUrl?: string) => boolean
}

function MediaLightboxContent({
  item,
  primaryMedia,
  isVideo,
  showDopamine,
  markingRead,
  onMarkRead,
  onTagAdd,
  onTagRemove,
  availableTags,
  tagInputRef,
  bionicReading,
  onNavigateToId,
}: LightboxContentProps & {
  primaryMedia: NonNullable<FeedItem['media']>[0]
  isVideo: boolean
}): React.ReactElement {
  const hasMedia = item.media && item.media.length > 0
  const renderText = bionicReading ? renderBionicTextWithLinks : renderTextWithLinks

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-center lg:items-start max-h-[85vh] overflow-y-auto lg:overflow-visible">
      {/* Media panel - shown first on mobile */}
      <div className="w-full lg:flex-1 flex items-center justify-center order-1 lg:order-2 relative group">
        {isVideo ? (
          <div className="relative">
            <video
              key={item.id}
              src={`/api/media/video?author=${item.author}&tweetId=${item.id}&quality=full`}
              controls
              autoPlay
              loop={primaryMedia.mediaType === 'animated_gif'}
              className="max-w-full max-h-[50vh] lg:max-h-[80vh] rounded-xl lg:rounded-2xl bg-black"
            />
            {/* Share/Download button for video */}
            <div className="absolute top-3 right-3">
              <MediaShareButton
                url={`/api/media/video?author=${item.author}&tweetId=${item.id}&quality=full`}
                filename={`tweet-${item.id}.mp4`}
                mimeType="video/mp4"
              />
            </div>
          </div>
        ) : item.media && item.media.length > 1 ? (
          /* Multi-image: vertical scroll gallery */
          <div className="flex flex-col gap-4 max-h-[50vh] lg:max-h-[80vh] overflow-y-auto py-2 px-2 article-scrollbar">
            {item.media
              .filter(m => m.mediaType === 'photo')
              .map((media, index) => (
                <div key={media.id} className="relative group/img flex-shrink-0">
                  <img
                    src={media.url}
                    alt={`Image ${index + 1} of ${item.media!.length}`}
                    className="max-w-full max-h-[70vh] rounded-xl lg:rounded-2xl object-contain mx-auto"
                  />
                  {/* Share/Download button per image - uses proxy to avoid CORS */}
                  <div className="absolute top-3 right-3">
                    <MediaShareButton
                      url={`/api/media/image?author=${item.author}&tweetId=${item.id}&index=${index + 1}`}
                      filename={`tweet-${item.id}-${index + 1}.jpg`}
                      mimeType="image/jpeg"
                      useImageGroupHover
                    />
                  </div>
                </div>
              ))}
          </div>
        ) : (
          /* Single image */
          <div className="relative">
            <img
              key={item.id}
              src={primaryMedia.url}
              alt=""
              className="max-w-full max-h-[50vh] lg:max-h-[80vh] rounded-xl lg:rounded-2xl object-contain"
            />
            {/* Share/Download button for single image - uses proxy to avoid CORS */}
            <div className="absolute top-3 right-3">
              <MediaShareButton
                url={`/api/media/image?author=${item.author}&tweetId=${item.id}&index=1`}
                filename={`tweet-${item.id}.jpg`}
                mimeType="image/jpeg"
              />
            </div>
          </div>
        )}
      </div>

      {/* Info panel - shown below media on mobile, left side on desktop */}
      <div className="w-full lg:w-80 flex-shrink-0 bg-white dark:bg-gray-900 rounded-xl lg:rounded-2xl p-4 lg:p-5 lg:max-h-[80vh] lg:overflow-y-auto flex flex-col order-2 lg:order-1">
        {/* Parent banner - shows when this tweet was quoted by another */}
        {item.parentTweets && item.parentTweets.length > 0 && (
          <button
            onClick={() => navigateToParent(item, onNavigateToId)}
            className="flex items-center justify-between px-3 py-2 mb-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <Quote className="w-3 h-3" />
              <span>Quoted by <strong>@{item.parentTweets[0].author}</strong></span>
            </div>
            <span className="text-blue-500">P</span>
          </button>
        )}
        <AuthorHeader item={item} />
        {item.text && (
          <p className="text-gray-900 dark:text-white text-sm leading-relaxed mb-4 line-clamp-4 lg:line-clamp-none">
            {renderText(stripMediaUrls(item.text, !!hasMedia))}
          </p>
        )}
        {/* AI Summary */}
        {item.summary && <SummarySection summary={item.summary} />}
        {/* Embedded QuoteCard for quote tweets with media */}
        {item.isQuote && (item.quotedTweet || item.quoteContext) && (
          <QuoteCard item={item} onNavigateToId={onNavigateToId} compact />
        )}
        <BottomBar
          item={item}
          showDopamine={showDopamine}
          markingRead={markingRead}
          onMarkRead={onMarkRead}
          onTagAdd={onTagAdd}
          onTagRemove={onTagRemove}
          availableTags={availableTags}
          tagInputRef={tagInputRef}
        />
      </div>
    </div>
  )
}

function TextLightboxContent({
  item,
  showDopamine,
  markingRead,
  onMarkRead,
  onTagAdd,
  onTagRemove,
  availableTags,
  tagInputRef,
  bionicReading,
  onNavigateToId,
}: LightboxContentProps): React.ReactElement {
  const renderText = bionicReading ? renderBionicTextWithLinks : renderTextWithLinks

  return (
    <div className="w-full max-w-2xl mx-auto bg-white dark:bg-gray-900 rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 flex flex-col max-h-[85vh] overflow-y-auto">
      {/* Parent banner - shows when this tweet was quoted by another */}
      {item.parentTweets && item.parentTweets.length > 0 && (
        <button
          onClick={() => navigateToParent(item, onNavigateToId)}
          className="flex items-center justify-between px-3 py-2 mb-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
        >
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <Quote className="w-4 h-4" />
            <span>Quoted by <strong>@{item.parentTweets[0].author}</strong></span>
          </div>
          <span className="text-xs text-blue-500">Press P to view</span>
        </button>
      )}

      <AuthorHeader item={item} />

      {/* AI Summary */}
      {item.summary && <SummarySection summary={item.summary} />}

      {item.isRetweet && item.retweetContext ? (
        <RetweetContent retweetContext={item.retweetContext} bionicReading={bionicReading} />
      ) : item.isQuote && (item.quotedTweet || item.quoteContext) ? (
        <TextQuoteContent item={item} bionicReading={bionicReading} onNavigateToId={onNavigateToId} />
      ) : item.category === 'article' && (item.articlePreview || item.links?.[0]) ? (
        <ArticleContent item={item} bionicReading={bionicReading} />
      ) : (
        <div className="max-h-[60vh] overflow-y-auto pr-2 -mr-2 article-scrollbar">
          <p className="text-gray-900 dark:text-white text-lg leading-relaxed pb-4">{renderText(item.text)}</p>
        </div>
      )}

      <BottomBar
        item={item}
        showDopamine={showDopamine}
        markingRead={markingRead}
        onMarkRead={onMarkRead}
        onTagAdd={onTagAdd}
        onTagRemove={onTagRemove}
        availableTags={availableTags}
        tagInputRef={tagInputRef}
      />
    </div>
  )
}

function SummarySection({ summary }: { summary: string }): React.ReactElement {
  return (
    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/30">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-blue-500" />
        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">AI Summary</span>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{summary}</p>
    </div>
  )
}

function AuthorHeader({ item }: { item: FeedItem }): React.ReactElement {
  const [showCopied, setShowCopied] = useState(false)

  // Build ADHX share URL format: {domain}/{author}/status/{id}
  const getAdhxShareUrl = (): string => {
    // Use window.location.origin to get the current domain
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return `${baseUrl}/${item.author}/status/${item.id}`
  }

  // Core share logic - copies to clipboard and shows animation
  const triggerShare = useCallback(async (): Promise<void> => {
    const shareUrl = getAdhxShareUrl()
    await navigator.clipboard.writeText(shareUrl)
    setShowCopied(true)
    setTimeout(() => setShowCopied(false), 1500)
  }, [item.author, item.id])

  // Listen for keyboard shortcut event (S key from page.tsx)
  useEffect(() => {
    const handleTriggerShare = (): void => {
      triggerShare()
    }
    window.addEventListener('trigger-share', handleTriggerShare)
    return () => window.removeEventListener('trigger-share', handleTriggerShare)
  }, [triggerShare])

  const handleShare = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    const shareUrl = getAdhxShareUrl()

    // On desktop (devices with hover capability), skip the share menu and copy directly
    // Mobile devices without hover get the native share sheet which is a better UX there
    const isDesktop = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

    if (!isDesktop && navigator.share) {
      try {
        await navigator.share({ url: shareUrl })
      } catch {
        // User cancelled or share failed - fall back to clipboard
        triggerShare()
      }
    } else {
      // Desktop: just copy to clipboard with satisfying feedback
      triggerShare()
    }
  }

  return (
    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-200 dark:border-gray-800">
      <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="lg" />
      <div className="flex-1 min-w-0">
        <span className="text-gray-900 dark:text-white font-medium block truncate">@{item.author}</span>
        {item.authorName && <p className="text-gray-500 dark:text-white/60 text-sm truncate">{item.authorName}</p>}
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={handleShare}
          className={`relative p-2 rounded-full transition-all duration-300 overflow-hidden ${
            showCopied
              ? 'bg-blue-500 text-white scale-110 shadow-lg shadow-blue-500/40'
              : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105'
          }`}
          title="Share via ADHX"
        >
          <div className={`transition-all duration-300 ${showCopied ? 'rotate-180 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'}`}>
            <Share2 className="w-4 h-4 text-gray-700 dark:text-white" />
          </div>
          <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${showCopied ? 'rotate-0 scale-100 opacity-100' : '-rotate-180 scale-0 opacity-0'}`}>
            <Check className="w-4 h-4" />
          </div>
        </button>
        <a
          href={item.tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 hover:scale-105 transition-all duration-200"
          title="View on X"
        >
          <ExternalLink className="w-4 h-4 text-gray-700 dark:text-white" />
        </a>
      </div>
    </div>
  )
}

function BottomBar({
  item,
  showDopamine,
  markingRead,
  onMarkRead,
  onTagAdd,
  onTagRemove,
  availableTags,
  tagInputRef,
}: {
  item: FeedItem
  showDopamine: boolean
  markingRead: boolean
  onMarkRead: () => void
  onTagAdd: (tag: string) => Promise<void>
  onTagRemove: (tag: string) => Promise<void>
  availableTags: TagItem[]
  tagInputRef: React.RefObject<TagInputHandle | null>
}): React.ReactElement {
  return (
    <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-2">
        <TagInput
          ref={tagInputRef}
          tags={item.tags}
          availableTags={availableTags}
          onAddTag={onTagAdd}
          onRemoveTag={onTagRemove}
        />
        <button
          onClick={onMarkRead}
          disabled={markingRead}
          className={`relative p-2.5 rounded-full transition-all disabled:opacity-50 flex-shrink-0 overflow-hidden ${
            showDopamine
              ? 'bg-green-500 text-white scale-110 shadow-lg shadow-green-500/40'
              : item.isRead
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 hover:scale-105'
                : 'bg-green-500 text-white hover:bg-green-600 hover:scale-110 hover:shadow-lg hover:shadow-green-500/30'
          } duration-300`}
          title={item.isRead ? 'Mark as unread' : 'Mark as read'}
        >
          {/* Icon rotation animation: Check rotates into EyeOff */}
          <div className={`transition-all duration-300 ${showDopamine ? 'rotate-180 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'}`}>
            {item.isRead ? <EyeOff className="w-5 h-5" /> : <Check className="w-5 h-5" />}
          </div>
          <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${showDopamine ? 'rotate-0 scale-100 opacity-100' : '-rotate-180 scale-0 opacity-0'}`}>
            <EyeOff className="w-5 h-5" />
          </div>
        </button>
      </div>
    </div>
  )
}

/**
 * MediaShareButton - Unified share/download button for media
 * - Mobile (touch devices): Shows Share icon, always visible, opens native share sheet
 * - Desktop (hover devices): Shows Download icon, appears on hover, downloads file
 */
interface MediaShareButtonProps {
  url: string
  filename: string
  mimeType?: string
  /** Use group-hover/img for multi-image galleries */
  useImageGroupHover?: boolean
}

function MediaShareButton({ url, filename, mimeType = 'image/jpeg', useImageGroupHover = false }: MediaShareButtonProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(isTouchDevice())
  }, [])

  const handleClick = async (e: React.MouseEvent): Promise<void> => {
    setIsLoading(true)
    const result = await handleShareMedia(e, url, filename, mimeType)
    setIsLoading(false)
    if (result.success) {
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 1500)
    }
  }

  // Mobile: always visible | Desktop: hover-visible
  const visibilityClass = isMobile
    ? 'opacity-100'
    : useImageGroupHover
      ? 'opacity-0 group-hover/img:opacity-100'
      : 'opacity-0 group-hover:opacity-100'

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        'p-2 bg-black/60 hover:bg-black/80 rounded-full transition-all disabled:opacity-80',
        visibilityClass
      )}
      title={isMobile ? 'Share' : 'Download'}
      aria-label={isMobile ? 'Share media' : 'Download media'}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 text-white animate-spin" />
      ) : showSuccess ? (
        <Check className="w-4 h-4 text-white" />
      ) : isMobile ? (
        <Share2 className="w-4 h-4 text-white" />
      ) : (
        <Download className="w-4 h-4 text-white" />
      )}
    </button>
  )
}

function RetweetContent({ retweetContext, bionicReading }: { retweetContext: NonNullable<FeedItem['retweetContext']>; bionicReading: boolean }): React.ReactElement {
  const renderText = bionicReading ? renderBionicTextWithLinks : renderTextWithLinks

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <Repeat2 className="w-5 h-5 text-green-500" />
        <span className="text-green-500 text-sm font-medium">Retweet</span>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          {retweetContext.authorProfileImageUrl ? (
            <img
              src={retweetContext.authorProfileImageUrl}
              alt={retweetContext.author}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold">
              {retweetContext.author[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-gray-900 dark:text-white font-medium">{retweetContext.authorName || retweetContext.author}</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">@{retweetContext.author}</p>
          </div>
        </div>
        <p className="text-gray-900 dark:text-white text-lg leading-relaxed mb-4">{renderText(retweetContext.text)}</p>
        {retweetContext.media?.photos && retweetContext.media.photos.length > 0 && (
          <div className="rounded-xl overflow-hidden">
            <img
              src={`https://d.fixupx.com/${retweetContext.author}/status/${retweetContext.tweetId}/photo/1`}
              alt=""
              className="w-full max-h-96 object-contain bg-black"
            />
          </div>
        )}
        {retweetContext.media?.videos && retweetContext.media.videos.length > 0 && (
          <div className="rounded-xl overflow-hidden">
            <video
              src={`/api/media/video?author=${retweetContext.author}&tweetId=${retweetContext.tweetId}&quality=hd`}
              controls
              className="w-full max-h-96"
            />
          </div>
        )}
      </div>
    </>
  )
}

// Reusable QuoteCard component for displaying embedded quoted tweets
function QuoteCard({
  item,
  onNavigateToId,
  compact = false,
}: {
  item: FeedItem
  onNavigateToId?: (id: string, fallbackUrl?: string) => boolean
  compact?: boolean
}): React.ReactElement | null {
  const quotedTweet = item.quotedTweet
  const quoteContext = item.quoteContext

  if (!quotedTweet && !quoteContext) {
    return null
  }

  // Build quoted tweet data from either source
  const quotedAuthor = quotedTweet?.author || quoteContext?.author || ''
  const quotedAuthorName = quotedTweet?.authorName || quoteContext?.authorName || quotedAuthor
  const quotedProfileImage = quotedTweet?.authorProfileImageUrl || quoteContext?.authorProfileImageUrl
  const quotedText = quotedTweet?.text || quoteContext?.text || ''
  const quotedTweetId = quotedTweet?.id || quoteContext?.tweetId || ''
  const quotedTweetUrl = quotedTweet?.tweetUrl || (quoteContext ? `https://x.com/${quoteContext.author}/status/${quoteContext.tweetId}` : '#')

  // Check for media/article in quoted tweet
  const quotedIsArticle = quotedTweet?.category === 'article' || quotedTweet?.articlePreview || quoteContext?.article
  const thumbnail = getQuoteThumbnail(quotedTweet, quoteContext)

  const handleClick = (): void => {
    if (quotedTweetId && onNavigateToId) {
      onNavigateToId(quotedTweetId, quotedTweetUrl)
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors flex gap-3 ${compact ? 'p-2 mb-3' : 'p-3'}`}
    >
      {/* Thumbnail */}
      {thumbnail && (
        <div className={`rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700 ${compact ? 'w-[80px] h-[60px]' : 'w-[120px] h-[80px]'}`}>
          <img src={thumbnail} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {quotedProfileImage ? (
            <img src={quotedProfileImage} alt={quotedAuthor} className={`rounded-full object-cover ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
          ) : (
            <div className={`rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold ${compact ? 'w-4 h-4 text-[10px]' : 'w-5 h-5 text-xs'}`}>
              {quotedAuthor?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <span className={`font-medium text-gray-900 dark:text-white truncate ${compact ? 'text-xs' : 'text-sm'}`}>{quotedAuthorName}</span>
          <span className={`text-gray-500 ${compact ? 'text-[10px]' : 'text-xs'}`}>@{quotedAuthor}</span>
        </div>
        <p className={`text-gray-700 dark:text-gray-300 ${compact ? 'text-xs line-clamp-1' : 'text-sm line-clamp-2'}`}>
          {quotedText.replace(/\s*https:\/\/t\.co\/\w+$/g, '').trim()}
        </p>
        {quotedIsArticle && (
          <div className={`flex items-center gap-1 mt-1 text-blue-500 ${compact ? 'text-[10px]' : 'text-xs'}`}>
            <FileText className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
            <span className="truncate">
              {quotedTweet?.articlePreview?.title || quoteContext?.article?.title || 'X Article'}
            </span>
          </div>
        )}
      </div>
    </button>
  )
}

// Quote tweet content with embedded QuoteCard - shows quoting text then embedded quoted tweet
function TextQuoteContent({
  item,
  bionicReading,
  onNavigateToId
}: {
  item: FeedItem
  bionicReading: boolean
  onNavigateToId?: (id: string, fallbackUrl?: string) => boolean
}): React.ReactElement {
  const renderText = bionicReading ? renderBionicTextWithLinks : renderTextWithLinks
  const quotedTweet = item.quotedTweet
  const quoteContext = item.quoteContext

  // If we have neither, show a fallback
  if (!quotedTweet && !quoteContext) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-center py-8">
        Quote data unavailable
      </div>
    )
  }

  // Build quoted tweet data from either source
  const quotedAuthor = quotedTweet?.author || quoteContext?.author || ''
  const quotedAuthorName = quotedTweet?.authorName || quoteContext?.authorName || quotedAuthor
  const quotedProfileImage = quotedTweet?.authorProfileImageUrl || quoteContext?.authorProfileImageUrl
  const quotedText = quotedTweet?.text || quoteContext?.text || ''
  const quotedTweetId = quotedTweet?.id || quoteContext?.tweetId || ''
  const quotedTweetUrl = quotedTweet?.tweetUrl || (quoteContext ? `https://x.com/${quoteContext.author}/status/${quoteContext.tweetId}` : '#')

  // Check for media/article in quoted tweet
  const quotedIsArticle = quotedTweet?.category === 'article' || quotedTweet?.articlePreview || quoteContext?.article
  const thumbnail = getQuoteThumbnail(quotedTweet, quoteContext)

  // Handle quote card click - navigate internally or open externally
  const handleQuoteCardClick = (): void => {
    if (quotedTweetId && onNavigateToId) {
      // Pass fallbackUrl so parent can open externally if not in collection
      onNavigateToId(quotedTweetId, quotedTweetUrl)
    }
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto pr-2 -mr-2 article-scrollbar pb-4">
      {/* Main tweet (quoting) - strip trailing t.co link */}
      <div className="mb-4">
        <p className="text-gray-900 dark:text-white text-lg leading-relaxed">
          {renderText(item.text.replace(/\s*https:\/\/t\.co\/\w+$/g, '').trim())}
        </p>
      </div>

      {/* Embedded QuoteCard with thumbnail */}
      <button
        onClick={handleQuoteCardClick}
        className="w-full text-left bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-3 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors flex gap-3"
      >
        {/* Thumbnail (120x80) */}
        {thumbnail && (
          <div className="w-[120px] h-[80px] rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
            <img
              src={thumbnail}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {quotedProfileImage ? (
              <img
                src={quotedProfileImage}
                alt={quotedAuthor}
                className="w-5 h-5 rounded-full object-cover"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-semibold">
                {quotedAuthor?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{quotedAuthorName}</span>
            <span className="text-xs text-gray-500">@{quotedAuthor}</span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
            {quotedText.replace(/\s*https:\/\/t\.co\/\w+$/g, '').trim()}
          </p>
          {quotedIsArticle && (
            <div className="flex items-center gap-1 mt-1 text-xs text-blue-500">
              <FileText className="w-3 h-3" />
              <span className="truncate">
                {quotedTweet?.articlePreview?.title || quoteContext?.article?.title || 'X Article'}
              </span>
            </div>
          )}
        </div>

        {/* External link indicator */}
        <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
      </button>

      {/* Keyboard hint */}
      <p className="text-xs text-gray-400 mt-2 text-center">Press Q to view quoted tweet</p>
    </div>
  )
}

function ArticleContent({ item, bionicReading }: { item: FeedItem; bionicReading: boolean }): React.ReactElement {
  const renderText = bionicReading ? renderBionicTextWithLinks : renderTextWithLinks

  return (
    <div className="max-h-[60vh] overflow-y-auto pr-2 -mr-2 article-scrollbar">
      {item.articlePreview?.imageUrl && (
        <div className="relative group mb-6">
          <img
            src={item.articlePreview.imageUrl}
            alt=""
            className="w-full rounded-xl object-cover max-h-64"
          />
          {/* Share/Download button - visible on mobile, hover on desktop */}
          <div className="absolute top-3 right-3">
            <MediaShareButton
              url={item.articlePreview!.imageUrl!}
              filename={`article-${item.id}.jpg`}
              mimeType="image/jpeg"
            />
          </div>
        </div>
      )}
      {item.articlePreview?.title && (
        <h2 className="text-gray-900 dark:text-white text-2xl font-bold mb-4 leading-tight">{item.articlePreview.title}</h2>
      )}
      {item.articleContent && item.articleContent.blocks?.length > 0 ? (
        <div className="space-y-2 mb-6">
          {item.articleContent.blocks.map((block, i) =>
            renderArticleBlock(block, item.articleContent?.entityMap, i, item.articleContent?.mediaEntities, bionicReading)
          )}
        </div>
      ) : (
        <p className="text-gray-700 dark:text-white/80 text-base mb-6 leading-relaxed">{renderText(item.text)}</p>
      )}
    </div>
  )
}
