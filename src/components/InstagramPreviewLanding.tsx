'use client'

import { useState } from 'react'
import {
  ArrowRight,
  Download,
  ExternalLink,
  Instagram,
  Loader2,
  Play,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react'
import { ADHX_PURPLE } from '@/lib/gestalt/theme'
import { AnimatedBackground, LandingAnimations } from '@/components/landing'

interface InstagramPreviewLandingProps {
  reelId: string
  title?: string
  description?: string
  imageUrl?: string
  author?: string
  hasVideo: boolean
}

export function InstagramPreviewLanding({
  reelId,
  title,
  description,
  imageUrl,
  author,
  hasVideo,
}: InstagramPreviewLandingProps) {
  const [downloading, setDownloading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [reelUrl, setReelUrl] = useState('')
  const [urlError, setUrlError] = useState('')

  const instagramUrl = `https://www.instagram.com/reel/${reelId}/`
  const streamUrl = `/api/media/instagram/video?id=${encodeURIComponent(reelId)}`
  const downloadUrl = `/api/media/instagram/video/download?id=${encodeURIComponent(reelId)}`

  const handleDownload = () => {
    setDownloading(true)
    window.location.href = downloadUrl
    setTimeout(() => setDownloading(false), 4000)
  }

  // Instagram Reel/post URL pattern: /reel/, /reels/, or /p/
  const reelUrlPattern = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i

  const parseAndNavigate = (url: string): boolean => {
    const match = url.trim().match(reelUrlPattern)
    if (match) {
      window.location.href = `/reels/${match[1]}/`
      return true
    }
    return false
  }

  const handleReelUrlChange = (value: string) => {
    setReelUrl(value)
    setUrlError('')
    if (value.includes('instagram.com/')) {
      parseAndNavigate(value)
    }
  }

  const handleReelUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setUrlError('')
    if (!parseAndNavigate(reelUrl)) {
      setUrlError("That's not an Instagram link. Or it's been heavily disguised.")
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 relative overflow-x-hidden">
      <LandingAnimations />
      <AnimatedBackground />

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

      <main className="relative z-10 px-4 sm:px-6 pb-6 md:flex-1">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-4 md:mb-6 lg:mb-8 animate-fade-in-up [animation-fill-mode:both]">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3">
              {hasVideo ? 'Grab this Reel?' : 'Instagram preview'}
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              <span className="sm:hidden">
                {hasVideo ? 'One tap. MP4 in your Downloads.' : 'No video available.'}
              </span>
              <span className="hidden sm:inline">
                {hasVideo ? (
                  <>
                    One tap and it&apos;s yours — <span className="text-purple-600 dark:text-purple-400 font-medium">no account, no app, no screen-record</span>.
                  </>
                ) : (
                  'No video available for this post.'
                )}
              </span>
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 md:gap-6 lg:gap-8 items-start">
            {/* Reel card — left column */}
            <div className="animate-fade-in-up [animation-fill-mode:both] delay-100 w-full min-w-0">
              <article
                data-content="instagram-reel"
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl animate-pulse-glow flex flex-col overflow-hidden min-h-[300px] w-full min-w-0"
              >
                <header className="p-4 pb-3">
                  <div className="flex items-center gap-3">
                    <a
                      href={instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 flex-1 min-w-0 group"
                    >
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center ring-2 ring-purple-100 dark:ring-purple-900 group-hover:ring-purple-300 dark:group-hover:ring-purple-700 transition-all flex-shrink-0"
                        style={{
                          background:
                            'linear-gradient(135deg, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
                        }}
                      >
                        <Instagram className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          {author || 'Instagram'}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {author ? 'on Instagram' : `Reel · ${reelId}`}
                        </p>
                      </div>
                    </a>
                    <a
                      href={instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded-full transition-colors"
                      title="View on Instagram"
                    >
                      Open
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </header>

                {(imageUrl || hasVideo) && (
                  <div className="px-4 pb-3">
                    <div
                      className="relative block rounded-xl overflow-hidden bg-black group w-full"
                      style={{ aspectRatio: '9 / 16' }}
                    >
                      {isPlaying && hasVideo ? (
                        <video
                          src={streamUrl}
                          poster={imageUrl}
                          controls
                          autoPlay
                          playsInline
                          className="w-full h-full object-contain bg-black"
                        />
                      ) : (
                        <>
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={description || 'Instagram Reel thumbnail'}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900 to-pink-900">
                              <Instagram className="w-16 h-16 text-white/40" />
                            </div>
                          )}
                          {hasVideo ? (
                            <button
                              onClick={() => setIsPlaying(true)}
                              className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors"
                              aria-label="Play video"
                            >
                              <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                <Play className="w-7 h-7 text-gray-900 ml-1" fill="currentColor" />
                              </div>
                            </button>
                          ) : (
                            <a
                              href={instagramUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="absolute inset-0"
                              aria-label="Open on Instagram"
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {(description || title) && (
                  <div className="px-4 pb-4">
                    <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed text-sm [overflow-wrap:anywhere] line-clamp-6">
                      {description || title}
                    </p>
                  </div>
                )}

                {!imageUrl && !description && !title && (
                  <div className="px-4 pb-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    <p className="mb-1">Reel ID: <code className="font-mono">{reelId}</code></p>
                    <p className="text-xs">This Reel couldn&apos;t be previewed — it may be private, removed, or the embed service is down.</p>
                  </div>
                )}
              </article>

              {/* Mobile CTA — right below the card, above benefits */}
              <div className="md:hidden mt-4 space-y-3">
                <PrimaryCta
                  hasVideo={hasVideo}
                  downloading={downloading}
                  onDownload={handleDownload}
                  instagramUrl={instagramUrl}
                />
              </div>

              <PreviewAnotherReel
                reelUrl={reelUrl}
                urlError={urlError}
                onUrlChange={handleReelUrlChange}
                onSubmit={handleReelUrlSubmit}
                className="md:hidden mt-4"
              />
            </div>

            {/* CTA + benefits — right column */}
            <div
              role="complementary"
              aria-label="ADHX features"
              className="animate-fade-in-up [animation-fill-mode:both] delay-200"
            >
              <div className="hidden md:block space-y-3 animate-fade-in-up [animation-fill-mode:both] delay-300">
                <PrimaryCta
                  hasVideo={hasVideo}
                  downloading={downloading}
                  onDownload={handleDownload}
                  instagramUrl={instagramUrl}
                />
              </div>

              <PreviewAnotherReel
                reelUrl={reelUrl}
                urlError={urlError}
                onUrlChange={handleReelUrlChange}
                onSubmit={handleReelUrlSubmit}
                className="hidden md:block mt-6"
              />

              <div className="space-y-3 md:space-y-4 mt-6 md:mt-8">
                <BenefitItem
                  icon={<Sparkles className="w-5 h-5" />}
                  title="One place for everything"
                  description="Save Reels, tweets, and articles into a single searchable collection. Your chaos, contained."
                />
                <BenefitItem
                  icon={<Zap className="w-5 h-5" />}
                  title="Download in one tap"
                  description="MP4 straight to your device. No account. No app. No screen-record workaround."
                />
                <BenefitItem
                  icon={<Search className="w-5 h-5" />}
                  title="Actually find it later"
                  description="Full-text search across everything you&apos;ve saved. That Reel from 3 months ago? Found."
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

function PrimaryCta({
  hasVideo,
  downloading,
  onDownload,
  instagramUrl,
}: {
  hasVideo: boolean
  downloading: boolean
  onDownload: () => void
  instagramUrl: string
}) {
  if (!hasVideo) {
    return (
      <a
        href={instagramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-semibold text-white rounded-full transition-all hover:scale-[1.02] hover:shadow-xl"
        style={{ backgroundColor: ADHX_PURPLE }}
      >
        <ExternalLink className="w-5 h-5" />
        Open on Instagram
        <ArrowRight className="w-5 h-5" />
      </a>
    )
  }

  return (
    <>
      <button
        onClick={onDownload}
        disabled={downloading}
        className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-semibold text-white rounded-full transition-all hover:scale-[1.02] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: ADHX_PURPLE }}
      >
        {downloading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Starting download…
          </>
        ) : (
          <>
            <Download className="w-5 h-5" />
            Download MP4
          </>
        )}
      </button>
      <a
        href={instagramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 text-lg font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-full transition-all hover:bg-gray-200 dark:hover:bg-gray-700"
      >
        <ExternalLink className="w-5 h-5" />
        View on Instagram
      </a>
      <p className="text-center text-sm text-gray-500 dark:text-gray-400">
        Free. No account. No watermark.
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

function PreviewAnotherReel({
  reelUrl,
  urlError,
  onUrlChange,
  onSubmit,
  className,
}: {
  reelUrl: string
  urlError: string
  onUrlChange: (value: string) => void
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
          <Instagram className="w-4 h-4 text-purple-600 dark:text-purple-300" />
        </div>
        <div>
          <p className="font-medium text-gray-900 dark:text-white text-sm mb-1">Preview another Reel</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Paste any Instagram Reel or post link</p>
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <div className="flex gap-2">
          <input
            type="text"
            value={reelUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="Paste an Instagram link here..."
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
          instagram.com
        </code>{' '}
        with{' '}
        <code className="bg-purple-100 dark:bg-purple-800/50 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300 font-mono">
          adhx.com
        </code>
      </p>
    </div>
  )
}
