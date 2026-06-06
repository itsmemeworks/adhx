'use client'

import { useState } from 'react'
import { Image, Play, Link as LinkIcon, Check, EyeOff, Instagram, Youtube } from 'lucide-react'
import { AuthorAvatar } from './AuthorAvatar'
import { renderTextWithLinks, renderBionicTextWithLinks } from './utils'
import { usePreferences } from '@/lib/preferences-context'
import { formatDurationMs, formatCompactRelativeTime } from '@/lib/utils/format'
import type { FeedItem } from './types'

/**
 * Inline TikTok glyph — lucide doesn't ship one. Sized to match the lucide
 * Instagram icon for visual parity in the platform badge.
 */
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743 2.896 2.896 0 0 1 2.342-4.585c.28 0 .55.04.808.115V9.435a6.327 6.327 0 0 0-.808-.051 6.272 6.272 0 0 0-6.272 6.272A6.272 6.272 0 0 0 9.515 22h.005a6.272 6.272 0 0 0 6.272-6.272V8.687a8.182 8.182 0 0 0 4.773 1.526V6.78a4.795 4.795 0 0 1-.976-.094z" />
    </svg>
  )
}

/** Small platform badge overlay (top-right of FeedCard) for non-Twitter items. */
function PlatformBadge({ platform }: { platform: FeedItem['platform'] }) {
  if (!platform || platform === 'twitter') return null

  if (platform === 'instagram') {
    return (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white"
        style={{
          background:
            'linear-gradient(135deg, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
        }}
        title="Instagram"
      >
        <Instagram className="w-3 h-3" />
      </span>
    )
  }

  if (platform === 'tiktok') {
    return (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-black text-white"
        title="TikTok"
      >
        <TikTokIcon className="w-3 h-3" />
      </span>
    )
  }

  if (platform === 'youtube') {
    return (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white"
        title="YouTube"
      >
        <Youtube className="w-3 h-3" />
      </span>
    )
  }

  return null
}

interface FeedCardProps {
  item: FeedItem
  lastSyncAt: string | null
  sortField: 'processedAt' | 'createdAt'
  onExpand: () => void
  onMarkRead: () => void
  unreadOnly?: boolean
  onRemove?: () => void
}

