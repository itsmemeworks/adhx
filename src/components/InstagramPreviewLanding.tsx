'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  ExternalLink,
  Instagram,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react'
import { ADHX_PURPLE } from '@/lib/gestalt/theme'
import { AnimatedBackground, LandingAnimations } from '@/components/landing'
import { XIcon } from '@/components/icons'

interface InstagramPreviewLandingProps {
  reelId: string
  caption?: string
  description?: string
  imageUrl?: string
  author?: string
  authorName?: string
  isAuthenticated?: boolean
}

export function InstagramPreviewLanding({
  reelId,
  caption,
  description,
  imageUrl,
  author,
  authorName,
  isAuthenticated = false,
}: InstagramPreviewLandingProps) {
  const router = useRouter()
  const [reelUrl, setReelUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [adding, setAdding] = useState(false)

  const instagramUrl = `https://www.instagram.com/reel/${reelId}/`

  const reelUrlPattern = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/i

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
    if (value.includes('instagram.com/')) parseAndNavigate(value)
  }

  const handleReelUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setUrlError('')
    if (!parseAndNavigate(reelUrl)) {
      setUrlError("That's not an Instagram link. Or it's been heavily disguised.")
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
        body: JSON.stringify({
          url: instagramUrl,
          source: 'url_prefix',
        }),
      })
      const data = await response.json()
      if (data.success) {
        router.push(`/?added=success&platform=instagram&id=${reelId}`)
      } else if (data.isDuplicate) {
        router.push(`/?added=duplicate&platform=instagram&id=${reelId}`)
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
                          {authorName || author || 'Instagram'}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {author ? `${author} · on Instagram` : `Reel · ${reelId}`}
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

                {/* Caption — placed above media to match X tweet text/media order */}
                {(caption || description) && (
                  <div className="px-4 py-3">
                    <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
                      {caption || description}
                    </p>
                  </div>
                )}

                {/* Poster — Instagram no longer exposes a playable video, so the
                    Reel degrades to a thumbnail that links out to Instagram. */}
                {imageUrl && (
                  <div className="px-4 pb-3">
                    <a
                      href={instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative block rounded-xl overflow-hidden bg-black group w-full"
                      style={{ aspectRatio: '9 / 16' }}
                      aria-label="View on Instagram"
                    >
                      <img
                        src={imageUrl}
                        alt={caption || 'Instagram Reel thumbnail'}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/30 transition-colors">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          <ExternalLink className="w-4 h-4" />
                          View on Instagram
                        </span>
                      </div>
                    </a>
                  </div>
                )}

                {!imageUrl && !caption && !description && (
                  <div className="px-4 pb-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    <p className="mb-1">
                      Reel ID: <code className="font-mono">{reelId}</code>
                    </p>
                    <p className="text-xs">
                      We couldn&apos;t pull a preview for this Reel — open it on Instagram below. You can still save it to your collection.
                    </p>
                  </div>
                )}

                {/* Footer — engagement-stats equivalent for parity with X tweet card */}
                <footer className="px-3 sm:px-4 py-2.5 sm:py-3 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <Instagram className="w-4 h-4" />
                    Instagram Reel
                  </span>
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                    title="View on Instagram"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="text-xs hidden lg:inline">View on Instagram</span>
                  </a>
                </footer>
              </article>

              <div className="md:hidden mt-4 space-y-3">
                <SidebarCta
                  isAuthenticated={isAuthenticated}
                  adding={adding}
                  connecting={connecting}
                  onAdd={handleAddToCollection}
                  onConnect={handleConnect}
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

            {/* Sidebar — right column */}
            <div
              role="complementary"
              aria-label="ADHX features"
              className="animate-fade-in-up [animation-fill-mode:both] delay-200"
            >
              <div className="hidden md:block space-y-3 animate-fade-in-up [animation-fill-mode:both] delay-300">
                <SidebarCta
                  isAuthenticated={isAuthenticated}
                  adding={adding}
                  connecting={connecting}
                  onAdd={handleAddToCollection}
                  onConnect={handleConnect}
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
                  title="Save it before it vanishes"
                  description="Poster, caption, and a link back to the source — saved to your collection in one tap."
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

function SidebarCta({
  isAuthenticated,
  adding,
  connecting,
  onAdd,
  onConnect,
}: {
  isAuthenticated: boolean
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
          disabled={adding}
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
          Save this Reel to your ADHX collection. Private to you.
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
        Save Reels, tweets, and articles in one place. Free forever.
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
