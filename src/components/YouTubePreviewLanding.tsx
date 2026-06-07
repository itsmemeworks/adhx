'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bookmark, Check, ExternalLink, Link2, Loader2, Play, Search, Share2, Sparkles, Zap } from 'lucide-react'
import Link from 'next/link'
import { AnimatedBackground, LandingAnimations } from '@/components/landing'
import { ThemeToggle } from '@/components/ThemeToggle'
import { MatterLogo, PlatformGlyph, ConnectWithX } from '@/components/matter'
import { cn } from '@/lib/utils'
import { youtubeEmbedUrl, youtubeShortUrl, youtubeThumbnail } from '@/lib/media/youtube'
import { PreviewAnotherLink } from '@/components/PreviewAnotherLink'

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
  const [connecting, setConnecting] = useState(false)
  const [adding, setAdding] = useState(false)

  const shortUrl = youtubeShortUrl(videoId)
  const channel = author || (authorName ? authorName : '@youtube')

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

  const sidebar = (
    <>
      <SidebarCta
        isAuthenticated={isAuthenticated}
        hasVideo={hasVideo}
        adding={adding}
        connecting={connecting}
        onAdd={handleAddToCollection}
        onConnect={handleConnect}
      />
      <PreviewAnotherLink className="mt-4" />
    </>
  )

  return (
    <div className="min-h-screen flex flex-col bg-paper relative overflow-x-hidden">
      <LandingAnimations />
      <AnimatedBackground />
      <ThemeToggle className="fixed right-3 top-3 z-50 border border-hairline bg-surface/70 shadow-m-sm backdrop-blur" />

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
                data-content="youtube-short"
                className="bg-surface rounded-card border border-hairline shadow-m-lg flex flex-col overflow-hidden min-h-[300px] w-full min-w-0"
              >
                <header className="px-4 pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <a href={shortUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 flex-1 min-w-0 group">
                      <div className="w-[42px] h-[42px] rounded-full flex items-center justify-center flex-shrink-0 bg-[#FF0000] text-white">
                        <PlatformGlyph platform="youtube" size={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[15px] text-ink truncate group-hover:text-clay transition-colors">
                          {authorName || channel}
                        </p>
                        <p className="font-mono text-[12.5px] text-ink-3 truncate">{channel}</p>
                      </div>
                    </a>
                    <a
                      href={shortUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[12.5px] font-semibold bg-inset text-ink-2 hover:text-clay transition-colors"
                      title="Watch on YouTube"
                    >
                      <PlatformGlyph platform="youtube" size={13} />
                    </a>
                  </div>
                </header>

                {title && (
                  <div className="px-4 pb-3">
                    <p
                      className={cn(
                        'text-[14.5px] text-ink-2 font-medium break-words leading-relaxed [overflow-wrap:anywhere]',
                        hasVideo ? 'line-clamp-3' : '',
                      )}
                    >
                      {title}
                    </p>
                  </div>
                )}

                {hasVideo && (
                  <div className="px-4 pb-3">
                    <div className="relative block rounded-2xl overflow-hidden bg-black group w-full mx-auto" style={{ aspectRatio: '9 / 16', maxWidth: 360 }}>
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
                            <div className="w-[60px] h-[60px] bg-[#FF0000] rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                              <Play className="w-6 h-6 text-white ml-1" fill="currentColor" />
                            </div>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {!hasVideo && (
                  <div className="px-4 pb-4 text-center text-ink-3 text-sm">
                    <p className="mb-1">
                      YouTube ID: <code className="font-mono">{videoId}</code>
                    </p>
                    <p className="text-xs">
                      This Short couldn&apos;t be previewed — it may be private, removed, or age-restricted.
                    </p>
                  </div>
                )}

                <footer className="px-4 py-3 flex items-center justify-between gap-3 min-w-0">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-ink-3">
                    <PlatformGlyph platform="youtube" size={14} />
                    YouTube Short
                  </span>
                  <a
                    href={shortUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[13px] font-semibold text-clay hover:opacity-80 transition-opacity"
                    title="Watch on YouTube"
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
            <div role="complementary" aria-label="ADHX features" className="hidden md:flex flex-col gap-3.5 animate-fade-in-up [animation-fill-mode:both] delay-200">
              {sidebar}
              <ValueCard />
            </div>

            {/* Value card — mobile */}
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

/** Shared 3-row value card (bullets). YouTube has no download. */
function ValueCard() {
  const rows: Array<[React.ReactNode, string, string]> = [
    [<Sparkles key="s" className="w-[17px] h-[17px]" />, 'One place for everything', 'Shorts, TikToks, Reels, tweets & articles in one searchable home.'],
    [<Zap key="z" className="w-[17px] h-[17px]" />, 'Watch without the rabbit hole', 'Play the Short right here — no recommendations, no doomscroll.'],
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
  return (
    <div className="flex flex-col gap-3.5">
      {/* Authenticated users get the primary "Save" CTA up top. Unauthenticated
          users lead with the actions below — the single Connect CTA lives in the
          benefit-backed "Keep it forever" card, so we don't double up on it. */}
      {isAuthenticated && (
        <button
          onClick={onAdd}
          disabled={adding || !hasVideo}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl bg-clay-grad text-white font-bold text-base shadow-glow transition-all hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {adding ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Bookmark className="w-[18px] h-[18px]" />}
          {adding ? 'Saving…' : 'Save to collection'}
        </button>
      )}

      {/* Secondary action row — Download omitted for YouTube */}
      <SecondaryActions />

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

/** Copy link / Share secondary action row (no Download for YouTube). */
function SecondaryActions() {
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
        await navigator.share({ url, title: 'YouTube Short — ADHX Preview' })
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

  return (
    <div className="flex gap-2.5">
      <ActBtn icon={copied ? <Check className="w-[19px] h-[19px]" /> : <Link2 className="w-[19px] h-[19px]" />} label={copied ? 'Copied' : 'Copy link'} onClick={copyLink} />
      <ActBtn icon={shared ? <Check className="w-[19px] h-[19px]" /> : <Share2 className="w-[19px] h-[19px]" />} label={shared ? 'Shared' : 'Share'} onClick={share} />
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