// Noise texture SVG for text cards
const NOISE_TEXTURE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`

export function FeedCard({
  item,
  lastSyncAt,
  sortField,
  onExpand,
  onMarkRead,
  unreadOnly,
  onRemove,
}: FeedCardProps): React.ReactElement {
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [showDopamine, setShowDopamine] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const { preferences } = usePreferences()
  const renderText = preferences.bionicReading ? renderBionicTextWithLinks : renderTextWithLinks

  const hasMedia = item.media && item.media.length > 0
  const primaryMedia = hasMedia ? item.media![0] : null
  const isVideo = primaryMedia?.mediaType === 'video' || primaryMedia?.mediaType === 'animated_gif'
  const isGif = primaryMedia?.mediaType === 'animated_gif'
  const isArticle = item.category === 'article'
  const isQuote = item.isQuote && item.quoteContext
  const isNew = lastSyncAt && item.processedAt >= lastSyncAt

  const articleLink = isArticle ? item.links?.[0] : null
  const articleDomain = articleLink?.domain || (articleLink?.expandedUrl ? new URL(articleLink.expandedUrl).hostname : null)

  const aspectRatio = primaryMedia?.width && primaryMedia?.height ? primaryMedia.width / primaryMedia.height : 1

  function handleMarkReadWithAnimation(e: React.MouseEvent): void {
    e.stopPropagation()

    if (item.isRead) {
      onMarkRead()
      return
    }

    setShowDopamine(true)
    setTimeout(() => onMarkRead(), 150)

    if (unreadOnly && onRemove) {
      setTimeout(() => setIsExiting(true), 400)
      setTimeout(() => onRemove(), 700)
    } else {
      setTimeout(() => setShowDopamine(false), 800)
    }
  }

  const newGlowClass = isNew && !isHovered
    ? 'shadow-[0_0_8px_2px_rgba(245,158,11,0.4),0_0_20px_4px_rgba(245,158,11,0.25),0_0_35px_8px_rgba(245,158,11,0.1)] dark:shadow-[0_0_8px_2px_rgba(250,204,21,0.4),0_0_20px_4px_rgba(250,204,21,0.25),0_0_35px_8px_rgba(250,204,21,0.1)]'
    : ''

  const timeDate = sortField === 'createdAt' && item.createdAt ? item.createdAt : item.processedAt
  const timeBadge = formatCompactRelativeTime(timeDate)

  // Category label for gallery display
  const categoryLabel = item.platform === 'instagram' ? 'Reel'
    : item.platform === 'tiktok' ? 'TikTok'
    : item.platform === 'youtube' ? 'Short'
    : item.isXArticle ? 'X Article'
    : isArticle ? 'Article'
    : isGif ? 'GIF'
    : isVideo ? 'Video'
    : isQuote ? 'Quote'
    : hasMedia ? (item.media!.length > 1 ? 'Photos' : 'Photo')
    : 'Text'

  return (
    <div className={`mb-4 break-inside-avoid transition-all duration-300 ${isExiting ? 'opacity-0 scale-95 -translate-y-2' : ''}`}>
      <div
        className={`group relative rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer transition-shadow duration-300 ${newGlowClass}`}
        onClick={onExpand}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Top gradient overlay with badges */}
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent z-[5] group-hover:opacity-0 transition-opacity pointer-events-none">
          <div className="flex items-start justify-between p-3">
            <span className="flex items-center gap-1.5">
              <PlatformBadge platform={item.platform} />
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-white/20 text-white rounded-full">
                {categoryLabel}
              </span>
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 bg-white/20 text-white rounded-full">
              {timeBadge}
            </span>
          </div>
        </div>

        {/* Content based on type */}
        {hasMedia && primaryMedia ? (
          <MediaContent
            item={item}
            primaryMedia={primaryMedia}
            isVideo={isVideo}
            aspectRatio={aspectRatio}
            isHovered={isHovered}
            error={error}
            loaded={loaded}
            onError={() => setError(true)}
            onLoad={() => setLoaded(true)}
          />
        ) : isArticle && (articleLink || item.articlePreview) ? (
          <ArticleCardContent item={item} articleDomain={articleDomain} />
        ) : isQuote && item.quoteContext ? (
          <QuoteCardContent item={item} renderText={renderText} />
        ) : (
          <TextCardContent item={item} renderText={renderText} />
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center gap-2">
              <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="sm" />
              <span className="text-white text-xs font-medium truncate flex-1">@{item.author}</span>
              <button
                onClick={handleMarkReadWithAnimation}
                className={`p-2 rounded-full pointer-events-auto transition-all duration-200 ${
                  showDopamine
                    ? 'bg-green-500 text-white scale-125 shadow-lg shadow-green-500/50'
                    : item.isRead
                      ? 'bg-gray-600 hover:bg-gray-500 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
                title={item.isRead ? 'Mark as unread' : 'Mark as read'}
              >
                {item.isRead ? <EyeOff className="w-4 h-4" /> : <Check className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface MediaContentProps {
  item: FeedItem
  primaryMedia: NonNullable<FeedItem['media']>[0]
  isVideo: boolean
  aspectRatio: number
  isHovered: boolean
  error: boolean
  loaded: boolean
  onError: () => void
  onLoad: () => void
}

function MediaContent({ item, primaryMedia, isVideo, aspectRatio, isHovered, error, loaded, onError, onLoad }: MediaContentProps): React.ReactElement {
  const style = { aspectRatio: aspectRatio > 0.5 && aspectRatio < 2 ? aspectRatio : 1 }

  if (error) {
    return (
      <div className="w-full aspect-square flex items-center justify-center">
        <Image className="h-8 w-8 text-gray-400" />
      </div>
    )
  }

  if (isVideo) {
    // Hover preview only works for Twitter (its proxy exposes a 360p `quality=preview`
    // tier). Instagram/TikTok proxies serve a single quality, so for non-Twitter
    // we keep the thumbnail on hover instead of swapping to the heavier stream.
    const hoverVideoUrl =
      item.platform === 'twitter' || !item.platform
        ? `/api/media/video?author=${item.author}&tweetId=${item.id}&quality=preview`
        : null
    return (
      <div className="relative">
        {isHovered && hoverVideoUrl ? (
          <video
            src={hoverVideoUrl}
            muted
            loop
            playsInline
            autoPlay
            className="w-full object-cover bg-black"
            style={style}
          />
        ) : (
          <>
            <img
              src={primaryMedia.thumbnailUrl}
              alt=""
              className="w-full object-cover bg-black"
              style={style}
              referrerPolicy="no-referrer"
              onError={onError}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-12 h-12 bg-black/60 rounded-full flex items-center justify-center">
                <Play className="h-6 w-6 text-white ml-1" fill="white" />
              </div>
            </div>
            {/* Video duration badge */}
            {primaryMedia.durationMs && (
              <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-medium px-1.5 py-0.5 rounded">
                {formatDurationMs(primaryMedia.durationMs)}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  const imageCount = item.media?.length ?? 0

  return (
    <div className="relative">
      <img
        src={primaryMedia.thumbnailUrl}
        alt=""
        className={`w-full object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        style={style}
        onLoad={onLoad}
        onError={onError}
        loading="lazy"
      />
      {!loaded && <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse" />}
      {/* Multi-image badge */}
      {imageCount > 1 && (
        <div className="absolute top-10 right-4 bg-black/70 text-white text-xs font-medium px-2 py-0.5 rounded-full">
          1/{imageCount}
        </div>
      )}
    </div>
  )
}

function ArticleCardContent({ item, articleDomain }: { item: FeedItem; articleDomain: string | null }): React.ReactElement {
  return (
    <div className="relative min-h-[200px] overflow-hidden">
      {item.articlePreview?.imageUrl ? (
        <div className="absolute inset-0">
          <img src={item.articlePreview.imageUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/30" />
        </div>
      ) : item.isXArticle ? (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
          {/* Subtle noise texture */}
          <div
            className="absolute inset-0 opacity-[0.15] mix-blend-overlay"
            style={{ backgroundImage: NOISE_TEXTURE, backgroundSize: '100px 100px' }}
          />
          {/* Subtle diagonal lines pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `repeating-linear-gradient(
                45deg,
                transparent,
                transparent 10px,
                rgba(255,255,255,0.5) 10px,
                rgba(255,255,255,0.5) 11px
              )`,
            }}
          />
          {/* Subtle glow accent */}
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600" />
      )}
      <div className="relative p-4 pt-8 h-full flex flex-col">
        {!item.isXArticle && (
          <div className="flex items-center gap-2 mb-2">
            <LinkIcon className="w-3.5 h-3.5 text-white/70" />
            <a
              href={item.articlePreview?.url || item.links?.[0]?.expandedUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-white/70 font-medium hover:text-white hover:underline truncate"
            >
              {item.articlePreview?.domain || articleDomain}
            </a>
          </div>
        )}
        {item.articlePreview?.title && (
          <h3 className="text-white font-semibold text-sm line-clamp-2 mb-1">{item.articlePreview.title}</h3>
        )}
        <p className="text-white/80 text-xs line-clamp-3 flex-1">
          {item.articlePreview?.description || item.text}
        </p>
      </div>
    </div>
  )
}

type RenderTextFn = (text: string, className?: string) => React.ReactNode

function QuoteCardContent({ item, renderText }: { item: FeedItem; renderText: RenderTextFn }): React.ReactElement {
  return (
    <div className="relative p-4 pt-8 bg-white dark:bg-gradient-to-br dark:from-gray-700 dark:to-gray-900 min-h-[200px]">
      <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.08] pointer-events-none" style={{ backgroundImage: NOISE_TEXTURE }} />
      <div className="relative z-10">
        <p className="text-gray-800 dark:text-white text-sm mb-3 line-clamp-3">{renderText(item.text)}</p>
        <div className="bg-gray-100 dark:bg-white/10 rounded-lg p-3">
          <p className="text-gray-600 dark:text-white/80 text-xs mb-1">@{item.quoteContext!.author}</p>
          <p className="text-gray-500 dark:text-white/70 text-xs line-clamp-2">{item.quoteContext!.text && renderText(item.quoteContext!.text)}</p>
        </div>
      </div>
    </div>
  )
}

function TextCardContent({ item, renderText }: { item: FeedItem; renderText: RenderTextFn }): React.ReactElement {
  return (
    <div className="relative p-4 pt-8 bg-white dark:bg-gradient-to-br dark:from-gray-800 dark:to-gray-900 min-h-[150px] max-h-[300px] overflow-hidden">
      <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.08] pointer-events-none" style={{ backgroundImage: NOISE_TEXTURE }} />
      <div className="relative z-10">
        <p className="text-gray-800 dark:text-white text-sm leading-relaxed line-clamp-[12]">{renderText(item.text)}</p>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white dark:from-gray-900 to-transparent pointer-events-none" />
    </div>
  )
}
