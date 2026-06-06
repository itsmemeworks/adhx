'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, ExternalLink, Loader2, Play, Plus, Search, Sparkles, Youtube, Zap } from 'lucide-react'
import { ADHX_PURPLE } from '@/lib/gestalt/theme'
import { AnimatedBackground, LandingAnimations } from '@/components/landing'
import { XIcon } from '@/components/icons'
import { extractYouTubeId, youtubeEmbedUrl, youtubeShortUrl, youtubeThumbnail } from '@/lib/media/youtube'

interface YouTubePreviewLandingProps {
  videoId: string
  title?: string
  authorName?: string
  author?: string
  hasVideo: boolean
  isAuthenticated?: boolean
}

export function YouTubePreviewLanding({
  videoId,
  title,
  authorName,
  author,
  hasVideo,
  isAuthenticated = false,
}: YouTubePreviewLandingProps) {
  const router = useRouter()
  const [isPlaying, setIsPlaying] = useState(false)
  const [linkInput, setLinkInput] = useState('')
  const [urlError, setUrlError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [adding, setAdding] = useState(false)

  const shortUrl = youtubeShortUrl(videoId)
  const channel = author || (authorName ? authorName : '@youtube')

  const parseAndNavigate = (url: string): boolean => {
    const id = extractYouTubeId(url.trim())
    if (id) {
      window.location.href = `/shorts/${id}`
      return true
    }
    return false
  }

  const handleInputChange = (value: string) => {
    setLinkInput(value)
    setUrlError('')
    if (/youtu\.?be/i.test(value)) parseAndNavigate(value)
  }

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setUrlError('')
    if (!parseAndNavigate(linkInput)) {
      setUrlError("That's not a YouTube link. Or it's been heavily disguised.")
    }
  }

  const handleConnect = () => {
    setConnecting(true)
    const returnUrl = encodeURIComponent(window.location.pathname)
    window.location.href = `/api/auth/twitter?returnUrl=${returnUrl}`
  }

  const handleAddToCollection = async () => {
    setAdding(true)
    try {
      const response = await fetch('/api/bookmarks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: shortUrl, source: 'url_prefix' }),
      })
      const data = await response.json()
      if (data.success) {
        router.push(`/?added=success&platform=youtube&id=${videoId}`)
      } else if (data.isDuplicate) {
        router.push(`/?added=duplicate&platform=youtube&id=${videoId}`)
      } else {
        router.push(`/?added=error&error=${encodeURIComponent(data.error || 'Failed to save')}`)
      }
    } catch (error) {
      router.push(`/?added=error&error=${encodeURIComponent(error instanceof Error ? error.message : 'Failed to save')}`)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 relative overflow-x-hidden">
      <LandingAnimations />
      <AnimatedBackground />

      <main className="relative z-10 px-4 sm:px-6 pb-6 md:flex-1 pt-4 sm:pt-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-4 md:mb-6 lg:mb-8 animate-fade-in-up [animation-fill-mode:both]">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3">
              Found something good?
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              <span className="sm:hidden">Save it now before you forget.</span>
              <span className="hidden sm:inline">
                Save it now before{' '}
                <span className="text-purple-600 dark:text-purple-400 font-medium">47 browser tabs</span>{' '}
                make you forget.
              </span>
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 md:gap-6 lg:gap-8 items-start">
            {/* Card — left column */}
            <div className="animate-fade-in-up [animation-fill-mode:both] delay-100 w-full min-w-0">
              <article
                data-content="youtube-short"
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl animate-pulse-glow flex flex-col overflow-hidden min-h-[300px] w-full min-w-0"
              >
                <header className="p-4 pb-3">
                  <div className="flex items-center gap-3">
                    <a href={shortUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 flex-1 min-w-0 group">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center ring-2 ring-red-100 dark:ring-red-900 group-hover:ring-red-300 dark:group-hover:ring-red-700 transition-all flex-shrink-0 bg-red-600">
                        <Youtube className="w-7 h-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          {authorName || channel}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {channel} · on YouTube
                        </p>
                      </div>
                    </a>
                    <a
                      href={shortUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded-full transition-colors"
                      title="Watch on YouTube"
                    >
                      Open
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </header>

                {title && (
                  <div className="px-4 py-3">
                    <p className="text-gray-800 dark:text-gray-200 font-medium break-words leading-relaxed [overflow-wrap:anywhere]">
                      {title}
                    </p>
                  </div>
                )}

                {hasVideo && (
                  <div className="px-4 pb-3">
                    <div className="relative block rounded-xl overflow-hidden bg-black group w-full mx-auto" style={{ aspectRatio: '9 / 16', maxWidth: 360 }}>
                      {isPlaying ? (
                        <iframe
                          src={`${youtubeEmbedUrl(videoId)}?autoplay=1`}
                          title={title || 'YouTube Short'}
                          className="absolute inset-0 w-full h-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          referrerPolicy="strict-origin-when-cross-origin"
                          allowFullScreen
                        />
                      ) : (
                        <>
                          <img
                            src={youtubeThumbnail(videoId)}
                            alt={title || 'YouTube Short thumbnail'}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <button
                            onClick={() => setIsPlaying(true)}
                            className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors"
                            aria-label="Play video"
                          >
                            <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                              <Play className="w-7 h-7 text-white ml-1" fill="currentColor" />
                            </div>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {!hasVideo && (
                  <div className="px-4 pb-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    <p className="mb-1">
                      YouTube ID: <code className="font-mono">{videoId}</code>
                    </p>
                    <p className="text-xs">
                      This Short couldn&apos;t be previewed — it may be private, removed, or age-restricted.
                    </p>
                  </div>
                )}

                <footer className="px-3 sm:px-4 py-2.5 sm:py-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <Youtube className="w-4 h-4 text-red-600" />
                    YouTube Short
                  </span>
                  <a
                    href={shortUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                    title="Watch on YouTube"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="text-xs hidden lg:inline">Watch on YouTube</span>
                  </a>
                </footer>
              </article>

              <div className="md:hidden mt-4 space-y-3">
                <SidebarCta
                  isAuthenticated={isAuthenticated}
                  hasVideo={hasVideo}
                  adding={adding}
                  connecting={connecting}
                  onAdd={handleAddToCollection}
                  onConnect={handleConnect}
                />
              </div>

              <PreviewAnother
                linkInput={linkInput}
                urlError={urlError}
                onChange={handleInputChange}
                onSubmit={handleInputSubmit}
                className="md:hidden mt-4"
              />
            </div>

            {/* Sidebar — right column */}
            <div role="complementary" aria-label="ADHX features" className="animate-fade-in-up [animation-fill-mode:both] delay-200">
              <div className="hidden md:block space-y-3 animate-fade-in-up [animation-fill-mode:both] delay-300">
                <SidebarCta
                  isAuthenticated={isAuthenticated}
                  hasVideo={hasVideo}
                  adding={adding}
                  connecting={connecting}
                  onAdd={handleAddToCollection}
                  onConnect={handleConnect}
                />
              </div>

              <PreviewAnother
                linkInput={linkInput}
                urlError={urlError}
                onChange={handleInputChange}
                onSubmit={handleInputSubmit}
                className="hidden md:block mt-6"
              />

              <div className="space-y-3 md:space-y-4 mt-6 md:mt-8">
                <BenefitItem
                  icon={<Sparkles className="w-5 h-5" />}
                  title="One place for everything"
                  description="Save Shorts, TikToks, Reels, tweets, and articles into a single searchable collection. Your chaos, contained."
                />
                <BenefitItem
                  icon={<Zap className="w-5 h-5" />}
                  title="Watch without the rabbit hole"
                  description="Play the Short right here — no recommendations, no autoplay-next, no doomscroll."
                />
                <BenefitItem
                  icon={<Search className="w-5 h-5" />}
                  title="Actually find it later"
                  description="Full-text search across everything you&apos;ve saved. That Short from 3 months ago? Found."
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-3 text-center flex-shrink-0">
        <p className="text-gray-400 dark:text-gray-500 font-indie-flower text-sm">
          Save now. Read never. Find always.
        </p>
      </footer>
    </div>
  )
}

function SidebarCta({
  isAuthenticated,
  hasVideo,
  adding,
  connecting,
  onAdd,
  onConnect,
}: {
  isAuthenticated: boolean
  hasVideo: boolean
  adding: boolean
  connecting: boolean
  onAdd: () => void
  onConnect: () => void
}) {
  if (isAuthenticated) {
    return (
      <>
        <button
          onClick={onAdd}
          disabled={adding || !hasVideo}
          className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-semibold text-white rounded-full transition-all hover:scale-[1.02] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: ADHX_PURPLE }}
        >
          {adding ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Plus className="w-5 h-5" />
              Add to Collection
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Save this Short to your ADHX collection. Private to you.
        </p>
      </>
    )
  }

  return (
    <>
      <button
        onClick={onConnect}
        disabled={connecting}
        className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-semibold text-white rounded-full transition-all hover:scale-[1.02] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: ADHX_PURPLE }}
      >
        {connecting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <XIcon className="w-5 h-5" />
            Start saving with ADHX
            <ArrowRight className="w-5 h-5" />
          </>
        )}
      </button>
      <p className="text-center text-sm text-gray-500 dark:text-gray-400">
        Save Shorts, TikToks, Reels, and tweets in one place. Free forever.
      </p>
    </>
  )
}

function BenefitItem({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex gap-4 p-4 rounded-xl bg-white dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-700 transition-colors">
      <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${ADHX_PURPLE}15`, color: ADHX_PURPLE }}>
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-0.5">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

function PreviewAnother({
  linkInput,
  urlError,
  onChange,
  onSubmit,
  className,
}: {
  linkInput: string
  urlError: string
  onChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  className?: string
}) {
  return (
    <div
      data-section="preview-another"
      className={`p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-800 animate-fade-in-up [animation-fill-mode:both] delay-400 ${className || ''}`}
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-800 flex items-center justify-center">
          <Youtube className="w-4 h-4 text-red-600" />
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white text-sm mb-1">Preview another Short</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Paste any YouTube Short or video link</p>
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <div className="flex gap-2">
          <input
            type="text"
            value={linkInput}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Paste a YouTube link here..."
            className="flex-1 font-mono text-base sm:text-xs bg-white dark:bg-gray-900 px-3 py-2 rounded-lg border border-purple-200 dark:border-purple-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm text-white font-medium rounded-lg transition-all hover:scale-105"
            style={{ backgroundColor: ADHX_PURPLE }}
          >
            Go
          </button>
        </div>
        {urlError && <p className="text-red-500 text-xs mt-2">{urlError}</p>}
      </form>

      <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
        Or use the URL trick: replace{' '}
        <code className="bg-purple-100 dark:bg-purple-800/50 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300 font-mono">youtube.com</code>{' '}
        with{' '}
        <code className="bg-purple-100 dark:bg-purple-800/50 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300 font-mono">adhx.com</code>
      </p>
    </div>
  )
}
