'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Search, Sparkles, Play, Zap, Eye, Maximize2, Minimize2, Plus, Loader2, MessageCircle, ChevronUp, ChevronDown, ExternalLink } from 'lucide-react'
import { ADHX_PURPLE } from '@/lib/gestalt/theme'
import { type FxTwitterResponse } from '@/lib/media/fxembed'
import { renderArticleBlock } from '@/components/feed/utils'
import type { ArticleEntityMap } from '@/components/feed/types'
import { FONT_OPTIONS, type BodyFont } from '@/lib/preferences-context'
import { XIcon } from '@/components/icons'
import { AnimatedBackground, LandingAnimations } from '@/components/landing'
import { formatCount, formatRelativeTime } from '@/lib/utils/format'

/** Tweet type extracted from FxTwitterResponse */
type Tweet = NonNullable<FxTwitterResponse['tweet']>

/** Thread item for displaying parent/child tweets in thread context */
interface LandingThreadItem {
  id: string
  text: string
  author: string
  authorName?: string
  authorProfileImageUrl?: string
  createdAt?: string
  media?: {
    photos?: Array<{ url: string; width: number; height: number }>
    videos?: Array<{ url: string; thumbnail_url: string; width: number; height: number }>
  }
}

/** Fetch parent tweets to build thread context via FxTwitter API */
async function fetchThreadContext(
  tweetId: string,
  author: string,
  maxDepth: number = 5
): Promise<{ parents: LandingThreadItem[]; isSelfThread: boolean }> {
  const parents: LandingThreadItem[] = []
  let currentAuthor = author
  let currentTweetId = tweetId
  let isSelfThread = true

  for (let depth = 0; depth < maxDepth; depth++) {
    try {
      const response = await fetch(`https://api.fxtwitter.com/${currentAuthor}/status/${currentTweetId}`)
      if (!response.ok) break

      const data = await response.json() as FxTwitterResponse
      const tweet = data.tweet
      if (!tweet) break

      // Check for parent tweet
      const parentTweetId = tweet.replying_to_status
      if (!parentTweetId) break

      // Fetch the parent tweet
      const parentResponse = await fetch(`https://api.fxtwitter.com/i/status/${parentTweetId}`)
      if (!parentResponse.ok) break

      const parentData = await parentResponse.json() as FxTwitterResponse
      const parentTweet = parentData.tweet
      if (!parentTweet) break

      // Check if still same author
      if (parentTweet.author.screen_name.toLowerCase() !== author.toLowerCase()) {
        isSelfThread = false
      }

      parents.unshift({
        id: parentTweet.id,
        text: parentTweet.text,
        author: parentTweet.author.screen_name,
        authorName: parentTweet.author.name,
        authorProfileImageUrl: parentTweet.author.avatar_url,
        createdAt: parentTweet.created_at,
        media: parentTweet.media,
      })

      // Move up the chain
      currentTweetId = parentTweetId
      currentAuthor = parentTweet.author.screen_name
    } catch {
      break
    }
  }

  return { parents, isSelfThread }
}

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
    <div className={`p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 ${className || ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-purple-600 dark:text-purple-300">
          <Eye className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs font-medium">Reading tools</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Bionic Reading Toggle */}
          <button
            onClick={onBionicToggle}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              bionicReading
                ? 'bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-purple-100 dark:hover:bg-purple-900/30'
            }`}
            title="Bolds first part of each word for easier reading"
          >
            Bionic
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-purple-200 dark:bg-purple-700" />

          {/* Font Selector */}
          <div className="flex items-center gap-0.5">
            {(Object.entries(FONT_OPTIONS) as [BodyFont, { name: string }][]).map(([key, { name }]) => (
              <button
                key={key}
                onClick={() => onFontChange(key)}
                className={`px-2 py-1 rounded-lg text-xs transition-colors ${
                  selectedFont === key
                    ? 'bg-purple-200 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-purple-100 dark:hover:bg-purple-900/30'
                }`}
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

export function TweetPreviewLanding({ username, tweetId, tweet, isAuthenticated = false }: TweetPreviewLandingProps): React.ReactElement {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [bionicReading, setBionicReading] = useState(false)
  const [selectedFont, setSelectedFont] = useState<BodyFont>('ibm-plex')
  const [isExpanded, setIsExpanded] = useState(false)
  const [threadData, setThreadData] = useState<{ parents: LandingThreadItem[]; isSelfThread: boolean } | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)

  // Check if this tweet is part of a thread (has parents OR has replies indicating thread continues)
  const hasParent = Boolean(tweet.replying_to_status)
  const hasReplies = (tweet.replies || 0) > 0

  // Auto-fetch thread context on mount if this tweet has a parent
  useEffect(() => {
    if (!hasParent) return

    const fetchThread = async () => {
      setLoadingThread(true)
      try {
        const data = await fetchThreadContext(tweetId, username)
        setThreadData(data)
      } catch (error) {
        console.error('Failed to fetch thread:', error)
      } finally {
        setLoadingThread(false)
      }
    }

    fetchThread()
  }, [tweetId, username, hasParent])

  const photos = tweet.media?.photos || []
  const videos = tweet.media?.videos || []
  const hasMedia = photos.length > 0 || videos.length > 0

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

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 relative overflow-x-hidden">
      <LandingAnimations />
      <AnimatedBackground />

      {/* Header */}
      <header className="relative z-10 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 group">
            <img
              src="/logo.png"
              alt="ADHX Logo"
              className="w-10 h-10 object-contain group-hover:scale-110 transition-transform"
            />
            <span className="text-2xl font-indie-flower text-gray-900 dark:text-white">ADHX</span>
          </a>
          <a
            href="/"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            Learn more →
          </a>
        </div>
      </header>

      {/* Main Content - flex-1 only on md+ to allow mobile scrolling */}
      <main className="relative z-10 px-4 sm:px-6 pb-6 md:flex-1">
        <div className="max-w-5xl mx-auto">
          {/* Hero Text - Tighter spacing on mobile */}
          <div className="text-center mb-4 md:mb-6 lg:mb-8 animate-fade-in-up [animation-fill-mode:both]">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3">
              Found something good?
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              <span className="sm:hidden">Save it now before you forget.</span>
              <span className="hidden sm:inline">Save it now before <span className="text-purple-600 dark:text-purple-400 font-medium">47 browser tabs</span> make you forget.</span>
            </p>
          </div>

          {/* Two Column Layout - Tops align, two columns from tablet (md) breakpoint */}
          <div className="grid md:grid-cols-2 gap-4 md:gap-6 lg:gap-8 items-start">
            {/* Tweet Card - Left Column - Fixed max heights for scrollable mobile, viewport-based for desktop */}
            <div className="animate-fade-in-up [animation-fill-mode:both] delay-100 w-full min-w-0">
              <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl animate-pulse-glow flex flex-col overflow-hidden min-h-[300px] w-full min-w-0 ${isExpanded ? '' : 'max-h-[400px] sm:max-h-[450px] md:max-h-[500px] lg:max-h-[653px]'}`}>
                {/* Author Header */}
                <div className="p-4 pb-3">
                  <div className="flex items-center gap-3">
                    <a
                      href={`https://x.com/${tweet.author?.screen_name || username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 flex-1 min-w-0 group"
                    >
                      {tweet.author?.avatar_url && (
                        <img
                          src={tweet.author.avatar_url}
                          alt={tweet.author.name}
                          className="w-12 h-12 rounded-full ring-2 ring-purple-100 dark:ring-purple-900 group-hover:ring-purple-300 dark:group-hover:ring-purple-700 transition-all"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          {tweet.author?.name || username}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          @{tweet.author?.screen_name || username}
                        </p>
                      </div>
                    </a>
                    <a
                      href={`https://x.com/${tweet.author?.screen_name || username}/status/${tweetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded-full transition-colors"
                      title="View on X"
                    >
                      {formatRelativeTime(tweet.created_at)}
                      <XIcon className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Scrollable Content Area - overflow-x-hidden prevents horizontal scroll on mobile */}
                <div
                  className={`flex-1 min-h-0 overflow-x-hidden w-full min-w-0 ${isExpanded ? '' : 'overflow-y-auto'}`}
                  style={{ fontFamily: `var(--font-${selectedFont})` }}
                >
                {/* Thread Context - Auto-loads when this tweet has parents */}
                {(loadingThread || threadData) && (
                  <div className="px-4 pt-2 pb-0">
                    {loadingThread ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading thread...</span>
                      </div>
                    ) : threadData && threadData.parents.length > 0 ? (
                      <ThreadContext
                        parents={threadData.parents}
                        isSelfThread={threadData.isSelfThread}
                        currentAuthor={username}
                        currentTweetId={tweetId}
                      />
                    ) : null}
                  </div>
                )}

                {/* Tweet Text or Article */}
                <div className="px-4 py-3 w-full min-w-0">
                  {tweet.article ? (
                    // X Article display
                    <div className="space-y-3">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">
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
                          {tweet.article.content.blocks.map((block, i) => {
                            // Build media entities map from article media_entities
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

                            return renderArticleBlock(
                              block,
                              tweet.article!.content?.entityMap as ArticleEntityMap | undefined,
                              i,
                              mediaEntities,
                              bionicReading
                            )
                          })}
                        </div>
                      ) : tweet.article.preview_text ? (
                        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                          {tweet.article.preview_text}
                        </p>
                      ) : null}

                      <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 font-medium">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                        </svg>
                        X Article
                      </div>
                    </div>
                  ) : (
                    // Regular tweet text - break-all ensures long text wraps on mobile
                    <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
                      {tweet.text}
                    </p>
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

                {/* Thread continues indicator - shows when this tweet has replies */}
                {hasReplies && (
                  <div className="px-4 pb-3">
                    <a
                      href={`https://x.com/${username}/status/${tweetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors py-2 border-t border-gray-100 dark:border-gray-700"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>{tweet.replies} more below</span>
                      <span className="text-gray-400 dark:text-gray-500">· View on X</span>
                    </a>
                  </div>
                )}
                </div>
                {/* End Scrollable Content Area */}

                {/* Engagement Stats - responsive: compact on mobile/tablet, normal on desktop */}
                <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2 sm:gap-3 md:gap-2 lg:gap-4 text-xs sm:text-sm md:text-xs lg:text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 min-w-0">
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
                  {/* Expand/Collapse Toggle - icon only until desktop to avoid clipping */}
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="ml-auto flex-shrink-0 flex items-center gap-0.5 sm:gap-1 md:gap-0.5 lg:gap-1.5 px-1.5 sm:px-2 md:px-1.5 lg:px-2 py-1 rounded-lg text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                    title={isExpanded ? 'Collapse tweet' : 'Expand tweet'}
                  >
                    {isExpanded ? (
                      <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4" />
                    ) : (
                      <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-3.5 md:h-3.5 lg:w-4 lg:h-4" />
                    )}
                    <span className="text-xs hidden lg:inline">{isExpanded ? 'Collapse' : 'Expand'}</span>
                  </button>
                </div>
              </div>

              {/* ADHD Reading Tools - Mobile only, below tweet card for easy thumb access */}
              {tweet.article && (
                <ReadingTools
                  bionicReading={bionicReading}
                  onBionicToggle={() => setBionicReading(!bionicReading)}
                  selectedFont={selectedFont}
                  onFontChange={setSelectedFont}
                  className="md:hidden mt-4"
                />
              )}

              {/* Mobile CTA - positioned right after reading tools, above value props */}
              <div className="md:hidden mt-4 space-y-3">
                {isAuthenticated ? (
                  <>
                    <button
                      onClick={handleAddToCollection}
                      disabled={isAdding}
                      className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-semibold text-white rounded-full transition-all hover:scale-[1.02] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: ADHX_PURPLE }}
                    >
                      {isAdding ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <Plus className="w-5 h-5" />
                          Add to Collection
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleContinueToGallery}
                      disabled={isAdding}
                      className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-full transition-all hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      <ArrowRight className="w-5 h-5" />
                      Continue to Gallery
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleLogin}
                      disabled={isLoading}
                      className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-semibold text-white rounded-full transition-all hover:scale-[1.02] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: ADHX_PURPLE }}
                    >
                      {isLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <XIcon className="w-5 h-5" />
                          Save this tweet
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </button>
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                      Save to your own Collection. Visible only to you.
                    </p>
                  </>
                )}
              </div>

            </div>

            {/* CTA Section - Right Column */}
            <div className="animate-fade-in-up [animation-fill-mode:both] delay-200">
              {/* Benefits - Tighter spacing on mobile */}
              <div className="space-y-3 md:space-y-4 mb-6 md:mb-8">
                <BenefitItem
                  icon={<Sparkles className="w-5 h-5" />}
                  title="One place for everything"
                  description="Sync your X bookmarks, add tweets manually, organize with tags. Your chaos, contained."
                />
                <BenefitItem
                  icon={<Zap className="w-5 h-5" />}
                  title="Media at your fingertips"
                  description="Full-screen viewer with one-click downloads. Save that meme before you forget."
                />
                <BenefitItem
                  icon={<Search className="w-5 h-5" />}
                  title="Actually find it later"
                  description="Full-text search across your entire collection. That thread from 6 months ago? Found."
                />
              </div>

              {/* CTA Button - Desktop only (mobile CTA is above value props) */}
              <div className="hidden md:block space-y-3 animate-fade-in-up [animation-fill-mode:both] delay-300">
                {isAuthenticated ? (
                  <>
                    <button
                      onClick={handleAddToCollection}
                      disabled={isAdding}
                      className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-semibold text-white rounded-full transition-all hover:scale-[1.02] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: ADHX_PURPLE }}
                    >
                      {isAdding ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <Plus className="w-5 h-5" />
                          Add to Collection
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleContinueToGallery}
                      disabled={isAdding}
                      className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-full transition-all hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      <ArrowRight className="w-5 h-5" />
                      Continue to Gallery
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleLogin}
                      disabled={isLoading}
                      className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-semibold text-white rounded-full transition-all hover:scale-[1.02] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: ADHX_PURPLE }}
                    >
                      {isLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <XIcon className="w-5 h-5" />
                          Save this tweet
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </button>
                    <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                      Save to your own Collection. Visible only to you.
                    </p>
                  </>
                )}
              </div>

              {/* URL Trick Callout */}
              <div className="mt-8 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-800 animate-fade-in-up [animation-fill-mode:both] delay-400">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-800 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-purple-600 dark:text-purple-300" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm mb-1">
                      Pro tip: The URL trick
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Just add <code className="bg-purple-100 dark:bg-purple-800/50 px-1.5 py-0.5 rounded text-purple-700 dark:text-purple-300 font-mono text-xs">adh</code> before any <code className="bg-purple-100 dark:bg-purple-800/50 px-1.5 py-0.5 rounded text-purple-700 dark:text-purple-300 font-mono text-xs">x.com</code> URL to save it instantly.
                    </p>
                  </div>
                </div>
              </div>

              {/* ADHD Reading Tools - Below Pro tip (desktop only) */}
              {tweet.article && (
                <ReadingTools
                  bionicReading={bionicReading}
                  onBionicToggle={() => setBionicReading(!bionicReading)}
                  selectedFont={selectedFont}
                  onFontChange={setSelectedFont}
                  className="hidden md:block mt-4"
                />
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-3 text-center flex-shrink-0">
        <p className="text-gray-400 dark:text-gray-500 font-indie-flower text-sm">
          Save now. Read never. Find always.
        </p>
      </footer>
    </div>
  )
}

