'use client'

import { useState } from 'react'
import { Image, Play, Check, EyeOff } from 'lucide-react'
import { AuthorAvatar } from './AuthorAvatar'
import { renderTextWithLinks, renderBionicTextWithLinks } from './utils'
import { usePreferences } from '@/lib/preferences-context'
import { formatDurationMs, formatCompactRelativeTime } from '@/lib/utils/format'
import { TypeBadge, PlatformChip, PlatformGlyph, type ContentType, type PlatformId } from '@/components/matter'
import { cn } from '@/lib/utils'
import type { FeedItem } from './types'

interface FeedCardProps {
  item: FeedItem
  lastSyncAt: string | null
  sortField: 'processedAt' | 'createdAt'
  onExpand: () => void
  onMarkRead: () => void
  unreadOnly?: boolean
  onRemove?: () => void
}

/** Time pill — mono white on translucent black, for media/article overlays. */
function TimePill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('font-mono text-[11px] text-white bg-black/55 backdrop-blur rounded-full px-2 py-0.5', className)}>
      {children}
    </span>
  )
}

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
    ? 'shadow-[0_0_8px_2px_rgba(194,96,63,0.4),0_0_20px_4px_rgba(194,96,63,0.22),0_0_35px_8px_rgba(194,96,63,0.1)]'
    : ''

  const timeDate = sortField === 'createdAt' && item.createdAt ? item.createdAt : item.processedAt
  const timeBadge = formatCompactRelativeTime(timeDate)

  // Map content to a Matter TypeBadge type.
  const badgeType: ContentType = isArticle
    ? 'article'
    : isVideo
      ? 'video'
      : hasMedia
        ? 'photo'
        : isQuote
          ? 'quote'
          : 'text'

  // Platform glyph: twitter renders X; others render their own glyph.
  const platform = (item.platform || 'twitter') as PlatformId

  return (
    <div className={`mb-4 break-inside-avoid transition-all duration-300 ${isExiting ? 'opacity-0 scale-95 -translate-y-2' : ''}`}>
      <div
        className={cn(
          'group relative bg-surface border border-hairline rounded-card shadow-m-sm overflow-hidden cursor-pointer',
          'hover:shadow-m-md transition-shadow duration-150',
          newGlowClass,
        )}
        onClick={onExpand}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
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
            badgeType={badgeType}
            platform={platform}
            timeBadge={timeBadge}
            onError={() => setError(true)}
            onLoad={() => setLoaded(true)}
          />
        ) : isArticle && (articleLink || item.articlePreview) ? (
          <ArticleCardContent
            item={item}
            articleDomain={articleDomain}
            platform={platform}
            timeBadge={timeBadge}
          />
        ) : isQuote && item.quoteContext ? (
          <QuoteCardContent
            item={item}
            renderText={renderText}
            platform={platform}
            timeBadge={timeBadge}
          />
        ) : (
          <TextCardContent
            item={item}
            renderText={renderText}
            platform={platform}
            timeBadge={timeBadge}
          />
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center gap-2">
              <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="sm" />
              <span className="text-white text-xs font-medium truncate flex-1">@{item.author}</span>
              <button
                onClick={handleMarkReadWithAnimation}
                className={cn(
                  'p-2 rounded-full pointer-events-auto transition-all duration-200',
                  showDopamine
                    ? 'bg-clay text-white scale-125 shadow-lg'
                    : item.isRead
                      ? 'bg-black/50 hover:bg-black/40 text-white'
                      : 'bg-clay hover:opacity-90 text-white',
                )}
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
  badgeType: ContentType
  platform: PlatformId
  timeBadge: string
  onError: () => void
  onLoad: () => void
}

function MediaContent({
  item,
  primaryMedia,
  isVideo,
  aspectRatio,
  isHovered,
  error,
  loaded,
  badgeType,
  platform,
  timeBadge,
  onError,
  onLoad,
}: MediaContentProps): React.ReactElement {
  // Natural aspect on mobile, fixed 4/3 on desktop (sm+).
  const naturalAspect = aspectRatio > 0.5 && aspectRatio < 2 ? aspectRatio : 1
  const mediaClass = 'w-full object-cover bg-black aspect-[var(--m-ar)] sm:aspect-[4/3]'
  const arStyle = { ['--m-ar' as string]: String(naturalAspect) } as React.CSSProperties

  if (error) {
    return (
      <div className="w-full aspect-[4/3] flex items-center justify-center bg-inset">
        <Image className="h-8 w-8 text-ink-3" />
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
            className={mediaClass}
            style={arStyle}
          />
        ) : (
          <>
            <img
              src={primaryMedia.thumbnailUrl}
              alt=""
              className={mediaClass}
              style={arStyle}
              referrerPolicy="no-referrer"
              onError={onError}
            />
            {/* Centered play button */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-14 h-14 rounded-full bg-black/[0.42] backdrop-blur border border-white/50 flex items-center justify-center">
                <Play className="h-6 w-6 text-white ml-1" fill="white" />
              </div>
            </div>
            {/* Duration pill */}
            {primaryMedia.durationMs && (
              <span className="absolute bottom-2.5 right-2.5 font-mono text-[11px] text-white bg-black/60 rounded-full px-2 py-0.5">
                {formatDurationMs(primaryMedia.durationMs)}
              </span>
            )}
          </>
        )}
        <MediaOverlays platform={platform} badgeType={badgeType} timeBadge={timeBadge} />
      </div>
    )
  }

  const imageCount = item.media?.length ?? 0

  return (
    <div className="relative">
      <img
        src={primaryMedia.thumbnailUrl}
        alt=""
        className={cn(mediaClass, 'transition-opacity', loaded ? 'opacity-100' : 'opacity-0')}
        style={arStyle}
        onLoad={onLoad}
        onError={onError}
        loading="lazy"
      />
      {!loaded && <div className="absolute inset-0 bg-inset animate-pulse" />}
      <MediaOverlays platform={platform} badgeType={badgeType} timeBadge={timeBadge} />
      {/* Multi-image count badge */}
      {imageCount > 1 && (
        <span className="absolute bottom-2.5 right-2.5 font-mono text-[11px] text-white bg-black/60 rounded-full px-2 py-0.5">
          1/{imageCount}
        </span>
      )}
    </div>
  )
}

