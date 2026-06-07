'use client'

import { useState, useEffect } from 'react'
import {
  Bookmark,
  Search,
  Zap,
  Volume2,
  ArrowRight,
  Plus,
  Smartphone,
  Monitor,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react'
import { extractYouTubeId } from '@/lib/media/youtube'
import { getPlatformType, type PlatformType } from '@/lib/platform'
import { MatterLogo, PlatformGlyph, LiveDot, ConnectWithX } from '@/components/matter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { DiscoverCard } from '@/components/discover/DiscoverCard'
import type { ActivityItem } from '@/components/discover/DiscoverFeed'

/* ---------- Live activity (the real, anonymous community pulse) ---------- */

const POLL_MS = 12_000

interface LiveState {
  items: ActivityItem[]
  savedToday: number
  loaded: boolean
}

/** Poll /api/activity for the real anonymous pulse shown on the landing page. */
function useLiveActivity(): LiveState {
  const [state, setState] = useState<LiveState>({ items: [], savedToday: 0, loaded: false })
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/activity', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!alive || !Array.isArray(data.items)) return
        setState({ items: data.items, savedToday: Number(data.savedToday) || 0, loaded: true })
      } catch {
        if (alive) setState((s) => ({ ...s, loaded: true }))
      }
    }
    load()
    const t = window.setInterval(load, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [])
  return state
}