/** Benefit item component for CTA section */
function BenefitItem({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }): React.ReactElement {
  return (
    <div className="flex gap-4 p-4 rounded-xl bg-white dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-700 transition-colors">
      <div
        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: `${ADHX_PURPLE}15`, color: ADHX_PURPLE }}
      >
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-0.5">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

/** Media grid component for displaying tweet photos and videos */
interface MediaGridProps {
  photos: Array<{ url: string; width: number; height: number }>
  videos: Array<{ url: string; thumbnail_url: string; width: number; height: number }>
  author: string
  tweetId: string
}

function MediaGrid({ photos, videos, author, tweetId }: MediaGridProps): React.ReactElement {
  const totalMedia = photos.length + videos.length

  // Single media item - full width with responsive heights, max-w-full prevents horizontal overflow
  if (totalMedia === 1) {
    if (videos.length > 0) {
      return (
        <VideoPlayer
          author={author}
          tweetId={tweetId}
          thumbnail={videos[0].thumbnail_url}
          width={videos[0].width}
          height={videos[0].height}
        />
      )
    }
    return (
      <div className="rounded-xl overflow-hidden">
        <img src={photos[0].url} alt="Tweet media" className="w-full max-w-full object-cover max-h-[250px] sm:max-h-[300px] md:max-h-[350px] lg:max-h-[400px]" />
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
          />
        ))}
        {photos.map((photo, i) => (
          <img key={`p-${i}`} src={photo.url} alt="" className="w-full h-32 sm:h-40 md:h-44 lg:h-48 object-cover" />
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
        <img key={`p-${i}`} src={photo.url} alt="" className="w-full h-28 sm:h-32 md:h-34 lg:h-36 object-cover" />
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
}: {
  author: string
  tweetId: string
  thumbnail: string
  width?: number
  height?: number
}): React.ReactElement {
  const [isPlaying, setIsPlaying] = useState(false)

  // Calculate aspect ratio, default to 16:9 if dimensions unavailable
  const aspectRatio = width && height ? `${width} / ${height}` : '16 / 9'

  if (!isPlaying) {
    return (
      <button
        onClick={() => setIsPlaying(true)}
        style={{ aspectRatio }}
        className="relative w-full max-h-[50vh] md:max-h-none bg-black rounded-xl overflow-hidden group"
      >
        <img src={thumbnail} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
          <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <Play className="w-7 h-7 text-gray-900 ml-1" fill="currentColor" />
          </div>
        </div>
      </button>
    )
  }

  // Use server-side video proxy to avoid CORS issues with video.twimg.com
  const proxyUrl = `/api/media/video?author=${encodeURIComponent(author)}&tweetId=${encodeURIComponent(tweetId)}&quality=hd`

  return (
    <video
      src={proxyUrl}
      controls
      autoPlay
      style={{ aspectRatio }}
      className="w-full max-h-[50vh] md:max-h-none bg-black rounded-xl"
      poster={thumbnail}
    />
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
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900/50">
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
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {quote.author?.name}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            @{quote.author?.screen_name}
          </span>
        </div>
      </div>

      {/* Quote text - full text, no truncation */}
      {quote.text && (
        <div className="px-3 pb-3">
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
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
  // Detect if this is an article-type link (has title, description > 80 chars)
  const isArticle = Boolean(
    external.title &&
    external.description &&
    external.description.length > 80
  )

  const url = external.expanded_url || external.url

  if (isArticle) {
    // Enhanced article preview with larger image and prominent title
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
      >
        {external.thumbnail_url && (
          <div className="relative">
            <img
              src={external.thumbnail_url}
              alt={external.title || 'Article preview'}
              className="w-full h-48 object-cover group-hover:scale-[1.02] transition-transform"
            />
            {/* Gradient overlay for better text readability if text overlaps */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
          </div>
        )}
        <div className="p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
            {external.display_url}
          </p>
          {external.title && (
            <h3 className="font-semibold text-gray-900 dark:text-white text-base leading-snug mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
              {external.title}
            </h3>
          )}
          {external.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 leading-relaxed">
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
      className="block rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
    >
      {external.thumbnail_url && (
        <img
          src={external.thumbnail_url}
          alt={external.title || 'Link preview'}
          className="w-full h-40 object-cover"
        />
      )}
      <div className="p-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          {external.display_url}
        </p>
        {external.title && (
          <p className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2">
            {external.title}
          </p>
        )}
        {external.description && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
            {external.description}
          </p>
        )}
      </div>
    </a>
  )
}

/** Thread context component - shows parent tweets in a thread */
interface ThreadContextProps {
  parents: LandingThreadItem[]
  isSelfThread: boolean
  currentAuthor: string
  currentTweetId: string
}

function ThreadContext({ parents, isSelfThread: _isSelfThread, currentAuthor, currentTweetId: _currentTweetId }: ThreadContextProps): React.ReactElement {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const hasParents = parents.length > 0
  const allExpanded = expandedIds.size === parents.length

  const handleToggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleToggleAll = () => {
    if (allExpanded) {
      setExpandedIds(new Set())
    } else {
      setExpandedIds(new Set(parents.map(p => p.id)))
    }
  }

  return (
    <div className="mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
      {/* Thread header with expand all toggle */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <MessageCircle className="w-3.5 h-3.5" />
          <span>
            {hasParents
              ? `${parents.length} earlier in thread`
              : 'Thread'}
          </span>
        </div>
        {hasParents && (
          <button
            onClick={handleToggleAll}
            className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
          >
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>

      {/* Parent tweets - expandable cards */}
      {hasParents && (
        <div className={`mb-2 ${allExpanded ? 'space-y-0' : 'space-y-1.5'}`}>
          {parents.map((parent, index) => {
            const isExpanded = expandedIds.has(parent.id)
            const hasMedia = (parent.media?.photos?.length || 0) > 0 || (parent.media?.videos?.length || 0) > 0
            const isFirst = index === 0
            const isLast = index === parents.length - 1

            return (
              <div
                key={parent.id}
                className={`transition-all ${
                  allExpanded
                    ? `bg-white dark:bg-gray-800 ${isFirst ? 'rounded-t-lg' : ''} ${isLast ? 'rounded-b-lg' : ''} ${!isLast ? 'border-b border-gray-100 dark:border-gray-700' : ''}`
                    : isExpanded
                    ? 'bg-white dark:bg-gray-800 ring-1 ring-purple-200 dark:ring-purple-800 rounded-lg'
                    : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg'
                }`}
              >
                {/* Clickable header */}
                <button
                  onClick={() => handleToggleExpand(parent.id)}
                  className={`w-full flex items-start gap-2.5 p-2.5 text-left ${
                    allExpanded && isExpanded ? 'pb-1' : ''
                  }`}
                >
                  {/* Position badge - more prominent when expanded */}
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isExpanded
                      ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}>
                    {index + 1}
                  </div>

                  {/* Avatar */}
                  {parent.authorProfileImageUrl && (
                    <img
                      src={parent.authorProfileImageUrl}
                      alt=""
                      className="w-6 h-6 rounded-full flex-shrink-0"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    {/* Author line */}
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-sm font-medium truncate transition-colors ${
                        isExpanded
                          ? 'text-purple-600 dark:text-purple-400'
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {parent.authorName || parent.author}
                      </span>
                      {parent.author.toLowerCase() !== currentAuthor.toLowerCase() && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex-shrink-0">
                          different author
                        </span>
                      )}
                    </div>

                    {/* Tweet text */}
                    <p className={`text-sm text-gray-600 dark:text-gray-400 ${
                      isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-1'
                    }`}>
                      {parent.text}
                    </p>
                  </div>

                  {/* Expand/collapse indicator */}
                  <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : hasMedia ? (
                      parent.media?.videos && parent.media.videos.length > 0 ? (
                        <Play className="w-3.5 h-3.5" />
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                          <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 15l-5-5L5 21" />
                        </svg>
                      )
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-2.5 pb-2.5 ml-[52px]">
                    {/* Media */}
                    {hasMedia && (
                      <div className="mt-1 rounded-lg overflow-hidden">
                        {parent.media?.videos && parent.media.videos.length > 0 ? (
                          <VideoPlayer
                            author={parent.author}
                            tweetId={parent.id}
                            thumbnail={parent.media.videos[0].thumbnail_url}
                            width={parent.media.videos[0].width}
                            height={parent.media.videos[0].height}
                          />
                        ) : parent.media?.photos && parent.media.photos.length > 0 ? (
                          <div className={`grid gap-1 ${parent.media.photos.length > 1 ? 'grid-cols-2' : ''}`}>
                            {parent.media.photos.slice(0, 4).map((photo, i) => (
                              <img
                                key={i}
                                src={photo.url}
                                alt=""
                                className="w-full rounded-lg object-cover"
                                style={{ maxHeight: parent.media!.photos!.length === 1 ? '250px' : '120px' }}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Link to view this tweet's page */}
                    <a
                      href={`/${parent.author}/status/${parent.id}`}
                      className="inline-flex items-center justify-center w-6 h-6 mt-2 rounded-full text-gray-400 dark:text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                      title="View full tweet"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Current tweet indicator */}
      {hasParents && (
        <div className="flex items-center gap-2.5 py-2 mb-2">
          <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-purple-600 dark:bg-purple-500 text-white">
            {parents.length + 1}
          </div>
          <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
            You are here
          </span>
        </div>
      )}
    </div>
  )
}
