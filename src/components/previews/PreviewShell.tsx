'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Bookmark,
  Check,
  Download,
  Link2,
  Loader2,
  Search,
  Share2,
  Sparkles,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { isMediaAvailable, isTouchDevice } from '@/components/feed/utils'
import {
  canonicalShareUrl,
  prefetchShareFile,
  shareFileWithLink,
  sharePageLink,
} from '@/lib/share/web-share'
import { pingSharePulse } from '@/lib/activity/ping-share'
import { IosShortcutNudge } from '@/components/IosShortcutInstall'
import { AnimatedBackground, LandingAnimations } from '@/components/landing'
import { ThemeToggle } from '@/components/ThemeToggle'
import { MatterLogo, ConnectWithX } from '@/components/matter'
import { cn } from '@/lib/utils'

/**
 * Shared shell for the four preview landing pages (X / Instagram / TikTok /
 * YouTube). Owns the byte-identical chrome — animated background, theme toggle,
 * ambient glow, centered Matter header, two-column grid scaffold and footer —
 * plus the value card and secondary action helpers. Each platform page passes
 * its source-specific hero card and sidebar; the shell never assumes a content
 * shape, so the rendered DOM stays identical to the hand-rolled originals.
 */
export function PreviewShell({
  hero,
  sidebar,
  valueCard,
  /**
   * Spacing variant. The X tweet preview historically put the header/grid gap
   * on the header (`mb-8 md:mb-10`) and gave the grid no top margin; the other
   * three pages put it on the grid (`mt-8 md:mt-10`). Both render an identical
   * gap — this flag just preserves each page's exact original DOM.
   */
  headerSpacing = 'grid',
}: {
  hero: React.ReactNode
  sidebar: React.ReactNode
  valueCard?: React.ReactNode
  headerSpacing?: 'grid' | 'header'
}) {
  const card = valueCard ?? <ValueCard />
  return (
    <div className="min-h-screen flex flex-col bg-paper relative overflow-x-hidden">
      <LandingAnimations />
      <AnimatedBackground />
      <div className="fixed right-3 top-3 z-50 flex items-center gap-2">
        <a
          href="https://github.com/itsmemeworks/adhx"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
          title="View source on GitHub"
          className="hidden rounded-full border border-hairline bg-surface/70 p-2 text-ink-2 shadow-m-sm backdrop-blur transition-colors hover:text-ink sm:inline-flex"
        >
          <GithubGlyph size={18} />
        </a>
        <ThemeToggle className="border border-hairline bg-surface/70 shadow-m-sm backdrop-blur" />
      </div>

      {/* warm ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--m-accent) 16%, transparent), transparent 70%)',
        }}
      />

      <main className="relative z-10 px-4 sm:px-6 lg:px-12 pb-14 md:flex-1 pt-8 sm:pt-12">
        <div className="max-w-[1040px] mx-auto">
          <PreviewHeader spacing={headerSpacing} />

          <div
            className={cn(
              'grid md:grid-cols-[minmax(0,430px)_1fr] gap-8 lg:gap-12 items-start',
              headerSpacing === 'grid' && 'mt-8 md:mt-10',
            )}
          >
            {/* Card — left column */}
            <div className="animate-fade-in-up [animation-fill-mode:both] delay-100 w-full min-w-0">
              {hero}

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
              {card}
            </div>

            {/* Value card — mobile */}
            <div className="md:hidden">{card}</div>
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
function PreviewHeader({ spacing }: { spacing: 'grid' | 'header' }) {
  // Class order is preserved per-variant to keep snapshot DOM byte-identical
  // (the X tweet preview historically ordered `mb-*` before the animation).
  return (
    <div
      className={
        spacing === 'header'
          ? 'text-center mb-8 md:mb-10 animate-fade-in-up [animation-fill-mode:both]'
          : 'text-center animate-fade-in-up [animation-fill-mode:both]'
      }
    >
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
        Send it before you <b className="text-clay font-semibold">doomscroll</b> past it.
      </p>
    </div>
  )
}

/**
 * CTA cluster shared by the Instagram / TikTok / YouTube preview pages.
 *
 * Authenticated: primary "Save to collection". Unauthenticated: primary
 * Send/Download (the useful loop — no account needed), then Copy/Share,
 * then a quieter "Keep it forever" Connect-with-X card.
 */
export function PreviewCta({
  isAuthenticated,
  adding,
  connecting,
  onAdd,
  onConnect,
  canSave = true,
  shareTitle,
  downloadUrl,
  streamUrl,
  filename,
  showDownload = false,
  pulse,
}: {
  isAuthenticated: boolean
  adding: boolean
  connecting: boolean
  onAdd: () => void
  onConnect: () => void
  /** When false, the Save button is disabled (e.g. nothing previewable to save). */
  canSave?: boolean
  shareTitle: string
  downloadUrl?: string
  /** Inline stream URL — fetched to a Blob for the native send sheet. */
  streamUrl?: string
  filename?: string
  showDownload?: boolean
  pulse?: { platform: string; id: string }
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {isAuthenticated ? (
        <button
          onClick={onAdd}
          disabled={adding || !canSave}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl bg-clay-grad text-white font-bold text-base shadow-glow transition-all hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {adding ? (
            <Loader2 className="w-[18px] h-[18px] animate-spin" />
          ) : (
            <Bookmark className="w-[18px] h-[18px]" />
          )}
          {adding ? 'Saving…' : 'Save to collection'}
        </button>
      ) : (
        <UnauthPrimarySend
          shareTitle={shareTitle}
          downloadUrl={downloadUrl}
          streamUrl={streamUrl}
          filename={filename}
          showDownload={showDownload}
          pulse={pulse}
        />
      )}

      <SecondaryActions
        shareTitle={shareTitle}
        downloadUrl={downloadUrl}
        showDownload={showDownload && isAuthenticated}
        pulse={pulse}
      />

      <IosShortcutNudge />

      {/* Keep it forever — Connect with X is secondary to send/download. */}
      {!isAuthenticated && (
        <div className="rounded-2xl px-4 py-4 bg-clay/10 border border-clay/20">
          <div className="font-bold text-sm text-ink mb-0.5">Keep a pile, later</div>
          <p className="text-[13px] text-ink-2 leading-snug mb-3">
            Sending doesn&apos;t need an account. Sign in if you want a private collection.
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

/** Unauth primary: send the video file+link on touch, download on desktop, share the page URL when there's no MP4. */
export function UnauthPrimarySend({
  shareTitle,
  downloadUrl,
  streamUrl,
  filename,
  showDownload,
  pulse,
}: {
  shareTitle: string
  downloadUrl?: string
  streamUrl?: string
  filename?: string
  showDownload: boolean
  pulse?: { platform: string; id: string }
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'idle' | 'ok' | 'unavailable'>('idle')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(isTouchDevice())
  }, [])

  const fileUrl = streamUrl || downloadUrl
  const canSendFile = showDownload && !!fileUrl

  useEffect(() => {
    if (!fileUrl || !filename || !isTouchDevice()) return
    void prefetchShareFile(fileUrl, filename)
  }, [fileUrl, filename])

  const finish = (next: 'ok' | 'unavailable') => {
    setStatus(next)
    setTimeout(() => setStatus('idle'), 2000)
  }

  const send = async () => {
    setBusy(true)
    try {
      if (canSendFile && fileUrl) {
        if (isMobile) {
          const file = await prefetchShareFile(fileUrl, filename || 'video.mp4')
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await shareFileWithLink(file, { pageUrl: window.location.href })
          } else {
            const blobUrl = URL.createObjectURL(file)
            const link = document.createElement('a')
            link.href = blobUrl
            link.download = filename || 'video.mp4'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
          }
        } else {
          if (!(await isMediaAvailable(fileUrl))) {
            finish('unavailable')
            return
          }
          const link = document.createElement('a')
          link.href = downloadUrl || fileUrl
          link.download = ''
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        }
        if (pulse) pingSharePulse(pulse.platform, pulse.id)
        finish('ok')
        return
      }

      await sharePageLink({ title: shareTitle, href: window.location.href })
      if (pulse) pingSharePulse(pulse.platform, pulse.id)
      finish('ok')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (pulse) pingSharePulse(pulse.platform, pulse.id)
        finish('ok')
      } else if (canSendFile) {
        finish('unavailable')
      }
    } finally {
      setBusy(false)
    }
  }

  const label =
    status === 'unavailable'
      ? 'Blocked by source'
      : status === 'ok'
        ? canSendFile
          ? isMobile
            ? 'Sent'
            : 'Downloading'
          : 'Shared'
        : canSendFile
          ? isMobile
            ? 'Send this video'
            : 'Download video'
          : 'Share this preview'

  return (
    <button
      onClick={send}
      disabled={busy}
      className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl bg-clay-grad text-white font-bold text-base shadow-glow transition-all hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? (
        <Loader2 className="w-[18px] h-[18px] animate-spin" />
      ) : status === 'unavailable' ? (
        <AlertCircle className="w-[18px] h-[18px]" />
      ) : status === 'ok' ? (
        <Check className="w-[18px] h-[18px]" />
      ) : canSendFile && !isMobile ? (
        <Download className="w-[18px] h-[18px]" />
      ) : (
        <Share2 className="w-[18px] h-[18px]" />
      )}
      {busy ? 'Working…' : label}
    </button>
  )
}

/** Copy link / Share / (optional Download) secondary action row. */
function SecondaryActions({
  shareTitle,
  downloadUrl,
  showDownload,
  pulse,
}: {
  shareTitle: string
  downloadUrl?: string
  showDownload?: boolean
  pulse?: { platform: string; id: string }
}) {
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const [downloadState, setDownloadState] = useState<'idle' | 'checking' | 'unavailable'>('idle')

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        canonicalShareUrl(window.location.href) || window.location.href,
      )
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const share = async () => {
    try {
      await sharePageLink({ title: shareTitle, href: window.location.href })
      setShared(true)
      if (pulse) pingSharePulse(pulse.platform, pulse.id)
      setTimeout(() => setShared(false), 1500)
    } catch {
      /* cancelled */
    }
  }

  const download = async () => {
    if (!downloadUrl) return
    // Ask before saving: on an unresolvable video the proxy answers with a JSON
    // error, and `<a download>` writes that out as the .mp4 with no complaint.
    setDownloadState('checking')
    if (!(await isMediaAvailable(downloadUrl))) {
      setDownloadState('unavailable')
      setTimeout(() => setDownloadState('idle'), 4000)
      return
    }
    setDownloadState('idle')
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = ''
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    if (pulse) pingSharePulse(pulse.platform, pulse.id)
  }

  return (
    <div className="flex gap-2.5">
      <ActBtn
        icon={
          copied ? <Check className="w-[19px] h-[19px]" /> : <Link2 className="w-[19px] h-[19px]" />
        }
        label={copied ? 'Copied' : 'Copy link'}
        onClick={copyLink}
      />
      <ActBtn
        icon={
          shared ? (
            <Check className="w-[19px] h-[19px]" />
          ) : (
            <Share2 className="w-[19px] h-[19px]" />
          )
        }
        label={shared ? 'Shared' : 'Share'}
        onClick={share}
      />
      {showDownload && (
        <ActBtn
          icon={
            downloadState === 'checking' ? (
              <Loader2 className="w-[19px] h-[19px] animate-spin" />
            ) : downloadState === 'unavailable' ? (
              <AlertCircle className="w-[19px] h-[19px]" />
            ) : (
              <Download className="w-[19px] h-[19px]" />
            )
          }
          label={
            downloadState === 'checking'
              ? 'Checking…'
              : downloadState === 'unavailable'
                ? 'Blocked by source'
                : 'Download'
          }
          onClick={download}
        />
      )}
    </div>
  )
}

function ActBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
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

/**
 * Shared add-to-collection handler for the Instagram / TikTok / YouTube preview
 * pages: POSTs the source URL to `/api/bookmarks/add` and redirects to the feed
 * with the platform's `added` query params. Returns the bound handler plus the
 * `adding` flag, mirroring the per-page logic the four pages previously copied.
 */
export function useAddToCollection({
  url,
  platform,
  id,
}: {
  url: string
  platform: 'instagram' | 'tiktok' | 'youtube'
  id: string
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)

  const addToCollection = async () => {
    setAdding(true)
    try {
      const response = await fetch('/api/bookmarks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          source: 'url_prefix',
        }),
      })
      const data = await response.json()
      if (data.success) {
        router.push(`/?added=success&platform=${platform}&id=${id}`)
      } else if (data.isDuplicate) {
        router.push(`/?added=duplicate&platform=${platform}&id=${id}`)
      } else {
        router.push(`/?added=error&error=${encodeURIComponent(data.error || 'Failed to save')}`)
      }
    } catch (error) {
      router.push(
        `/?added=error&error=${encodeURIComponent(error instanceof Error ? error.message : 'Failed to save')}`,
      )
    }
  }

  return { adding, addToCollection }
}