export function LandingPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [tweetUrl, setTweetUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const live = useLiveActivity()

  const handleLogin = () => {
    setIsLoading(true)
    window.location.href = '/api/auth/twitter'
  }

  // Patterns for all supported sources
  const tweetUrlPattern =
    /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/(\w{1,15})\/status\/(\d+)/i
  const reelUrlPattern = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/i
  const tiktokUrlPattern =
    /(?:https?:\/\/)?(?:www\.|vm\.|m\.)?tiktok\.com\/@([A-Za-z0-9._]{1,30})\/video\/(\d{6,25})/i

  const parseAndNavigate = (url: string): boolean => {
    const trimmed = url.trim()

    const tweetMatch = trimmed.match(tweetUrlPattern)
    if (tweetMatch) {
      const [, username, tweetId] = tweetMatch
      window.location.href = `/${username}/status/${tweetId}`
      return true
    }

    const reelMatch = trimmed.match(reelUrlPattern)
    if (reelMatch) {
      window.location.href = `/reels/${reelMatch[1]}`
      return true
    }

    const tiktokMatch = trimmed.match(tiktokUrlPattern)
    if (tiktokMatch) {
      window.location.href = `/@${tiktokMatch[1]}/video/${tiktokMatch[2]}`
      return true
    }

    if (/(?:youtube\.com|youtu\.be)/i.test(trimmed)) {
      const ytId = extractYouTubeId(trimmed)
      if (ytId) {
        window.location.href = `/shorts/${ytId}`
        return true
      }
    }

    // TikTok short link (vm./vt.tiktok.com/{code} or /t/{code}) — no video id
    // in the URL, so let the server follow the redirect and bounce us back.
    if (/(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]+|tiktok\.com\/t\/[A-Za-z0-9]+/i.test(trimmed)) {
      window.location.href = `/api/tiktok/resolve?go=1&url=${encodeURIComponent(trimmed)}`
      return true
    }

    return false
  }

  const handleTweetUrlChange = (value: string) => {
    setTweetUrl(value)
    setUrlError('')

    // Auto-navigate as soon as a known host appears in the input
    if (
      value.includes('x.com/') ||
      value.includes('twitter.com/') ||
      value.includes('instagram.com/') ||
      value.includes('tiktok.com/') ||
      value.includes('youtube.com/') ||
      value.includes('youtu.be/')
    ) {
      parseAndNavigate(value)
    }
  }

  const handleTweetUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setUrlError('')

    if (!parseAndNavigate(tweetUrl)) {
      setUrlError(
        "That's not an X, Instagram, TikTok, or YouTube link. But we appreciate the mystery.",
      )
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink relative overflow-hidden">
      {/* Soft terracotta radial glow, top-left corner */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-36 left-[12%] w-[420px] h-[420px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--m-accent) 18%, transparent), transparent 70%)',
        }}
      />

      <div className="relative">
        {/* ───────── Nav ───────── */}
        <nav className="flex items-center px-5 sm:px-11 py-4 border-b border-hairline">
          <MatterLogo size={20} />
          <div className="ml-auto flex items-center gap-4 sm:gap-6">
            <a
              href="#how-it-works"
              className="hidden sm:inline text-sm font-medium text-ink-2 hover:text-ink transition-colors"
            >
              How it works
            </a>
            <a
              href="/discover"
              className="hidden sm:inline text-sm font-medium text-ink-2 hover:text-ink transition-colors"
            >
              Discover
            </a>
            <ThemeToggle className="-mr-1 sm:mr-0" />
            <button
              onClick={handleLogin}
              className="hidden sm:inline text-sm font-semibold text-ink-2 hover:text-ink transition-colors"
            >
              Log in
            </button>
            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-ink text-surface font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <ConnectWithX size={14} />
            </button>
          </div>
        </nav>

        {/* ───────── Hero ───────── */}
        <section
          aria-labelledby="hero-title"
          className="grid grid-cols-1 min-[860px]:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] gap-10 lg:gap-14 items-center px-6 sm:px-10 lg:px-16 pt-10 sm:pt-14 pb-10 max-w-[1240px] mx-auto"
        >
          {/* LEFT: copy + CTA */}
          <div>
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold bg-surface border border-hairline text-ink-2 mb-5">
              <LiveDot />
              {live.savedToday > 0
                ? `${live.savedToday.toLocaleString()} ${live.savedToday === 1 ? 'post' : 'posts'} saved today`
                : 'Real-time community pulse'}
            </span>

            <div className="font-indie-flower leading-[.9] text-ink mb-4 text-[60px] min-[860px]:text-[84px]">
              ADHX
            </div>

            <h1
              id="hero-title"
              className="font-serif font-semibold tracking-[-.015em] leading-[1.12] text-ink mb-3.5 text-[28px] min-[860px]:text-[38px]"
            >
              Save now. Read never. <span className="text-clay">Find always.</span>
            </h1>

            <p className="text-[15px] min-[860px]:text-[17px] text-ink-2 leading-[1.55] mb-7 max-w-[440px]">
              Sync your X bookmarks, discover what&apos;s trending, and actually get through your
              backlog — every tweet, thread, Reel, TikTok &amp; Short in one searchable home.
            </p>

            <div className="flex items-center gap-3.5">
              <button
                onClick={handleLogin}
                disabled={isLoading}
                className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-card bg-ink text-surface font-semibold text-base transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ boxShadow: '0 8px 24px rgba(44,38,32,.25)' }}
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-surface border-t-transparent rounded-full animate-spin" />
                    Connecting…
                  </>
                ) : (
                  <>
                    <ConnectWithX size={17} />
                    <ArrowRight className="w-[17px] h-[17px]" />
                  </>
                )}
              </button>
              <span className="text-[13.5px] text-ink-3">Free forever</span>
            </div>
          </div>

          {/* RIGHT: how-it-works explainer (the live feed already appears below) */}
          <HowItWorks />
        </section>

        {/* ───────── Live discovery section ───────── */}
        <section
          id="discover"
          aria-labelledby="discover-title"
          className="px-6 sm:px-10 lg:px-16 pt-6 pb-2 max-w-[1240px] mx-auto"
        >
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <LiveDot />
                <span className="text-[12.5px] font-bold uppercase tracking-[.08em] text-clay">
                  Live discovery
                </span>
              </div>
              <h2
                id="discover-title"
                className="font-serif font-semibold tracking-[-.01em] text-ink text-[24px] sm:text-[28px] m-0"
              >
                Find your next rabbit hole
              </h2>
              <p className="text-[14.5px] text-ink-2 mt-1.5">
                Anonymous, real-time. Every save anyone makes streams here — tap to add it to your
                own collection.
              </p>
            </div>
            <a
              href="/discover"
              className="sm:ml-auto text-sm font-semibold text-clay whitespace-nowrap hover:opacity-80 transition-opacity"
            >
              Open Discover →
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[18px]">
            {!live.loaded ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-64 animate-pulse rounded-card border border-hairline bg-inset"
                />
              ))
            ) : live.items.length === 0 ? (
              <p className="col-span-full py-8 text-center text-[14.5px] text-ink-2">
                Quiet right now — be the first to save something.
              </p>
            ) : (
              live.items.slice(0, 4).map((item) => <DiscoverCard key={item.url} item={item} />)
            )}
          </div>
        </section>

        {/* ───────── Try it without an account ───────── */}
        <section
          id="try-it"
          aria-labelledby="try-it-title"
          className="px-6 sm:px-10 lg:px-16 py-11 max-w-[1240px] mx-auto"
        >
          <div className="bg-surface border border-hairline rounded-[18px] px-6 sm:px-9 py-8 text-center">
            <h3 id="try-it-title" className="font-serif font-semibold text-ink text-[22px] mb-1.5">
              Try it without an account
            </h3>
            <p className="text-[14.5px] text-ink-2 mb-5">
              Paste any X, Instagram, TikTok, or YouTube link to preview it instantly.
            </p>
            <form
              onSubmit={handleTweetUrlSubmit}
              className="flex flex-col sm:flex-row gap-3 max-w-[620px] mx-auto"
            >
              <input
                type="text"
                value={tweetUrl}
                onChange={(e) => handleTweetUrlChange(e.target.value)}
                placeholder="Paste a link here…"
                className="flex-1 bg-inset border border-hairline rounded-card px-4 sm:px-[18px] py-3 font-mono text-base sm:text-[13.5px] text-ink placeholder:text-ink-3 text-left focus:outline-none focus:ring-2 focus:ring-clay/40 focus:border-transparent"
              />
              <button
                type="submit"
                className="px-6 py-3 rounded-card bg-clay-grad text-white shadow-glow font-semibold text-[15px] whitespace-nowrap transition-transform hover:scale-[1.02]"
              >
                Preview
              </button>
            </form>
            {urlError && <p className="text-[#EF4444] text-sm mt-3">{urlError}</p>}
            <p className="text-[12.5px] text-ink-3 mt-3">
              Works with X, Instagram, TikTok &amp; YouTube.
            </p>
          </div>
        </section>

        {/* ───────── Save method promo (iOS Shortcut / bookmarklet) ───────── */}
        <ShortcutPromo />

        {/* ───────── Value props ───────── */}
        <section
          id="how-it-works"
          aria-labelledby="features-title"
          className="px-6 sm:px-10 lg:px-16 pb-12 max-w-[1240px] mx-auto"
        >
          <h2 id="features-title" className="sr-only">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[18px]">
            <ValueProp
              icon={<Bookmark className="w-5 h-5" />}
              title="Hoard freely"
              body="Sync your X bookmarks or paste any link. Hoard responsibly — or don't."
            />
            <ValueProp
              icon={<Zap className="w-5 h-5" />}
              title="Triage, don't doomscroll"
              body="Swipe through your backlog one card at a time. Keep, read, or clear."
            />
            <ValueProp
              icon={<Volume2 className="w-5 h-5" />}
              title="Listen, don't read"
              body="Text-to-speech reads any article or thread aloud while you do other things."
            />
            <ValueProp
              icon={<Search className="w-5 h-5" />}
              title="Actually find it"
              body="Full-text search across everything you've saved. That TikTok from 3 months ago? Found."
            />
          </div>
        </section>

        {/* ───────── Footer ───────── */}
        <footer className="text-center py-8 border-t border-hairline">
          <span className="font-indie-flower text-[22px] text-ink-3">
            Save now. Read never. Find always.
          </span>
        </footer>
      </div>
    </div>
  )
}

