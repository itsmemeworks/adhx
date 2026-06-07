'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Sparkles, Play, Zap, Eye, Maximize2, Minimize2, Bookmark, Link2, Loader2, Download, Share2, Check } from 'lucide-react'
import { type FxTwitterResponse } from '@/lib/media/fxembed'
import { renderArticleBlock, renderTextWithLinks, handleShareMedia, isTouchDevice, VideoDownloadBlocked } from '@/components/feed/utils'
import { normalizeEntityMap } from '@/lib/utils/article-text'
import { VideoPlayer as SmartVideoPlayer } from '@/components/feed/VideoPlayer'
import type { ArticleEntityMap } from '@/components/feed/types'
import { FONT_OPTIONS, type BodyFont } from '@/lib/preferences-context'
import Link from 'next/link'
import { MatterLogo, PlatformGlyph, ConnectWithX } from '@/components/matter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { AnimatedBackground, LandingAnimations } from '@/components/landing'
import { formatCount, formatRelativeTime } from '@/lib/utils/format'
import { cn } from '@/lib/utils'

/** Tweet type extracted from FxTwitterResponse */
type Tweet = NonNullable<FxTwitterResponse['tweet']>

interface TweetPreviewLandingProps {
  username: string
  tweetId: string
  tweet: Tweet
  isAuthenticated?: boolean
}

/** Reading tools panel for ADHD-friendly font and bionic reading controls */
interface ReadingToolsProps {
  bionicReading: boolean
  onBionicToggle: () => void
  selectedFont: BodyFont
  onFontChange: (font: BodyFont) => void
  className?: string
}

