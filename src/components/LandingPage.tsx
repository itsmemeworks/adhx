'use client'

import { useState, useEffect } from 'react'
import {
  Bookmark,
  Search,
  Zap,
  ArrowRight,
  Smartphone,
  Monitor,
  Copy,
  Check,
  Share,
  Play,
  Send,
  Link2,
} from 'lucide-react'
import { parseShareUrl, isSafeInternalPath } from '@/lib/utils/parse-share-url'
import { getPlatformType, type PlatformType } from '@/lib/platform'
import { LiveDot, ConnectWithX } from '@/components/matter'
import { PublicNav } from '@/components/PublicNav'
import { DiscoverCard } from '@/components/discover/DiscoverCard'
import type { ActivityItem } from '@/components/discover/types'
import { IosShortcutHow, IosShortcutInstallButton } from '@/components/IosShortcutInstall'
import { BOOKMARKLET_CODE } from '@/lib/share/ios'

/* ---------- Live activity (the real, anonymous community pulse) ---------- */

const POLL_MS = 12_000

interface LiveState {
  items: ActivityItem[]
  recentActivity: number
  loaded: boolean
}

/** Poll /api/activity for the real anonymous pulse shown on the landing page. */
function useLiveActivity(): LiveState {
  const [state, setState] = useState<LiveState>({ items: [], recentActivity: 0, loaded: false })
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/activity', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!alive || !Array.isArray(data.items)) return
        setState({
          items: data.items,
          recentActivity: Number(data.recentActivity) || 0,
          loaded: true,
        })
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

  // URL detection + the on-ADHX preview path are owned by the shared
  // detectPlatformPost/parseShareUrl helpers (src/lib/platform/url.ts,
  // src/lib/utils/parse-share-url.ts) — same source of truth as
  // PreviewAnotherLink and the PWA share target, so X/Instagram/TikTok/
  // YouTube (incl. TikTok short links) all resolve identically here.
  const parseAndNavigate = (url: string): boolean => {
    const trimmed = url.trim()
    const result = parseShareUrl(trimmed)
    if (result && isSafeInternalPath(result.path)) {
      window.location.href = result.path
      return true
    }
    return false
  }

  const handleTweetUrlChange = (value: string) => {
    setTweetUrl(value)
    setUrlError('')

    // Auto-navigate as soon as the pasted text resolves to a known post/video.
    if (parseShareUrl(value)) {
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
        <PublicNav onConnect={handleLogin} connecting={isLoading} />

        {/* ───────── Hero ───────── */}
        <section
          aria-labelledby="hero-title"
          className="grid grid-cols-1 min-[860px]:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)] gap-10 lg:gap-14 items-center px-6 sm:px-10 lg:px-16 pt-10 sm:pt-14 pb-10 max-w-[1240px] mx-auto"
        >
          {/* LEFT: copy + CTA */}
          <div>
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold bg-surface border border-hairline text-ink-2 mb-5">
              <LiveDot />
              {live.recentActivity > 0
                ? `${live.recentActivity.toLocaleString()} watched & sent today`
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
              Watch a Reel, TikTok, Short or tweet and send the file — friends don&apos;t need the
              app. Login is for keeping a collection, not for the useful loop.
            </p>

            <div className="flex flex-wrap items-center gap-3.5">
              <a
                href="#try-it"
                className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-card bg-clay-grad text-white font-semibold text-base shadow-glow transition-transform hover:scale-[1.02]"
              >
                Preview a link
                <ArrowRight className="w-[17px] h-[17px]" />
              </a>
              <HeroSecondary onConnect={handleLogin} connecting={isLoading} />
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
                Anonymous, real-time. Every send and save streams here — tap to watch, then send it
                on.
              </p>
            </div>
            <a
              href="/trending"
              className="sm:ml-auto text-sm font-semibold text-clay whitespace-nowrap hover:opacity-80 transition-opacity"
            >
              Open Trending →
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
              icon={<Send className="w-5 h-5" />}
              title="Send the file"
              body="Watch, then send the MP4. Friends don't need Instagram, TikTok, or an ADHX account."
            />
            <ValueProp
              icon={<Bookmark className="w-5 h-5" />}
              title="Hoard freely"
              body="Sync your X bookmarks or paste any link. Hoard responsibly — or don't."
            />
            <ValueProp
              icon={<Zap className="w-5 h-5" />}
              title="Triage, don't doomscroll"
              body="Swipe through your collection one card at a time. Keep, clear, or admit you'll never watch it."
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

/* ───────── Hero secondary: Share Sheet on iOS, Connect with X otherwise ───────── */

function HeroSecondary({ onConnect, connecting }: { onConnect: () => void; connecting: boolean }) {
  const [platform, setPlatform] = useState<PlatformType>('desktop')
  useEffect(() => {
    setPlatform(getPlatformType())
  }, [])

  if (platform === 'ios') {
    return (
      <IosShortcutInstallButton
        variant="ink"
        className="rounded-card px-5 py-3.5 !min-h-[52px] text-sm"
      />
    )
  }

  return (
    <button
      onClick={onConnect}
      disabled={connecting}
      className="inline-flex items-center gap-2.5 px-5 py-3.5 rounded-card bg-ink text-surface font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {connecting ? (
        <>
          <span className="w-4 h-4 border-2 border-surface border-t-transparent rounded-full animate-spin" />
          Connecting…
        </>
      ) : (
        <ConnectWithX size={15} />
      )}
    </button>
  )
}

/* ───────── How ADHX works (hero right column) ───────── */

function HowItWorks() {
  const [platform, setPlatform] = useState<PlatformType>('desktop')
  useEffect(() => {
    setPlatform(getPlatformType())
  }, [])

  const steps: { icon: React.ReactNode; h: string; b: string }[] = [
    platform === 'ios'
      ? {
          icon: <Share className="w-[17px] h-[17px]" />,
          h: 'Share → ADHX',
          b: "Add the shortcut once. Next time you're in X, tap Share → ADHX. No rewriting URLs like an animal.",
        }
      : {
          icon: <Link2 className="w-[17px] h-[17px]" />,
          h: 'Swap the host',
          b: "x.com → adhx.com. Same trick for Reels, TikToks, Shorts. That's the whole magic trick.",
        },
    {
      icon: <Play className="w-[17px] h-[17px]" />,
      h: 'Watch it here',
      b: 'Plays inline. No app, no login, no "open in Instagram" hostage situation.',
    },
    {
      icon: <Send className="w-[17px] h-[17px]" />,
      h: 'Send the file',
      b: "The MP4 goes to WhatsApp (or wherever). Friends don't need the original app. Or this one.",
    },
    {
      icon: <Bookmark className="w-[17px] h-[17px]" />,
      h: 'Keep a collection, later',
      b: 'Sign in if you want a private collection of things you will never rewatch. Optional. Honored.',
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
              {platform === 'ios' ? 'Send any post from iPhone' : 'Save posts with one click'}
            </h2>

            {platform === 'ios' ? (
              <>
                <p className="text-[14px] text-ink-2 leading-[1.5] mb-4">
                  Add ADHX to the iPhone share sheet once. Next time you&apos;re in X, tap Share →
                  ADHX — the preview opens so you can watch and send the file. No login, no
                  rewriting the URL.
                </p>
                <IosShortcutInstallButton />
                <IosShortcutHow />
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