/** Connect-with-X handler shared by all four preview pages. */
export function useConnect() {
  const [connecting, setConnecting] = useState(false)
  const connect = () => {
    setConnecting(true)
    const returnUrl = encodeURIComponent(window.location.pathname)
    window.location.href = `/api/auth/twitter?returnUrl=${returnUrl}`
  }
  return { connecting, connect }
}

/** Shared 3-row value card (bullets). Each page may override the copy. */
export function ValueCard({
  rows = DEFAULT_VALUE_ROWS,
}: {
  rows?: Array<[React.ReactNode, string, string]>
}) {
  return (
    <div className="rounded-card border border-hairline bg-surface overflow-hidden">
      {rows.map(([icon, title, body], i) => (
        <div
          key={title}
          className={cn('flex items-center gap-3 px-4 py-3.5', i > 0 && 'border-t border-hairline')}
        >
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

/** Inline GitHub mark — lucide's `Github` icon is deprecated, so we draw the glyph directly. */
function GithubGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 98 96" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
      />
    </svg>
  )
}

const DEFAULT_VALUE_ROWS: Array<[React.ReactNode, string, string]> = [
  [
    <Sparkles key="s" className="w-[17px] h-[17px]" />,
    'One place for everything',
    'Tweets, TikToks, Reels, Shorts & articles in one searchable home.',
  ],
  [
    <Zap key="z" className="w-[17px] h-[17px]" />,
    'Media at your fingertips',
    'Full-screen viewer for photos and video — save any post to your collection.',
  ],
  [
    <Search key="f" className="w-[17px] h-[17px]" />,
    'Actually find it later',
    'Full-text search across everything you save.',
  ],
]
