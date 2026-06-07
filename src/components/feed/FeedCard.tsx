'use client'

import { useState, useEffect } from 'react'
import { Image, Play, Check, FileText, Share2 } from 'lucide-react'
import { AuthorAvatar } from './AuthorAvatar'
import {
  renderTextWithLinks,
  renderBionicTextWithLinks,
  stripMediaUrls,
  copyPreviewLink,
} from './utils'
import { usePreferences } from '@/lib/preferences-context'
import { formatDurationMs, formatCompactRelativeTime } from '@/lib/utils/format'
import { TypeBadge, PlatformChip, type ContentType, type PlatformId } from '@/components/matter'
import { cn } from '@/lib/utils'
import type { FeedItem } from './types'

interface FeedCardProps {
  item: FeedItem
  lastSyncAt: string | null
  sortField: 'processedAt' | 'createdAt'
  onExpand: () => void
}

/** Time pill — mono white on translucent black, for media/article overlays. */
function TimePill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'font-mono text-[11px] text-white bg-black/55 backdrop-blur rounded-full px-2 py-0.5',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function FeedCard({
  item,
  lastSyncAt,
  sortField,
  onExpand,
}: FeedCardProps): React.ReactElement {
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  // Hover affordances (video autoplay + the share overlay) are desktop-only.
  // On touch the browser emulates :hover on the FIRST tap, revealing the overlay
  // and swallowing that tap — which is why opening took two taps. Gate them to
  // hover-capable devices so a tap just opens the item.
  const [canHover, setCanHover] = useState(false)
  useEffect(() => {
    setCanHover(window.matchMedia('(hover: hover)').matches)
  }, [])
  const [copiedLink, setCopiedLink] = useState(false)
  const { preferences } = usePreferences()
  const renderText = preferences.bionicReading ? renderBionicTextWithLinks : renderTextWithLinks

  const hasMedia = item.media && item.media.length > 0
  const primaryMedia = hasMedia ? item.media![0] : null
  const isVideo = primaryMedia?.mediaType === 'video' || primaryMedia?.mediaType === 'animated_gif'
  const isArticle = item.category === 'article'
  const isQuote = item.isQuote && item.quoteContext
  const isNew = lastSyncAt && item.processedAt >= lastSyncAt

  const articleLink = isArticle ? item.links?.[0] : null
  const articleDomain =
    articleLink?.domain ||
    (articleLink?.expandedUrl ? new URL(articleLink.expandedUrl).hostname : null)

  const aspectRatio =
    primaryMedia?.width && primaryMedia?.height ? primaryMedia.width / primaryMedia.height : 1

  const newGlowClass =
    isNew && !isHovered
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
    <div className="mb-4 break-inside-avoid transition-all duration-300">
      <div
        className={cn(
          'group relative bg-surface border border-hairline rounded-card shadow-m-sm overflow-hidden cursor-pointer',
          'hover:shadow-m-md transition-shadow duration-150',
          newGlowClass,
        )}
        onClick={onExpand}
        onMouseEnter={canHover ? () => setIsHovered(true) : undefined}
        onMouseLeave={canHover ? () => setIsHovered(false) : undefined}
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

        {/* Hover overlay — desktop only (see canHover). Rendering it on touch
            would make the first tap reveal it instead of opening the item. */}
        {canHover && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center gap-2">
                <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="sm" />
                <span className="text-white text-xs font-medium truncate flex-1">
                  @{item.author}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    copyPreviewLink(item).then((ok) => {
                      if (ok) {
                        setCopiedLink(true)
                        setTimeout(() => setCopiedLink(false), 1500)
                      }
                    })
                  }}
                  className={cn(
                    'p-2 rounded-full pointer-events-auto text-white transition-all duration-200',
                    copiedLink ? 'bg-done scale-110 shadow-lg' : 'bg-clay hover:opacity-90',
                  )}
                  title={copiedLink ? 'Link copied!' : 'Copy link to this post'}
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}
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

  // Caption text shown over the media bottom (white, 2 lines, scrim). Hidden when empty.
  const caption = stripMediaUrls(item.text || '', true).trim()
  const imageCount = item.media?.length ?? 0
  const hasDuration = isVideo && !!primaryMedia.durationMs
  const cornerBadge = hasDuration || (!isVideo && imageCount > 1)

  // Hover preview only works for Twitter (its proxy exposes a 360p `quality=preview`
  // tier). Instagram/TikTok proxies serve a single quality, so for non-Twitter
  // we keep the thumbnail on hover instead of swapping to the heavier stream.
  const hoverVideoUrl =
    item.platform === 'twitter' || !item.platform
      ? `/api/media/video?author=${item.author}&tweetId=${item.id}&quality=preview`
      : null

  return (
    <div className="relative">
      {isVideo && isHovered && hoverVideoUrl ? (
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
        <img
          src={primaryMedia.thumbnailUrl}
          alt=""
          className={cn(
            mediaClass,
            !isVideo && 'transition-opacity',
            !isVideo && (loaded ? 'opacity-100' : 'opacity-0'),
          )}
          style={arStyle}
          onLoad={onLoad}
          referrerPolicy="no-referrer"
          loading={isVideo ? undefined : 'lazy'}
          onError={(e) => {
            const el = e.currentTarget
            if (primaryMedia.originalUrl && !el.dataset.fellBack) {
              el.dataset.fellBack = '1'
              el.src = primaryMedia.originalUrl
              return
            }
            onError()
          }}
        />
      )}
      {!isVideo && !loaded && <div className="absolute inset-0 bg-inset animate-pulse" />}

      {/* Caption scrim (only when there's caption text) */}
      {caption && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(transparent 40%, rgba(11,11,17,.84))' }}
          aria-hidden
        />
      )}

      {/* Centered play button (video, not while hover-previewing) */}
      {isVideo && !(isHovered && hoverVideoUrl) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-black/[0.42] backdrop-blur border border-white/50 flex items-center justify-center">
            <Play className="h-6 w-6 text-white ml-1" fill="white" />
          </div>
        </div>
      )}

      <MediaOverlays platform={platform} badgeType={badgeType} timeBadge={timeBadge} />

      {/* Duration / multi-image pill (bottom-right) */}
      {hasDuration && (
        <span className="absolute bottom-2.5 right-2.5 font-mono text-[11px] text-white bg-black/60 rounded-full px-2 py-0.5">
          {formatDurationMs(primaryMedia.durationMs!)}
        </span>
      )}
      {!isVideo && imageCount > 1 && (
        <span className="absolute bottom-2.5 right-2.5 font-mono text-[11px] text-white bg-black/60 rounded-full px-2 py-0.5">
          1/{imageCount}
        </span>
      )}

      {/* Caption overlay (up to 2 lines). The clamp lives on the inner <p> with
          no padding of its own — putting the bottom padding on the clamp box
          itself lets a clipped 3rd line peek through the padding zone. */}
      {caption && (
        <div
          className={cn(
            'absolute left-0 right-0 bottom-0 px-3.5 pb-3 pt-8',
            cornerBadge && 'pr-14',
          )}
        >
          <p className="text-white font-medium text-[13.5px] leading-snug line-clamp-2 [text-shadow:0_1px_3px_rgba(0,0,0,.55)]">
            {caption}
          </p>
        </div>
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
      <TimePill className="absolute top-2.5 right-2.5 group-hover:opacity-0 transition-opacity">
        {timeBadge}
      </TimePill>
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
  const cover = item.articlePreview?.imageUrl
  const domain = item.articlePreview?.domain || articleDomain
  const title = item.articlePreview?.title || item.text || domain || 'Article'

  // With cover: image fills the card, serif title overlaid over a dark scrim.
  if (cover) {
    return (
      <div className="relative">
        <img
          src={cover}
          alt=""
          className="w-full aspect-[16/10] object-cover bg-black"
          referrerPolicy="no-referrer"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(transparent 32%, rgba(11,11,17,.86))' }}
          aria-hidden
        />
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <TypeBadge type="article" />
          <PlatformChip platform={platform} />
        </div>
        <TimePill className="absolute top-2.5 right-2.5">{timeBadge}</TimePill>
        <div className="absolute left-0 right-0 bottom-0 px-4 pb-3.5 pt-8">
          <h3 className="font-serif font-semibold text-[17px] leading-tight text-white line-clamp-3 [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">
            {title}
          </h3>
        </div>
      </div>
    )
  }

  // No cover: accent-tinted gradient fallback with a faint file-text watermark.
  return (
    <div className="relative overflow-hidden p-4 bg-gradient-to-br from-clay/[0.14] to-surface">
      <FileText
        className="absolute -right-[18px] -bottom-5 w-[110px] h-[110px] text-clay/[0.13]"
        aria-hidden
      />
      <div className="relative flex items-center gap-1.5 mb-3">
        <TypeBadge type="article" />
        <PlatformChip platform={platform} />
      </div>
      <h3 className="relative font-serif font-semibold text-[17px] leading-tight text-ink line-clamp-3">
        {title}
      </h3>
    </div>
  )
}

type RenderTextFn = (text: string, className?: string) => React.ReactNode

/** Tweet-style header for text + quote cards: avatar + name + @handle·time, platform chip. */
function CardHeader({
  item,
  platform,
  timeBadge,
}: {
  item: FeedItem
  platform: PlatformId
  timeBadge: string
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <AuthorAvatar src={item.authorProfileImageUrl} author={item.author} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="font-bold text-[13.5px] text-ink truncate">
          {item.authorName || item.author || 'Saved post'}
        </div>
        <div className="font-mono text-[11.5px] text-ink-3 truncate">
          @{item.author}
          {timeBadge ? ` · ${timeBadge}` : ''}
        </div>
      </div>
      <PlatformChip platform={platform} />
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
      <CardHeader item={item} platform={platform} timeBadge={timeBadge} />
      <div className="text-[14px] text-ink leading-normal whitespace-pre-line">
        {renderText(item.text)}
      </div>
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
      <CardHeader item={item} platform={platform} timeBadge={timeBadge} />
      <div className="text-[14px] text-ink leading-normal whitespace-pre-line line-clamp-[12]">
        {renderText(item.text)}
      </div>
    </div>
  )
}
