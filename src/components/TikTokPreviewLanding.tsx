'use client'

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  Loader2,
  Play,
  Search,
  Share2,
  Sparkles,
  Zap,
} from 'lucide-react'
import { ADHX_PURPLE } from '@/lib/gestalt/theme'
import { AnimatedBackground, LandingAnimations } from '@/components/landing'
import { isTouchDevice } from '@/components/feed/utils'
import { XIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

interface TikTokPreviewLandingProps {
  username: string
  videoId: string
  authorName?: string
  author?: string
  description?: string
  hasVideo: boolean
}

export function TikTokPreviewLanding({
  username,
  videoId,
  authorName,
  author,
  description,
  hasVideo,
}: TikTokPreviewLandingProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [linkInput, setLinkInput] = useState('')
  const [urlError, setUrlError] = useState('')
  const [connecting, setConnecting] = useState(false)

  const handle = username.startsWith('@') ? username.slice(1) : username
  const tiktokUrl = `https://www.tiktok.com/@${handle}/video/${videoId}`
  const streamUrl = `/api/media/tiktok/video?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(videoId)}`
  const downloadUrl = `/api/media/tiktok/video/download?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(videoId)}`

  // TikTok URL pattern — works with vm., m., www. subdomains
  const tiktokUrlPattern = /(?:https?:\/\/)?(?:www\.|vm\.|m\.)?tiktok\.com\/@([A-Za-z0-9._]{1,30})\/video\/(\d{6,25})/i

  const parseAndNavigate = (url: string): boolean => {
    const match = url.trim().match(tiktokUrlPattern)
    if (match) {
      window.location.href = `/@${match[1]}/video/${match[2]}`
      return true
    }
    return false
  }

  const handleInputChange = (value: string) => {
    setLinkInput(value)
    setUrlError('')
    if (value.includes('tiktok.com/')) parseAndNavigate(value)
  }

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setUrlError('')
    if (!parseAndNavigate(linkInput)) {
      setUrlError("That's not a TikTok link. Or it's been heavily disguised.")
    }
  }

  const handleConnect = () => {
    setConnecting(true)
    const returnUrl = encodeURIComponent(window.location.pathname)
    window.location.href = `/api/auth/twitter?returnUrl=${returnUrl}`
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
                data-content="tiktok-video"
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl animate-pulse-glow flex flex-col overflow-hidden min-h-[300px] w-full min-w-0"
              >
                <header className="p-4 pb-3">
                  <div className="flex items-center gap-3">
                    <a
                      href={tiktokUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 flex-1 min-w-0 group"
                    >
                      <div className="w-12 h-12 rounded-full flex items-center justify-center ring-2 ring-purple-100 dark:ring-purple-900 group-hover:ring-purple-300 dark:group-hover:ring-purple-700 transition-all flex-shrink-0 bg-black">
                        <TikTokGlyph className="w-7 h-7" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          {authorName || author || `@${handle}`}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {author || `@${handle}`} · on TikTok
                        </p>
                      </div>
                    </a>
                    <a
                      href={tiktokUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded-full transition-colors"
                      title="View on TikTok"
                    >
                      Open
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </header>

                {description && (
                  <div className="px-4 py-3">
                    <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
                      {description}
                    </p>
                  </div>
                )}

                {hasVideo && (
                  <div className="px-4 pb-3">
                    <div
                      className="relative block rounded-xl overflow-hidden bg-black group w-full"
                      style={{ aspectRatio: '9 / 16' }}
                    >
                      {isPlaying ? (
                        <video
                          src={streamUrl}
                          controls
                          autoPlay
                          playsInline
                          className="w-full h-full object-contain bg-black"
                        />
                      ) : (
                        <>
                          <div className="w-full h-full flex items-center justify-center">
                            <TikTokGlyph className="w-20 h-20 opacity-30" />
                          </div>
                          <button
                            onClick={() => setIsPlaying(true)}
                            className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors"
                            aria-label="Play video"
                          >
                            <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                              <Play className="w-7 h-7 text-gray-900 ml-1" fill="currentColor" />
                            </div>
                          </button>
                        </>
                      )}
                      <div className="absolute top-3 right-3 pointer-events-auto">
                        <TikTokShareButton
                          handle={handle}
                          videoId={videoId}
                          streamUrl={streamUrl}
                          downloadUrl={downloadUrl}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {!hasVideo && !description && (
                  <div className="px-4 pb-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    <p className="mb-1">
                      TikTok ID: <code className="font-mono">{videoId}</code>
                    </p>
                    <p className="text-xs">
                      This TikTok couldn&apos;t be previewed — it may be private, removed, or the embed service is down.
                    </p>
                  </div>
                )}

                <footer className="px-3 sm:px-4 py-2.5 sm:py-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <TikTokGlyph className="w-4 h-4" />
                    TikTok video
                  </span>
                  <a
                    href={tiktokUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                    title="View on TikTok"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="text-xs hidden lg:inline">View on TikTok</span>
                  </a>
                </footer>
              </article>

              <div className="md:hidden mt-4 space-y-3">
                <ConnectCta connecting={connecting} onConnect={handleConnect} />
              </div>

              <PreviewAnotherTikTok
                linkInput={linkInput}
                urlError={urlError}
                onChange={handleInputChange}
                onSubmit={handleInputSubmit}
                className="md:hidden mt-4"
              />
            </div>

            {/* Sidebar — right column */}
            <div
              role="complementary"
              aria-label="ADHX features"
              className="animate-fade-in-up [animation-fill-mode:both] delay-200"
            >
              <div className="hidden md:block space-y-3 animate-fade-in-up [animation-fill-mode:both] delay-300">
                <ConnectCta connecting={connecting} onConnect={handleConnect} />
              </div>

              <PreviewAnotherTikTok
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
                  description="Save TikToks, Reels, tweets, and articles into a single searchable collection. Your chaos, contained."
                />
                <BenefitItem
                  icon={<Zap className="w-5 h-5" />}
                  title="Download in one tap"
                  description="MP4 straight to your device. No account. No app. No watermark."
                />
                <BenefitItem
                  icon={<Search className="w-5 h-5" />}
                  title="Actually find it later"
                  description="Full-text search across everything you&apos;ve saved. That TikTok from 3 months ago? Found."
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

/** TikTok brand glyph — inline SVG since lucide doesn't ship one. */
function TikTokGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        fill="#25F4EE"
        d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743 2.896 2.896 0 0 1 2.342-4.585c.28 0 .55.04.808.115V9.435a6.327 6.327 0 0 0-.808-.051 6.272 6.272 0 0 0-6.272 6.272A6.272 6.272 0 0 0 9.515 22h.005a6.272 6.272 0 0 0 6.272-6.272V8.687a8.182 8.182 0 0 0 4.773 1.526V6.78a4.795 4.795 0 0 1-.976-.094z"
      />
      <path
        fill="#FE2C55"
        d="M18.589 7.686a4.793 4.793 0 0 1-3.77-4.245V3h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743 2.896 2.896 0 0 1 2.342-4.585c.28 0 .55.04.808.115v-3.51a6.327 6.327 0 0 0-.808-.051 6.272 6.272 0 0 0-6.272 6.272A6.272 6.272 0 0 0 8.515 23h.005a6.272 6.272 0 0 0 6.272-6.272V9.687a8.182 8.182 0 0 0 4.773 1.526V7.78a4.795 4.795 0 0 1-.976-.094z"
      />
      <path
        fill="#fff"
        d="M19.045 7.236a4.793 4.793 0 0 1-3.77-4.245v-.5h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743 2.896 2.896 0 0 1 2.342-4.585c.28 0 .55.04.808.115v-3.51a6.327 6.327 0 0 0-.808-.051 6.272 6.272 0 0 0-6.272 6.272A6.272 6.272 0 0 0 8.97 22.5h.005a6.272 6.272 0 0 0 6.272-6.272V9.187a8.182 8.182 0 0 0 4.773 1.526V7.28a4.795 4.795 0 0 1-.976-.094z"
      />
    </svg>
  )
}

function TikTokShareButton({
  handle,
  videoId,
  streamUrl,
  downloadUrl,
}: {
  handle: string
  videoId: string
  streamUrl: string
  downloadUrl: string
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(isTouchDevice())
  }, [])

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setIsLoading(true)
    try {
      if (isMobile && typeof navigator.share === 'function') {
        await navigator.share({
          url: new URL(streamUrl, window.location.origin).toString(),
          title: `TikTok @${handle} ${videoId}`,
        })
        setShowSuccess(true)
      } else {
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = ''
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setShowSuccess(true)
      }
    } catch {
      // User cancelled share sheet or download failed — silently reset
    } finally {
      setIsLoading(false)
      setTimeout(() => setShowSuccess(false), 1500)
    }
  }

  const visibilityClass = isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        'p-2 bg-black/60 hover:bg-black/80 rounded-full transition-all disabled:opacity-80',
        visibilityClass,
      )}
      title={isMobile ? 'Share' : 'Download'}
      aria-label={isMobile ? 'Share TikTok' : 'Download TikTok'}
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

function ConnectCta({ connecting, onConnect }: { connecting: boolean; onConnect: () => void }) {
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
        Save TikToks, Reels, and tweets in one place. Free forever.
      </p>
    </>
  )
}

function BenefitItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
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

function PreviewAnotherTikTok({
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
          <TikTokGlyph className="w-4 h-4" />
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white text-sm mb-1">Preview another TikTok</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Paste any TikTok video link</p>
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <div className="flex gap-2">
          <input
            type="text"
            value={linkInput}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Paste a TikTok link here..."
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
        <code className="bg-purple-100 dark:bg-purple-800/50 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300 font-mono">
          tiktok.com
        </code>{' '}
        with{' '}
        <code className="bg-purple-100 dark:bg-purple-800/50 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300 font-mono">
          adhx.com
        </code>
      </p>
    </div>
  )
}