function ReadingTools({
  bionicReading,
  onBionicToggle,
  selectedFont,
  onFontChange,
  className,
}: ReadingToolsProps): React.ReactElement {
  return (
    <div className={cn('p-3 rounded-2xl bg-clay/10 border border-clay/20', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-clay">
          <Eye className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs font-semibold">Reading tools</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Bionic Reading Toggle */}
          <button
            onClick={onBionicToggle}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
              bionicReading ? 'bg-clay text-white' : 'bg-surface text-ink-2 hover:text-clay'
            )}
            title="Bolds first part of each word for easier reading"
          >
            Bionic
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-hairline" />

          {/* Font Selector */}
          <div className="flex items-center gap-0.5">
            {(Object.entries(FONT_OPTIONS) as [BodyFont, { name: string }][]).map(([key, { name }]) => (
              <button
                key={key}
                onClick={() => onFontChange(key)}
                className={cn(
                  'px-2 py-1 rounded-lg text-xs transition-colors',
                  selectedFont === key ? 'bg-clay text-white' : 'bg-surface text-ink-2 hover:text-clay'
                )}
                style={{ fontFamily: `var(--font-${key})` }}
                title={name}
              >
                Aa
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * MediaShareButton - Share/download button for media on landing page
 * - Mobile: Shows Share icon, always visible, opens native share sheet
 * - Desktop: Shows Download icon, appears on hover, downloads file
 */
interface MediaShareButtonProps {
  url: string
  filename: string
  mimeType?: string
  /** Use group-hover/img for multi-image galleries */
  useImageGroupHover?: boolean
  /** Called when video is too large for mobile download */
  onTooLargeForMobile?: (estimatedSize: number) => void
}

function MediaShareButton({ url, filename, mimeType = 'image/jpeg', useImageGroupHover = false, onTooLargeForMobile }: MediaShareButtonProps): React.ReactElement {
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

    if (result.tooLargeForMobile) {
      onTooLargeForMobile?.(result.estimatedSize || 0)
      return
    }

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

export function TweetPreviewLanding({ username, tweetId, tweet, isAuthenticated = false }: TweetPreviewLandingProps): React.ReactElement {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [bionicReading, setBionicReading] = useState(false)
  const [selectedFont, setSelectedFont] = useState<BodyFont>('ibm-plex')
  const [isExpanded, setIsExpanded] = useState(true)
  // For tweets WITH media, long text auto-collapses to 3 lines (expandable).
  const [mediaTextExpanded, setMediaTextExpanded] = useState(false)
  const [tweetUrl, setTweetUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const [shareStatus, setShareStatus] = useState<'idle' | 'shared' | 'copied'>('idle')
  const [contentOverflows, setContentOverflows] = useState(false)
  const articleRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Read localStorage preference on mount (SSR-safe)
  useEffect(() => {
    const collapsed = localStorage.getItem('adhx-preview-collapsed')
    if (collapsed === 'true') setIsExpanded(false)
  }, [])

  // Patterns for the "preview another link" field — accepts X, Instagram, TikTok & YouTube.
  const tweetUrlPattern = /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/(\w{1,15})\/status\/(\d+)/i
  const instagramUrlPattern = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/i
  const tiktokUrlPattern = /(?:https?:\/\/)?(?:www\.|vm\.|m\.)?tiktok\.com\/@([A-Za-z0-9._]{1,30})\/video\/(\d{6,25})/i
  const youtubeUrlPattern = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i

  const parseAndNavigate = (url: string): boolean => {
    const trimmed = url.trim()

    const tweetMatch = trimmed.match(tweetUrlPattern)
    if (tweetMatch) {
      window.location.href = `/${tweetMatch[1]}/status/${tweetMatch[2]}`
      return true
    }
    const igMatch = trimmed.match(instagramUrlPattern)
    if (igMatch) {
      window.location.href = `/reels/${igMatch[1]}/`
      return true
    }
    const ttMatch = trimmed.match(tiktokUrlPattern)
    if (ttMatch) {
      window.location.href = `/@${ttMatch[1]}/video/${ttMatch[2]}`
      return true
    }
    const ytMatch = trimmed.match(youtubeUrlPattern)
    if (ytMatch) {
      window.location.href = `/shorts/${ytMatch[1]}`
      return true
    }
    return false
  }

  const handleTweetUrlChange = (value: string) => {
    setTweetUrl(value)
    setUrlError('')

    // Auto-navigate if a recognized link is pasted
    if (/(?:x\.com|twitter\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\//i.test(value)) {
      parseAndNavigate(value)
    }
  }

  const handleTweetUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setUrlError('')

    if (!parseAndNavigate(tweetUrl)) {
      setUrlError("That's not a link we recognize. Try X, Instagram, TikTok or YouTube.")
    }
  }

  const photos = tweet.media?.photos || []
  const videos = tweet.media?.videos || []
  const hasQuotedMedia = (tweet.quote?.media?.photos?.length ?? 0) > 0 ||
                         (tweet.quote?.media?.videos?.length ?? 0) > 0
  const hasMedia = photos.length > 0 || videos.length > 0 || hasQuotedMedia

  // Check if collapsing would actually clip content at the current viewport.
  // The collapsed max-h varies by breakpoint: 400/450/500/653px.
  // Only show expand/collapse when content is taller than that threshold,
  // or when the content div is already scrolling internally (collapsed state).
  useEffect(() => {
    const article = articleRef.current
    const content = contentRef.current
    if (!article || hasMedia) return
    const getCollapsedMaxH = () => {
      if (typeof window === 'undefined') return 400
      if (window.matchMedia('(min-width: 1024px)').matches) return 653
      if (window.matchMedia('(min-width: 768px)').matches) return 500
      if (window.matchMedia('(min-width: 640px)').matches) return 450
      return 400
    }
    const check = () => {
      const maxH = getCollapsedMaxH()
      const articleOverflows = article.scrollHeight > maxH
      const contentScrolls = content ? content.scrollHeight > content.clientHeight : false
      setContentOverflows(articleOverflows || contentScrolls)
    }
    check()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(check)
      observer.observe(article)
      if (content) observer.observe(content)
      return () => observer.disconnect()
    }
  }, [hasMedia])

  const handleLogin = () => {
    setIsLoading(true)
    const returnUrl = encodeURIComponent(window.location.pathname)
    window.location.href = `/api/auth/twitter?returnUrl=${returnUrl}`
  }

  const handleAddToCollection = async () => {
    setIsAdding(true)
    try {
      const response = await fetch('/api/tweets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://x.com/${username}/status/${tweetId}`,
          source: 'url_prefix',
        }),
      })
      const data = await response.json()

      if (data.success) {
        router.push(`/?added=success&tweetId=${data.bookmark.id}&author=${data.bookmark.author}&text=${encodeURIComponent((data.bookmark.text || '').slice(0, 200))}`)
      } else if (data.isDuplicate) {
        // Gracefully handle duplicates - show as duplicate, not error
        router.push(`/?added=duplicate&tweetId=${data.bookmark.id}&author=${data.bookmark.author}&text=${encodeURIComponent((data.bookmark.text || '').slice(0, 200))}`)
      } else {
        router.push(`/?added=error&error=${encodeURIComponent(data.error || 'Failed to add tweet')}`)
      }
    } catch (error) {
      router.push(`/?added=error&error=${encodeURIComponent(error instanceof Error ? error.message : 'Failed to add tweet')}`)
    }
  }

  const handleContinueToGallery = () => {
    router.push('/')
  }

  const handleSharePreview = async () => {
    const url = window.location.href
    const title = `${tweet.author?.name || username} on X — ADHX Preview`
    try {
      if (navigator.share) {
        await navigator.share({ url, title })
        setShareStatus('shared')
      } else {
        await navigator.clipboard.writeText(url)
        setShareStatus('copied')
      }
    } catch {
      // User cancelled share or clipboard failed — try clipboard as fallback
      try {
        await navigator.clipboard.writeText(url)
        setShareStatus('copied')
      } catch {
        // Both failed, do nothing
        return
      }
    }
    setTimeout(() => setShareStatus('idle'), 2000)
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper relative overflow-x-hidden">
      <LandingAnimations />
      <AnimatedBackground />
      <ThemeToggle className="fixed right-3 top-3 z-50 border border-hairline bg-surface/70 shadow-m-sm backdrop-blur" />

      {/* warm ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full"
        style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--m-accent) 16%, transparent), transparent 70%)' }}
      />

      {/* Main Content - flex-1 only on md+ to allow mobile scrolling */}
      <main className="relative z-10 px-4 sm:px-6 lg:px-12 pb-14 md:flex-1 pt-8 sm:pt-12">
        <div className="max-w-[1040px] mx-auto">
          {/* Centered Matter header */}
          <div className="text-center mb-8 md:mb-10 animate-fade-in-up [animation-fill-mode:both]">
            <div className="flex items-center justify-center mb-4 md:mb-5">
              <Link
                href="/"
                aria-label="ADHX home"
                className="inline-flex rounded-full transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-clay/40"
              >
                <MatterLogo size={18} />
              </Link>
            </div>
            <h1 className="font-serif font-semibold tracking-[-0.015em] text-ink text-3xl sm:text-4xl lg:text-[46px] mb-2">
              Found something good?
            </h1>
            <p className="text-ink-2 text-[13.5px] sm:text-[17px] whitespace-nowrap sm:whitespace-normal max-w-2xl mx-auto">
              Save it before{' '}
              <b className="text-clay font-semibold">
                <span className="sm:hidden">47 tabs</span>
                <span className="hidden sm:inline">47 browser tabs</span>
              </b>{' '}
              make you forget.
            </p>
          </div>

          {/* Two Column Layout - Tops align, two columns from tablet (md) breakpoint */}
          <div className="grid md:grid-cols-[minmax(0,430px)_1fr] gap-8 lg:gap-12 items-start">
            {/* Tweet Card - Left Column - Fixed max heights for scrollable mobile, viewport-based for desktop */}
            <div className="animate-fade-in-up [animation-fill-mode:both] delay-100 w-full min-w-0">
              <article ref={articleRef} data-content="tweet" className={cn('bg-surface rounded-card border border-hairline shadow-m-lg flex flex-col overflow-hidden min-h-[300px] w-full min-w-0', !(hasMedia || isExpanded) && 'max-h-[400px] sm:max-h-[450px] md:max-h-[500px] lg:max-h-[653px]')}>
                {/* Author Header */}
                <header className="px-4 pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <a
                      href={`https://x.com/${tweet.author?.screen_name || username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 flex-1 min-w-0 group"
                    >
                      {tweet.author?.avatar_url ? (
                        <img
                          src={tweet.author.avatar_url}
                          alt={tweet.author.name}
                          className="w-[42px] h-[42px] rounded-full"
                        />
                      ) : (
                        <div className="w-[42px] h-[42px] rounded-full flex items-center justify-center flex-shrink-0 bg-black text-white">
                          <PlatformGlyph platform="x" size={20} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[15px] text-ink truncate group-hover:text-clay transition-colors">
                          {tweet.author?.name || username}
                        </p>
                        <p className="font-mono text-[12.5px] text-ink-3 truncate">
                          @{tweet.author?.screen_name || username}
                        </p>
                      </div>
                    </a>
                    <a
                      href={`https://x.com/${tweet.author?.screen_name || username}/status/${tweetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12.5px] font-semibold bg-inset text-ink-2 hover:text-clay transition-colors"
                      title="View on X"
                    >
                      <span className="font-mono">{formatRelativeTime(tweet.created_at)}</span>
                      <PlatformGlyph platform="x" size={12} />
                    </a>
                  </div>
                </header>

                {/* Scrollable Content Area - overflow-x-hidden prevents horizontal scroll on mobile */}
                <div
                  ref={contentRef}
                  className={`flex-1 min-h-0 overflow-x-hidden w-full min-w-0 ${hasMedia || isExpanded ? '' : 'overflow-y-auto'}`}
                  style={{ fontFamily: `var(--font-${selectedFont})` }}
                >
                {/* Tweet Text or Article */}
                <div className="px-4 pb-3 w-full min-w-0">
                  {tweet.article ? (
                    // X Article display
                    <div className="space-y-3">
                      <h2 className="font-serif text-xl font-semibold text-ink">
                        {tweet.article.title}
                      </h2>

                      {/* Cover image */}
                      {tweet.article.cover_media?.media_info?.original_img_url && (
                        <div className="rounded-xl overflow-hidden">
                          <img
                            src={tweet.article.cover_media.media_info.original_img_url}
                            alt={tweet.article.title}
                            className="w-full object-cover"
                          />
                        </div>
                      )}

                      {/* Full article content blocks */}
                      {tweet.article.content?.blocks && tweet.article.content.blocks.length > 0 ? (
                        <div className="text-sm [&>p]:mb-3 [&>h1]:mb-2 [&>h2]:mb-2 [&>h3]:mb-2 [&>ul]:mb-3 [&>ol]:mb-3">
                          {(() => {
                            const normalizedEntityMap = normalizeEntityMap(tweet.article!.content?.entityMap) as ArticleEntityMap | undefined
                            const mediaEntities = tweet.article?.media_entities?.reduce((acc, entity) => {
                              if (entity.media_id && entity.media_info?.original_img_url) {
                                acc[entity.media_id] = {
                                  url: entity.media_info.original_img_url,
                                  width: entity.media_info.original_img_width,
                                  height: entity.media_info.original_img_height,
                                }
                              }
                              return acc
                            }, {} as Record<string, { url: string; width?: number; height?: number }>)

                            return tweet.article!.content!.blocks.map((block, i) =>
                              renderArticleBlock(
                                block,
                                normalizedEntityMap,
                                i,
                                mediaEntities,
                                bionicReading
                              )
                            )
                          })()}
                        </div>
                      ) : tweet.article.preview_text ? (
                        <p className="text-ink-2 text-sm leading-relaxed">
                          {tweet.article.preview_text}
                        </p>
                      ) : null}

                      <div className="flex items-center gap-2 text-xs text-clay font-medium">
                        <PlatformGlyph platform="x" size={14} />
                        X Article
                      </div>
                    </div>
                  ) : (
                    // Regular tweet text. With media, long text collapses to 3 lines.
                    <>
                      <p
                        className={cn(
                          'text-[18px] text-ink break-words leading-relaxed [overflow-wrap:anywhere]',
                          hasMedia && !mediaTextExpanded ? 'line-clamp-3' : 'whitespace-pre-wrap',
                        )}
                      >
                        {renderTextWithLinks(tweet.text)}
                      </p>
                      {hasMedia && (tweet.text?.length ?? 0) > 180 && (
                        <button
                          onClick={() => setMediaTextExpanded((v) => !v)}
                          className="mt-1.5 text-[13px] font-semibold text-clay hover:opacity-80"
                        >
                          {mediaTextExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Media */}
                {hasMedia && (
                  <div className="px-4 pb-3">
                    <MediaGrid photos={photos} videos={videos} author={username} tweetId={tweetId} />
                  </div>
                )}

                {/* External Link Preview (Twitter Card) */}
                {tweet.external && !hasMedia && !tweet.article && (
                  <div className="px-4 pb-3">
                    <ExternalLinkPreview external={tweet.external} />
                  </div>
                )}

                {/* Quote Tweet */}
                {tweet.quote && (
                  <div className="px-4 pb-3">
                    <QuoteTweetPreview
                      quote={tweet.quote}
                      quoteAuthor={tweet.quote.author?.screen_name || ''}
                      quoteTweetId={tweet.quote.id}
                    />
                  </div>
                )}
                </div>
                {/* End Scrollable Content Area */}

                {/* Engagement Stats - responsive: compact on mobile/tablet, normal on desktop */}
                <footer className="px-3 sm:px-4 py-2.5 sm:py-3 border-t border-hairline flex items-center gap-2 sm:gap-3 md:gap-2 lg:gap-4 text-xs sm:text-sm md:text-xs lg:text-sm text-ink-3 min-w-0">
                  <span className="flex items-center gap-0.5 sm:gap-1 md:gap-0.5 lg:gap-1.5" title="Replies">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    {formatCount(tweet.replies)}
                  </span>
                  <span className="flex items-center gap-0.5 sm:gap-1 md:gap-0.5 lg:gap-1.5" title="Reposts">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {formatCount(tweet.retweets)}
                  </span>
                  <span className="flex items-center gap-0.5 sm:gap-1 md:gap-0.5 lg:gap-1.5" title="Likes">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    {formatCount(tweet.likes)}
                  </span>
                  {/* Views - always visible, responsive sizing */}
                  {tweet.views && (
                    <span className="flex items-center gap-0.5 sm:gap-1 md:gap-0.5 lg:gap-1.5" title="Views">
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      {formatCount(tweet.views)}
                    </span>
                  )}
                  {/* Expand/Collapse Toggle - only shown when content actually overflows */}
                  {!hasMedia && contentOverflows && (
                    <button
                      onClick={() => {
                        setIsExpanded(prev => {
                          const next = !prev
                          localStorage.setItem('adhx-preview-collapsed', next ? 'false' : 'true')
                          return next
                        })
                      }}
                      className="ml-auto flex-shrink-0 flex items-center gap-0.5 sm:gap-1 md:gap-0.5 lg:gap-1.5 px-1.5 sm:px-2 md:px-1.5 lg:px-2 py-1 rounded-lg text-ink-3 hover:text-clay hover:bg-clay/10 transition-colors"
                      title={isExpanded ? 'Collapse tweet' : 'Expand tweet'}
                    >
                      {isExpanded ? (
                        <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4" />
                      ) : (
                        <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4" />
                      )}
                      <span className="text-xs hidden lg:inline">{isExpanded ? 'Collapse' : 'Expand'}</span>
                    </button>
                  )}
                  {/* Share Preview Button */}
                  <button
                    onClick={handleSharePreview}
                    className={cn(
                      'flex-shrink-0 flex items-center gap-0.5 sm:gap-1 md:gap-0.5 lg:gap-1.5 px-1.5 sm:px-2 md:px-1.5 lg:px-2 py-1 rounded-lg transition-colors',
                      (!hasMedia && contentOverflows) ? '' : 'ml-auto',
                      shareStatus !== 'idle'
                        ? 'text-[#3E7D5F]'
                        : 'text-ink-3 hover:text-clay hover:bg-clay/10'
                    )}
                    title="Share this preview"
                    aria-label="Share this preview"
                  >
                    {shareStatus !== 'idle' ? (
                      <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4" />
                    ) : (
                      <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4" />
                    )}
                    <span className="text-xs hidden lg:inline">
                      {shareStatus === 'shared' ? 'Shared!' : shareStatus === 'copied' ? 'Link copied!' : 'Share'}
                    </span>
                  </button>
                </footer>
              </article>

              {/* Mobile actions */}
              <div className="md:hidden mt-6 space-y-3.5">
                {tweet.article && (
                  <ReadingTools
                    bionicReading={bionicReading}
                    onBionicToggle={() => setBionicReading(!bionicReading)}
                    selectedFont={selectedFont}
                    onFontChange={setSelectedFont}
                  />
                )}
                <SidebarActions
                  isAuthenticated={isAuthenticated}
                  isAdding={isAdding}
                  isLoading={isLoading}
                  onAdd={handleAddToCollection}
                  onContinue={handleContinueToGallery}
                  onLogin={handleLogin}
                  onShare={handleSharePreview}
                  shareStatus={shareStatus}
                />
                <PreviewAnotherTweet
                  tweetUrl={tweetUrl}
                  urlError={urlError}
                  onUrlChange={handleTweetUrlChange}
                  onSubmit={handleTweetUrlSubmit}
                />
              </div>
            </div>

            {/* Actions Section - Right Column (desktop) */}
            <div
              role="complementary"
              aria-label="ADHX features"
              className="hidden md:flex flex-col gap-3.5 animate-fade-in-up [animation-fill-mode:both] delay-200"
            >
              {tweet.article && (
                <ReadingTools
                  bionicReading={bionicReading}
                  onBionicToggle={() => setBionicReading(!bionicReading)}
                  selectedFont={selectedFont}
                  onFontChange={setSelectedFont}
                />
              )}
              <SidebarActions
                isAuthenticated={isAuthenticated}
                isAdding={isAdding}
                isLoading={isLoading}
                onAdd={handleAddToCollection}
                onContinue={handleContinueToGallery}
                onLogin={handleLogin}
                onShare={handleSharePreview}
                shareStatus={shareStatus}
              />
              <PreviewAnotherTweet
                tweetUrl={tweetUrl}
                urlError={urlError}
                onUrlChange={handleTweetUrlChange}
                onSubmit={handleTweetUrlSubmit}
              />
              <ValueCard />
            </div>

            {/* Value card — mobile */}
            <div className="md:hidden">
              <ValueCard />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center flex-shrink-0">
        <p className="text-ink-3 font-indie-flower text-sm">Save now. Read never. Find always.</p>
      </footer>
    </div>
  )
}

/** Right-column actions panel: primary CTA + Copy link / Share + Keep-it-forever. */
function SidebarActions({
  isAuthenticated,
  isAdding,
  isLoading,
  onAdd,
  onContinue,
  onLogin,
  onShare,
  shareStatus,
}: {
  isAuthenticated: boolean
  isAdding: boolean
  isLoading: boolean
  onAdd: () => void
  onContinue: () => void
  onLogin: () => void
  onShare: () => void
  shareStatus: 'idle' | 'shared' | 'copied'
}): React.ReactElement {
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      {isAuthenticated ? (
        <>
          <button
            onClick={onAdd}
            disabled={isAdding}
            className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl bg-clay-grad text-white font-bold text-base shadow-glow transition-all hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAdding ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Bookmark className="w-[18px] h-[18px]" />}
            {isAdding ? 'Saving…' : 'Save to collection'}
          </button>
          <button
            onClick={onContinue}
            disabled={isAdding}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-inset text-ink font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
          >
            Continue to gallery
          </button>
        </>
      ) : (
        <button
          onClick={onLogin}
          disabled={isLoading}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl bg-ink text-surface font-bold text-base transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-[18px] h-[18px] animate-spin" />
              Connecting…
            </>
          ) : (
            <ConnectWithX size={16} />
          )}
        </button>
      )}

      {/* Secondary action row — Download omitted for tweets (per-media download lives on the media itself) */}
      <div className="flex gap-2.5">
        <button
          onClick={copyLink}
          className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border border-hairline bg-surface text-ink-2 hover:text-clay hover:border-clay/30 transition-colors"
        >
          {copied ? <Check className="w-[19px] h-[19px]" /> : <Link2 className="w-[19px] h-[19px]" />}
          <span className="text-[12.5px] font-semibold">{copied ? 'Copied' : 'Copy link'}</span>
        </button>
        <button
          onClick={onShare}
          className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border border-hairline bg-surface text-ink-2 hover:text-clay hover:border-clay/30 transition-colors"
        >
          {shareStatus !== 'idle' ? <Check className="w-[19px] h-[19px]" /> : <Share2 className="w-[19px] h-[19px]" />}
          <span className="text-[12.5px] font-semibold">{shareStatus === 'shared' ? 'Shared' : shareStatus === 'copied' ? 'Copied' : 'Share'}</span>
        </button>
      </div>

      {/* Keep it forever — only when unauthenticated */}
      {!isAuthenticated && (
        <div className="rounded-2xl px-4 py-4 bg-clay/10 border border-clay/20">
          <div className="font-bold text-sm text-ink mb-0.5">Keep it forever</div>
          <p className="text-[13px] text-ink-2 leading-snug mb-3">
            Create a free account to save everything you preview — private to you.
          </p>
          <button
            onClick={onLogin}
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-ink text-surface font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
          >
            <ConnectWithX size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Shared 3-row value card (bullets). */
function ValueCard(): React.ReactElement {
  const rows: Array<[React.ReactNode, string, string]> = [
    [<Sparkles key="s" className="w-[17px] h-[17px]" />, 'One place for everything', 'Tweets, TikToks, Reels, Shorts & articles in one searchable home.'],
    [<Zap key="z" className="w-[17px] h-[17px]" />, 'Media at your fingertips', 'Full-screen viewer with one-click downloads.'],
    [<Search key="f" className="w-[17px] h-[17px]" />, 'Actually find it later', 'Full-text search across everything you save.'],
  ]
  return (
    <div className="rounded-card border border-hairline bg-surface overflow-hidden">
      {rows.map(([icon, title, body], i) => (
        <div key={title} className={cn('flex items-center gap-3 px-4 py-3.5', i > 0 && 'border-t border-hairline')}>
          <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-none bg-clay/10 text-clay">
            {icon}
          </div>
          <div>
            <div className="font-semibold text-[13.5px] text-ink">{title}</div>
            <div className="text-[12px] text-ink-3 leading-snug">{body}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Preview another tweet section - URL input form for previewing different tweets */
interface PreviewAnotherTweetProps {
  tweetUrl: string
  urlError: string
  onUrlChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  className?: string
}

function PreviewAnotherTweet({ tweetUrl, urlError, onUrlChange, onSubmit, className }: PreviewAnotherTweetProps): React.ReactElement {
  return (
    <div data-section="preview-another" className={cn('rounded-2xl border border-hairline bg-surface px-4 py-4', className)}>
      <p className="font-bold text-[13.5px] text-ink mb-2.5">Preview another link</p>
      <form onSubmit={onSubmit}>
        <div className="flex gap-2.5">
          <input
            type="text"
            value={tweetUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="Paste a link…"
            className="flex-1 font-mono text-base sm:text-[12.5px] bg-inset px-3 py-2.5 rounded-xl border border-hairline text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-clay/40 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-[18px] rounded-xl bg-clay-grad text-white font-semibold text-[13.5px] shadow-glow transition-all hover:opacity-95"
          >
            Go
          </button>
        </div>
        {urlError && <p className="text-[#EF4444] text-xs mt-2">{urlError}</p>}
      </form>
      <p className="text-xs text-ink-3 mt-2.5">Works with X, Instagram, TikTok &amp; YouTube.</p>
    </div>
  )
}

/** Media grid component for displaying tweet photos and videos */
interface MediaGridProps {
  photos: Array<{ url: string; width: number; height: number }>
  videos: Array<{ url: string; thumbnail_url: string; width: number; height: number; duration?: number }>
  author: string
  tweetId: string
}

function MediaGrid({ photos, videos, author, tweetId }: MediaGridProps): React.ReactElement {
  const totalMedia = photos.length + videos.length

  // Single media item - full width, no max-height to show complete image
  if (totalMedia === 1) {
    if (videos.length > 0) {
      return (
        <VideoPlayer
          author={author}
          tweetId={tweetId}
          thumbnail={videos[0].thumbnail_url}
          width={videos[0].width}
          height={videos[0].height}
          duration={videos[0].duration}
        />
      )
    }
    return (
      <div className="rounded-xl overflow-hidden relative group">
        <img src={photos[0].url} alt="Tweet media" className="w-full max-w-full object-contain" />
        <div className="absolute top-3 right-3">
          <MediaShareButton
            url={`/api/media/image?author=${encodeURIComponent(author)}&tweetId=${encodeURIComponent(tweetId)}&index=1`}
            filename={`tweet-${tweetId}.jpg`}
            mimeType="image/jpeg"
          />
        </div>
      </div>
    )
  }

  // 2 items - side by side with responsive heights
  if (totalMedia === 2) {
    return (
      <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
        {videos.map((video, i) => (
          <VideoPlayer
            key={`v-${i}`}
            author={author}
            tweetId={tweetId}
            thumbnail={video.thumbnail_url}
            width={video.width}
            height={video.height}
            duration={video.duration}
          />
        ))}
        {photos.map((photo, i) => (
          <div key={`p-${i}`} className="relative group/img">
            <img src={photo.url} alt="" className="w-full h-32 sm:h-40 md:h-44 lg:h-48 object-cover" />
            <div className="absolute top-2 right-2">
              <MediaShareButton
                url={`/api/media/image?author=${encodeURIComponent(author)}&tweetId=${encodeURIComponent(tweetId)}&index=${i + 1}`}
                filename={`tweet-${tweetId}-${i + 1}.jpg`}
                mimeType="image/jpeg"
                useImageGroupHover
              />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // 3-4 items - 2x2 grid with responsive heights
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
      {videos.map((video, i) => (
        <VideoPlayer
          key={`v-${i}`}
          author={author}
          tweetId={tweetId}
          thumbnail={video.thumbnail_url}
          width={video.width}
          height={video.height}
        />
      ))}
      {photos.slice(0, 4 - videos.length).map((photo, i) => (
        <div key={`p-${i}`} className="relative group/img">
          <img src={photo.url} alt="" className="w-full h-28 sm:h-32 md:h-34 lg:h-36 object-cover" />
          <div className="absolute top-2 right-2">
            <MediaShareButton
              url={`/api/media/image?author=${encodeURIComponent(author)}&tweetId=${encodeURIComponent(tweetId)}&index=${i + 1}`}
              filename={`tweet-${tweetId}-${i + 1}.jpg`}
              mimeType="image/jpeg"
              useImageGroupHover
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Video player component - uses server-side proxy to avoid CORS issues */
function VideoPlayer({
  author,
  tweetId,
  thumbnail,
  width,
  height,
  duration,
}: {
  author: string
  tweetId: string
  thumbnail: string
  width?: number
  height?: number
  duration?: number
}): React.ReactElement {
  const [isPlaying, setIsPlaying] = useState(false)
  const [downloadBlockedSize, setDownloadBlockedSize] = useState<number | null>(null)

  // Calculate aspect ratio, default to 16:9 if dimensions unavailable
  const aspectRatio = width && height ? `${width} / ${height}` : '16 / 9'

  // Use server-side video proxy to avoid CORS issues with video.twimg.com
  const proxyUrl = `/api/media/video?author=${encodeURIComponent(author)}&tweetId=${encodeURIComponent(tweetId)}&quality=hd`

  // Show funny message when download blocked on mobile
  if (downloadBlockedSize !== null) {
    return (
      <VideoDownloadBlocked
        estimatedSize={downloadBlockedSize}
        onDismiss={() => setDownloadBlockedSize(null)}
        compact
        aspectRatio={aspectRatio}
      />
    )
  }

  if (!isPlaying) {
    return (
      <div className="relative group">
        <button
          onClick={() => setIsPlaying(true)}
          style={{ aspectRatio }}
          className="relative w-full max-h-[50vh] md:max-h-none bg-black rounded-xl overflow-hidden"
        >
          <img src={thumbnail} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
            <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play className="w-7 h-7 text-gray-900 ml-1" fill="currentColor" />
            </div>
          </div>
        </button>
        {/* Share/Download button for video thumbnail */}
        <div className="absolute top-3 right-3">
          <MediaShareButton
            url={proxyUrl}
            filename={`tweet-${tweetId}.mp4`}
            mimeType="video/mp4"
            onTooLargeForMobile={setDownloadBlockedSize}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="relative group">
      <SmartVideoPlayer
        author={author}
        tweetId={tweetId}
        autoPlay
        duration={duration}
        poster={thumbnail}
        className="w-full max-h-[50vh] md:max-h-none bg-black rounded-xl"
        tweetUrl={`https://x.com/${author}/status/${tweetId}`}
      />
      {/* Share/Download button for playing video */}
      <div className="absolute top-3 right-3">
        <MediaShareButton
          url={proxyUrl}
          filename={`tweet-${tweetId}.mp4`}
          mimeType="video/mp4"
          onTooLargeForMobile={setDownloadBlockedSize}
        />
      </div>
    </div>
  )
}

/** Quote tweet preview component with full media support */
interface QuoteTweetPreviewProps {
  quote: NonNullable<Tweet['quote']>
  quoteAuthor: string
  quoteTweetId: string
}

function QuoteTweetPreview({ quote, quoteAuthor, quoteTweetId }: QuoteTweetPreviewProps): React.ReactElement {
  const photos = quote.media?.photos || []
  const videos = quote.media?.videos || []
  const hasMedia = photos.length > 0 || videos.length > 0

  return (
    <div className="rounded-xl border border-hairline overflow-hidden bg-inset">
      {/* Quote author */}
      <div className="p-3 pb-2">
        <div className="flex items-center gap-2">
          {quote.author?.avatar_url && (
            <img
              src={quote.author.avatar_url}
              alt={quote.author.name}
              className="w-5 h-5 rounded-full"
            />
          )}
          <span className="text-sm font-medium text-ink">
            {quote.author?.name}
          </span>
          <span className="font-mono text-xs text-ink-3">
            @{quote.author?.screen_name}
          </span>
        </div>
      </div>

      {/* Quote text - full text, no truncation */}
      {quote.text && (
        <div className="px-3 pb-3">
          <p className="text-sm text-ink-2 whitespace-pre-wrap break-words">
            {quote.text}
          </p>
        </div>
      )}

      {/* Quote media - full grid with all photos/videos */}
      {hasMedia && (
        <div className="px-3 pb-3">
          <MediaGrid
            photos={photos}
            videos={videos}
            author={quoteAuthor}
            tweetId={quoteTweetId}
          />
        </div>
      )}
    </div>
  )
}

/** External link preview with enhanced article detection */
interface ExternalLinkPreviewProps {
  external: NonNullable<Tweet['external']>
}

function ExternalLinkPreview({ external }: ExternalLinkPreviewProps): React.ReactElement {
  const [imgFailed, setImgFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // Handle image errors that fire before hydration (SSR race condition)
  useEffect(() => {
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth === 0) {
      setImgFailed(true)
    }
  }, [])

  // Detect if this is an article-type link (has title, description > 80 chars)
  const isArticle = Boolean(
    external.title &&
    external.description &&
    external.description.length > 80
  )

  const showImage = !!external.thumbnail_url && !imgFailed
  const url = external.expanded_url || external.url

  if (isArticle) {
    // Enhanced article preview with larger image and prominent title
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl border border-hairline overflow-hidden hover:bg-inset transition-colors group"
      >
        {showImage && (
          <div className="relative">
            <img
              ref={imgRef}
              src={external.thumbnail_url}
              alt={external.title || 'Article preview'}
              className="w-full h-48 object-cover group-hover:scale-[1.02] transition-transform"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
            />
            {/* Gradient overlay for better text readability if text overlaps */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
          </div>
        )}
        <div className="p-4">
          <p className="text-xs text-ink-3 mb-2 uppercase tracking-wide">
            {external.display_url}
          </p>
          {external.title && (
            <h3 className="font-semibold text-ink text-base leading-snug mb-2 group-hover:text-clay transition-colors">
              {external.title}
            </h3>
          )}
          {external.description && (
            <p className="text-sm text-ink-2 line-clamp-3 leading-relaxed">
              {external.description}
            </p>
          )}
        </div>
      </a>
    )
  }

  // Compact preview for non-article links
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-hairline overflow-hidden hover:bg-inset transition-colors"
    >
      {showImage && (
        <img
          ref={imgRef}
          src={external.thumbnail_url}
          alt={external.title || 'Link preview'}
          className="w-full h-40 object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      )}
      <div className="p-3">
        <p className="text-xs text-ink-3 mb-1">
          {external.display_url}
        </p>
        {external.title && (
          <p className="font-medium text-ink text-sm line-clamp-2">
            {external.title}
          </p>
        )}
        {external.description && (
          <p className="text-xs text-ink-2 mt-1 line-clamp-2">
            {external.description}
          </p>
        )}
      </div>
    </a>
  )
}