/** Shared top-left (type + platform) and top-right (time) overlays for media tiles. */
function MediaOverlays({
  platform,
  badgeType,
  timeBadge,
}: {
  platform: PlatformId
  badgeType: ContentType
  timeBadge: string
}): React.ReactElement {
  return (
    <>
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 group-hover:opacity-0 transition-opacity">
        <TypeBadge type={badgeType} />
        <PlatformChip platform={platform} />
      </div>
      <TimePill className="absolute top-2.5 right-2.5 group-hover:opacity-0 transition-opacity">{timeBadge}</TimePill>
    </>
  )
}

function ArticleCardContent({
  item,
  articleDomain,
  platform,
  timeBadge,
}: {
  item: FeedItem
  articleDomain: string | null
  platform: PlatformId
  timeBadge: string
}): React.ReactElement {
  const title = item.articlePreview?.title
  const excerpt = item.articlePreview?.description || item.text
  const domain = item.articlePreview?.domain || articleDomain

  return (
    <div>
      {/* Dark image band */}
      <div className="relative h-[120px] overflow-hidden bg-black">
        {item.articlePreview?.imageUrl && (
          <img src={item.articlePreview.imageUrl} alt="" className="w-full h-full object-cover opacity-55" />
        )}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <TypeBadge type="article" />
          <PlatformChip platform={platform} />
        </div>
        <TimePill className="absolute top-2.5 right-2.5">{timeBadge}</TimePill>
      </div>
      {/* Body on surface */}
      <div className="bg-surface pt-[13px] px-[15px] pb-[15px]">
        {title ? (
          <h3 className="font-serif font-semibold text-[16px] leading-tight text-ink mb-1.5 line-clamp-2">{title}</h3>
        ) : (
          domain && <div className="font-mono text-[11px] text-ink-3 mb-1.5 truncate">{domain}</div>
        )}
        <p className="text-[13px] text-ink-2 leading-snug line-clamp-2">{excerpt}</p>
      </div>
    </div>
  )
}

type RenderTextFn = (text: string, className?: string) => React.ReactNode

/** Header row shared by text + quote cards: type badge left, platform glyph + time right. */
function CardHeader({
  type,
  platform,
  timeBadge,
}: {
  type: ContentType
  platform: PlatformId
  timeBadge: string
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between mb-3">
      <TypeBadge type={type} />
      <span className="flex items-center gap-1.5">
        <PlatformGlyph platform={platform} size={13} className="text-ink-3" />
        <span className="font-mono text-[11px] text-ink-3">{timeBadge}</span>
      </span>
    </div>
  )
}

function QuoteCardContent({
  item,
  renderText,
  platform,
  timeBadge,
}: {
  item: FeedItem
  renderText: RenderTextFn
  platform: PlatformId
  timeBadge: string
}): React.ReactElement {
  return (
    <div className="bg-surface p-4">
      <CardHeader type="quote" platform={platform} timeBadge={timeBadge} />
      <div className="text-[14px] text-ink leading-normal whitespace-pre-line">{renderText(item.text)}</div>
      <div className="bg-inset border border-hairline rounded-[10px] pt-[11px] px-[13px] pb-[11px] mt-3">
        <div className="text-clay font-bold text-[12.5px] mb-0.5">@{item.quoteContext!.author}</div>
        <div className="text-[12.5px] text-ink-2 leading-snug line-clamp-2">
          {item.quoteContext!.text && renderText(item.quoteContext!.text)}
        </div>
      </div>
    </div>
  )
}

function TextCardContent({
  item,
  renderText,
  platform,
  timeBadge,
}: {
  item: FeedItem
  renderText: RenderTextFn
  platform: PlatformId
  timeBadge: string
}): React.ReactElement {
  return (
    <div className="bg-surface p-4">
      <CardHeader type="text" platform={platform} timeBadge={timeBadge} />
      <div className="text-[14px] text-ink leading-normal whitespace-pre-line line-clamp-[12]">
        {renderText(item.text)}
      </div>
    </div>
  )
}
