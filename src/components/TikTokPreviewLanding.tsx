'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bookmark,
  Check,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  Play,
  Search,
  Share2,
  Sparkles,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { AnimatedBackground, LandingAnimations } from '@/components/landing'
import { ThemeToggle } from '@/components/ThemeToggle'
import { isTouchDevice } from '@/components/feed/utils'
import { MatterLogo, PlatformGlyph, ConnectWithX } from '@/components/matter'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { PreviewAnotherLink } from '@/components/PreviewAnotherLink'
import { cn } from '@/lib/utils'

/**
 * TikTok video IDs are Snowflake-style: the high 32 bits are the Unix creation
 * time (seconds). Derive the post date from the id — no metadata fetch needed.
 */
function tiktokDateFromId(id: string): string | null {
  try {
    const secs = Number(BigInt(id) >> BigInt(32))
    if (secs < 1_400_000_000 || secs > 4_000_000_000) return null // ~2014–2096 sanity check
    return new Date(secs * 1000).toISOString()
  } catch {
    return null
  }
}

interface TikTokPreviewLandingProps {
  username: string
  videoId: string
  authorName?: string
  author?: string
  description?: string
  hasVideo: boolean
  isAuthenticated?: boolean
}

export function TikTokPreviewLanding({
  username,
  videoId,
  authorName,
  author,
  description,
  hasVideo,
  isAuthenticated = false,
}: TikTokPreviewLandingProps) {
  const router = useRouter()
  const [isPlaying, setIsPlaying] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [adding, setAdding] = useState(false)

  const handle = username.startsWith('@') ? username.slice(1) : username
  const tiktokUrl = `https://www.tiktok.com/@${handle}/video/${videoId}`
  const streamUrl = `/api/media/tiktok/video?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(videoId)}`
  const downloadUrl = `/api/media/tiktok/video/download?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(videoId)}`
  const posterUrl = `/api/media/tiktok/thumbnail?username=${encodeURIComponent(handle)}&id=${encodeURIComponent(videoId)}`
  const postedAt = tiktokDateFromId(videoId)

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
          url: tiktokUrl,
          source: 'url_prefix',
        }),
      })
      const data = await response.json()
      if (data.success) {
        router.push(`/?added=success&platform=tiktok&id=${videoId}`)
      } else if (data.isDuplicate) {
        router.push(`/?added=duplicate&platform=tiktok&id=${videoId}`)
      } else {
        router.push(`/?added=error&error=${encodeURIComponent(data.error || 'Failed to save')}`)
      }
    } catch (error) {
      router.push(`/?added=error&error=${encodeURIComponent(error instanceof Error ? error.message : 'Failed to save')}`)
    }
  }

  const sidebar = (
    <>
      <SidebarCta
        isAuthenticated={isAuthenticated}
        hasVideo={hasVideo}
        adding={adding}
        connecting={connecting}
        onAdd={handleAddToCollection}
        onConnect={handleConnect}
        handle={handle}
        videoId={videoId}
        downloadUrl={downloadUrl}
      />
      <PreviewAnotherLink className="mt-4" />
    </>
  )

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

      <main className="relative z-10 px-4 sm:px-6 lg:px-12 pb-14 md:flex-1 pt-8 sm:pt-12">
        <div className="max-w-[1040px] mx-auto">
          <PreviewHeader />

          <div className="grid md:grid-cols-[minmax(0,430px)_1fr] gap-8 lg:gap-12 items-start mt-8 md:mt-10">
            {/* Card — left column */}
            <div className="animate-fade-in-up [animation-fill-mode:both] delay-100 w-full min-w-0">
              <article
                data-content="tiktok-video"
                className="bg-surface rounded-card border border-hairline shadow-m-lg flex flex-col overflow-hidden min-h-[300px] w-full min-w-0"
              >
                <header className="px-4 pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <a
                      href={tiktokUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 flex-1 min-w-0 group"
                    >
                      <div className="w-[42px] h-[42px] rounded-full flex items-center justify-center flex-shrink-0 bg-black">
                        <TikTokGlyph className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[15px] text-ink truncate group-hover:text-clay transition-colors">
                          {authorName || author || `@${handle}`}
                        </p>
                        <p className="font-mono text-[12.5px] text-ink-3 truncate">
                          {author || `@${handle}`}
                        </p>
                      </div>
                    </a>
                    <a
                      href={tiktokUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12.5px] font-semibold bg-inset text-ink-2 hover:text-clay transition-colors"
                      title="View on TikTok"
                    >
                      {postedAt && <span className="font-mono">{formatCompactRelativeTime(postedAt)}</span>}
                      <PlatformGlyph platform="tiktok" size={13} />
                    </a>
                  </div>
                </header>

                {description && (
                  <div className="px-4 pb-3">
                    <p
                      className={cn(
                        'text-[14.5px] text-ink-2 break-words leading-relaxed [overflow-wrap:anywhere]',
                        hasVideo ? 'line-clamp-3' : 'whitespace-pre-wrap',
                      )}
                    >
                      {description}
                    </p>
                  </div>
                )}

                {hasVideo && (
                  <div className="px-4 pb-3">
                    <div
                      className="relative block rounded-2xl overflow-hidden bg-black group w-full"
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
                          {/* Glyph fallback sits behind the poster (shown if it fails to load). */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <TikTokGlyph className="w-20 h-20 opacity-30" />
                          </div>
                          <img
                            src={posterUrl}
                            alt={description || 'TikTok video'}
                            className="absolute inset-0 w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                          <button
                            onClick={() => setIsPlaying(true)}
                            className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors"
                            aria-label="Play video"
                          >
                            <div className="w-[60px] h-[60px] bg-white/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                              <Play className="w-6 h-6 text-gray-900 ml-1" fill="currentColor" />
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
                  <div className="px-4 pb-4 text-center text-ink-3 text-sm">
                    <p className="mb-1">
                      TikTok ID: <code className="font-mono">{videoId}</code>
                    </p>
                    <p className="text-xs">
                      This TikTok couldn&apos;t be previewed — it may be private, removed, or the embed service is down.
                    </p>
                  </div>
                )}

                <footer className="px-4 py-3 flex items-center justify-between gap-3 min-w-0">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-ink-3">
                    <PlatformGlyph platform="tiktok" size={14} />
                    TikTok video
                  </span>
                  <a
                    href={tiktokUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[13px] font-semibold text-clay hover:opacity-80 transition-opacity"
                    title="View on TikTok"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View original
                  </a>
                </footer>
              </article>

              {/* Mobile actions */}
              <div className="md:hidden mt-6 space-y-3.5">{sidebar}</div>
            </div>

            {/* Sidebar — right column (desktop) */}
            <div
              role="complementary"
              aria-label="ADHX features"
              className="hidden md:flex flex-col gap-3.5 animate-fade-in-up [animation-fill-mode:both] delay-200"
            >
              {sidebar}
              <ValueCard />
            </div>

            {/* Value card — mobile, full width below */}
            <div className="md:hidden">
              <ValueCard />
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-4 text-center flex-shrink-0">
        <p className="text-ink-3 font-indie-flower text-sm">Save now. Read never. Find always.</p>
      </footer>
    </div>
  )
}

/** Centered Matter preview header — shared shell across all four preview pages. */
function PreviewHeader() {
  return (
    <div className="text-center animate-fade-in-up [animation-fill-mode:both]">
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
        Save it before you{' '}
        <b className="text-clay font-semibold">doomscroll</b>{' '}
        past it.
      </p>
    </div>
  )
}

/** Shared 3-row value card (bullets). */
function ValueCard() {
  const rows: Array<[React.ReactNode, string, string]> = [
    [<Sparkles key="s" className="w-[17px] h-[17px]" />, 'One place for everything', 'TikToks, Reels, Shorts, tweets & articles in one searchable home.'],
    [<Zap key="z" className="w-[17px] h-[17px]" />, 'Save it before it vanishes', 'Preview any TikTok and save it to your collection — alongside your tweets and articles.'],
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

function SidebarCta({
  isAuthenticated,
  hasVideo,
  adding,
  connecting,
  onAdd,
  onConnect,
  handle,
  videoId,
  downloadUrl,
}: {
  isAuthenticated: boolean
  hasVideo: boolean
  adding: boolean
  connecting: boolean
  onAdd: () => void
  onConnect: () => void
  handle: string
  videoId: string
  downloadUrl: string
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {isAuthenticated ? (
        <button
          onClick={onAdd}
          disabled={adding || !hasVideo}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl bg-clay-grad text-white font-bold text-base shadow-glow transition-all hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {adding ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Bookmark className="w-[18px] h-[18px]" />}
          {adding ? 'Saving…' : 'Save to collection'}
        </button>
      ) : (
        <button
          onClick={onConnect}
          disabled={connecting}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl bg-ink text-surface font-bold text-base transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connecting ? (
            <>
              <Loader2 className="w-[18px] h-[18px] animate-spin" />
              Connecting…
            </>
          ) : (
            <ConnectWithX size={16} />
          )}
        </button>
      )}

      {/* Secondary action row */}
      <SecondaryActions handle={handle} videoId={videoId} downloadUrl={downloadUrl} showDownload={hasVideo} />

      {/* Keep it forever — accent-tinted card → Connect with X (only when unauthenticated) */}
      {!isAuthenticated && (
        <div className="rounded-2xl px-4 py-4 bg-clay/10 border border-clay/20">
          <div className="font-bold text-sm text-ink mb-0.5">Keep it forever</div>
          <p className="text-[13px] text-ink-2 leading-snug mb-3">
            Create a free account to save everything you preview — private to you.
          </p>
          <button
            onClick={onConnect}
            disabled={connecting}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-ink text-surface font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
          >
            <ConnectWithX size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Copy link / Share / Download secondary action row. */
function SecondaryActions({
  handle,
  videoId,
  downloadUrl,
  showDownload,
}: {
  handle: string
  videoId: string
  downloadUrl: string
  showDownload: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ url, title: `TikTok @${handle} ${videoId}` })
        setShared(true)
      } else {
        await navigator.clipboard.writeText(url)
        setShared(true)
      }
      setTimeout(() => setShared(false), 1500)
    } catch {
      /* cancelled */
    }
  }

  const download = () => {
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = ''
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="flex gap-2.5">
      <ActBtn icon={copied ? <Check className="w-[19px] h-[19px]" /> : <Link2 className="w-[19px] h-[19px]" />} label={copied ? 'Copied' : 'Copy link'} onClick={copyLink} />
      <ActBtn icon={shared ? <Check className="w-[19px] h-[19px]" /> : <Share2 className="w-[19px] h-[19px]" />} label={shared ? 'Shared' : 'Share'} onClick={share} />
      {showDownload && <ActBtn icon={<Download className="w-[19px] h-[19px]" />} label="Download" onClick={download} />}
    </div>
  )
}

function ActBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border border-hairline bg-surface text-ink-2 hover:text-clay hover:border-clay/30 transition-colors"
    >
      {icon}
      <span className="text-[12.5px] font-semibold">{label}</span>
    </button>
  )
}