/* ───────── How ADHX works (hero right column) ───────── */

function HowItWorks() {
  const steps: { icon: React.ReactNode; h: string; b: string }[] = [
    {
      icon: <PlatformGlyph platform="twitter" size={17} />,
      h: 'Connect X',
      b: 'Your saved bookmarks sync in automatically — nothing to copy-paste.',
    },
    {
      icon: <Plus className="w-[17px] h-[17px]" />,
      h: 'Save from anywhere',
      b: 'Drop a TikTok, Reel, YouTube Short or tweet and it lands in your feed.',
    },
    {
      icon: <Zap className="w-[17px] h-[17px]" />,
      h: 'Triage daily',
      b: 'Swipe through your backlog one card at a time — keep, read, or clear.',
    },
    {
      icon: <Volume2 className="w-[17px] h-[17px]" />,
      h: 'Read or listen later',
      b: 'Full-text search across everything, plus text-to-speech for any post.',
    },
  ]
  return (
    <div className="min-w-0 bg-surface border border-hairline rounded-card shadow-m-lg p-6">
      <h2 className="font-serif font-semibold text-[19px] text-ink mb-[18px]">How ADHX works</h2>
      <div className="flex flex-col gap-[17px]">
        {steps.map((s, i) => (
          <div key={s.h} className="flex items-start gap-3.5">
            <div className="w-[34px] h-[34px] flex-none rounded-[10px] bg-clay/12 text-clay flex items-center justify-center">
              {s.icon}
            </div>
            <div>
              <div className="font-bold text-[14.5px] text-ink">
                {i + 1}. {s.h}
              </div>
              <div className="text-[13px] text-ink-2 leading-[1.45] mt-0.5">{s.b}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ───────── Value prop card ───────── */
function ValueProp({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-surface border border-hairline rounded-card p-5">
      <div className="w-10 h-10 rounded-[11px] bg-clay/12 text-clay flex items-center justify-center mb-3.5">
        {icon}
      </div>
      <h3 className="font-serif font-semibold text-ink text-[15.5px] mb-1.5">{title}</h3>
      <p className="text-[13.5px] text-ink-2 leading-[1.5]">{body}</p>
    </div>
  )
}

/* ───────── Save method promo (iOS Shortcut / bookmarklet) ───────── */

const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/0d187480099b4d34a745ec8750a4587b'
const BOOKMARKLET_CODE = `javascript:void(location.href=location.href.replace(/(?:x|twitter|instagram|tiktok|youtube)\\.com/,'adhx.com'))`

function ShortcutPromo() {
  const [platform, setPlatform] = useState<PlatformType>('desktop')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setPlatform(getPlatformType())
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(BOOKMARKLET_CODE)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="px-6 sm:px-10 lg:px-16 pb-4 max-w-[1240px] mx-auto">
      <div className="bg-surface border border-hairline rounded-card p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="w-14 h-14 rounded-[14px] bg-clay/12 text-clay flex items-center justify-center flex-shrink-0">
            {platform === 'ios' ? (
              <Smartphone className="w-7 h-7" />
            ) : (
              <Monitor className="w-7 h-7" />
            )}
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h2 className="font-serif font-semibold text-ink text-[18px] mb-2">
              {platform === 'ios'
                ? 'Save straight from the share sheet'
                : 'Save posts with one click'}
            </h2>

            {platform === 'ios' ? (
              <>
                <p className="text-[14px] text-ink-2 leading-[1.5] mb-4">
                  Hit share on any post and it opens in ADHX — full content and media, ready to save
                  to your collection or send to a friend.
                </p>
                <a
                  href={SHORTCUT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-clay-grad text-white shadow-glow font-semibold text-sm transition-transform hover:scale-[1.02]"
                >
                  <ExternalLink className="w-4 h-4" />
                  Get the Shortcut
                </a>
              </>
            ) : (
              <>
                <p className="text-[14px] text-ink-2 leading-[1.5] mb-4">
                  Drag this bookmarklet to your bookmarks bar. Click it on any X, Instagram, TikTok,
                  or YouTube page to instantly open it in ADHX.
                </p>
                <div className="bg-inset rounded-card border border-hairline p-3 mb-4">
                  <code className="text-xs font-mono text-ink-2 break-all select-all">
                    {BOOKMARKLET_CODE}
                  </code>
                </div>
                <div className="flex flex-wrap items-center gap-3 justify-center sm:justify-start">
                  <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-clay-grad text-white shadow-glow font-semibold text-sm transition-transform hover:scale-[1.02]"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy Bookmarklet'}
                  </button>
                </div>
                {platform === 'android' && (
                  <p className="text-[13px] text-ink-3 mt-3">
                    You can also install ADHX as a PWA from your browser menu for share sheet
                    access.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
