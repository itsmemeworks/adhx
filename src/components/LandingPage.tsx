'use client'

import { useState, useEffect } from 'react'
import { Bookmark, Search, Zap, Volume2, ArrowRight, Play, Plus, Smartphone, Monitor, ExternalLink, Copy, Check } from 'lucide-react'
import { extractYouTubeId } from '@/lib/media/youtube'
import { getPlatformType, type PlatformType } from '@/lib/platform'
import { MatterLogo, PlatformGlyph, LiveDot, TypeBadge, type PlatformId, type ContentType } from '@/components/matter'
import { cn } from '@/lib/utils'

/* ---------- Placeholder live-discovery data (real feed wiring lives elsewhere) ---------- */

const UNSPLASH: Record<string, string> = {
  beach: 'photo-1507525428034-b723cf961d3e',
  city: 'photo-1449824913935-59a10b8d2000',
  bookshelf: 'photo-1521119989659-a83eee488004',
  ramen: 'photo-1569718212165-3a8278d5f624',
  podcast: 'photo-1598550476439-6847785fcea6',
  coffee: 'photo-1495474472287-4d71bcdd2085',
}
const img = (key: string, w: number, h: number) =>
  `https://images.unsplash.com/${UNSPLASH[key] || key}?auto=format&fit=crop&w=${w}&h=${h}&q=80`

interface LiveItem {
  type: ContentType
  plat: PlatformId
  t: string
  saves: number
  media?: string
  title?: string
  body?: string
  fresh?: boolean
}

const LIVE: LiveItem[] = [
  { type: 'video', media: 'beach', t: 'just now', plat: 'tiktok', saves: 142, fresh: true },
  { type: 'article', title: 'The 100-day ChatGPT ranking playbook', media: 'city', t: '2s ago', plat: 'twitter', saves: 88 },
  { type: 'video', media: 'bookshelf', t: '6s ago', plat: 'youtube', saves: 118 },
  { type: 'photo', media: 'ramen', t: '9s ago', plat: 'instagram', saves: 301 },
  { type: 'text', body: '7 frameworks consultants charge $500/hr for — now free.', t: '24s ago', plat: 'twitter', saves: 54 },
  { type: 'video', media: 'podcast', t: '1m ago', plat: 'twitter', saves: 212 },
]

const TYPE_LABEL: Record<ContentType, string> = {
  video: 'Video',
  photo: 'Photo',
  text: 'Text',
  article: 'Article',
  quote: 'Quote',
}

export function LandingPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [tweetUrl, setTweetUrl] = useState('')
  const [urlError, setUrlError] = useState('')

  const handleLogin = () => {
    setIsLoading(true)
    window.location.href = '/api/auth/twitter'
  }

  // Patterns for all supported sources
  const tweetUrlPattern = /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/(\w{1,15})\/status\/(\d+)/i
  const reelUrlPattern = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/i
  const tiktokUrlPattern = /(?:https?:\/\/)?(?:www\.|vm\.|m\.)?tiktok\.com\/@([A-Za-z0-9._]{1,30})\/video\/(\d{6,25})/i

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
      setUrlError("That's not an X, Instagram, TikTok, or YouTube link. But we appreciate the mystery.")
    }
  }

  return (
    <div className="min-h-screen bg-paper text-ink relative overflow-hidden">
      {/* Soft terracotta radial glow, top-left corner */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-36 left-[12%] w-[420px] h-[420px] rounded-full"
        style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--m-accent) 18%, transparent), transparent 70%)' }}
      />

      <div className="relative">
        {/* ───────── Nav ───────── */}
        <nav className="flex items-center px-5 sm:px-11 py-4 border-b border-hairline">
          <MatterLogo size={20} />
          <div className="ml-auto flex items-center gap-4 sm:gap-6">
            <a href="#how-it-works" className="hidden sm:inline text-sm font-medium text-ink-2 hover:text-ink transition-colors">How it works</a>
            <a href="#discover" className="hidden sm:inline text-sm font-medium text-ink-2 hover:text-ink transition-colors">Discover</a>
            <button onClick={handleLogin} className="hidden sm:inline text-sm font-semibold text-ink-2 hover:text-ink transition-colors">Log in</button>
            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-ink text-surface font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <PlatformGlyph platform="twitter" size={14} />
              Connect with X
            </button>
          </div>
        </nav>

        {/* ───────── Hero ───────── */}
        <section
          aria-labelledby="hero-title"
          className="grid grid-cols-1 min-[860px]:grid-cols-[1.05fr_.95fr] gap-10 lg:gap-14 items-center px-6 sm:px-10 lg:px-16 pt-10 sm:pt-14 pb-10 max-w-[1240px] mx-auto"
        >
          {/* LEFT: copy + CTA */}
          <div>
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold bg-surface border border-hairline text-ink-2 mb-5">
              <LiveDot />
              1,204 posts saved today
            </span>

            <div className="font-indie-flower leading-[.9] text-ink mb-4 text-[60px] min-[860px]:text-[84px]">ADHX</div>

            <h1 id="hero-title" className="font-serif font-semibold tracking-[-.015em] leading-[1.12] text-ink mb-3.5 text-[28px] min-[860px]:text-[38px]">
              Save now. Read never. <span className="text-clay">Find always.</span>
            </h1>

            <p className="text-[15px] min-[860px]:text-[17px] text-ink-2 leading-[1.55] mb-7 max-w-[440px]">
              One private home for every tweet, Reel, TikTok, YouTube Short and article you hoard — then a calm way to actually get through it.
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
                    <PlatformGlyph platform="twitter" size={17} />
                    Connect with X
                    <ArrowRight className="w-[17px] h-[17px]" />
                  </>
                )}
              </button>
              <span className="text-[13.5px] text-ink-3">Free forever</span>
            </div>
          </div>

          {/* RIGHT: live discovery panel */}
          <LivePanel />
        </section>

        {/* ───────── Live discovery section ───────── */}
        <section id="discover" aria-labelledby="discover-title" className="px-6 sm:px-10 lg:px-16 pt-6 pb-2 max-w-[1240px] mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <LiveDot />
                <span className="text-[12.5px] font-bold uppercase tracking-[.08em] text-clay">Live discovery</span>
              </div>
              <h2 id="discover-title" className="font-serif font-semibold tracking-[-.01em] text-ink text-[24px] sm:text-[28px] m-0">
                Find your next rabbit hole
              </h2>
              <p className="text-[14.5px] text-ink-2 mt-1.5">
                Anonymous, real-time. Every save anyone makes streams here — tap to add it to your own collection.
              </p>
            </div>
            <a href="/discover" className="sm:ml-auto text-sm font-semibold text-clay whitespace-nowrap hover:opacity-80 transition-opacity">
              Open Discover →
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[18px]">
            {[LIVE[0], LIVE[2], LIVE[4], LIVE[5]].map((d, i) => (
              <DiscoverCard key={i} d={d} />
            ))}
          </div>
        </section>

        {/* ───────── Try it without an account ───────── */}
        <section id="try-it" aria-labelledby="try-it-title" className="px-6 sm:px-10 lg:px-16 py-11 max-w-[1240px] mx-auto">
          <div className="bg-surface border border-hairline rounded-[18px] px-6 sm:px-9 py-8 text-center">
            <h3 id="try-it-title" className="font-serif font-semibold text-ink text-[22px] mb-1.5">Try it without an account</h3>
            <p className="text-[14.5px] text-ink-2 mb-5">Paste any X, Instagram, TikTok, or YouTube link to preview it instantly.</p>
            <form onSubmit={handleTweetUrlSubmit} className="flex flex-col sm:flex-row gap-3 max-w-[620px] mx-auto">
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
            <p className="text-[12.5px] text-ink-3 mt-3">Works with X, Instagram, TikTok &amp; YouTube.</p>
          </div>
        </section>

        {/* ───────── Save method promo (iOS Shortcut / bookmarklet) ───────── */}
        <ShortcutPromo />

        {/* ───────── Value props ───────── */}
        <section id="how-it-works" aria-labelledby="features-title" className="px-6 sm:px-10 lg:px-16 pb-12 max-w-[1240px] mx-auto">
          <h2 id="features-title" className="sr-only">How it works</h2>
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
          <span className="font-indie-flower text-[22px] text-ink-3">Save now. Read never. Find always.</span>
        </footer>
      </div>
    </div>
  )
}

/* ───────── Live discovery panel (hero right column) ───────── */

function LivePanel() {
  return (
    <div className="bg-surface border border-hairline rounded-card shadow-m-lg p-4">
      <div className="flex items-center gap-2.5 mb-3.5">
        <LiveDot />
        <span className="font-bold text-sm text-ink">Live right now</span>
        <span className="ml-auto font-mono text-[12.5px] text-ink-3">1,204 saves today</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {LIVE.slice(0, 5).map((d, i) => (
          <LiveRow key={i} d={d} />
        ))}
      </div>
    </div>
  )
}

/* compact ticker row */
function LiveRow({ d }: { d: LiveItem }) {
  const thumb = d.media ? img(d.media, 120, 120) : null
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border',
        d.fresh ? 'bg-clay/8 border-clay/30' : 'bg-surface border-hairline',
      )}
    >
      {thumb ? (
        <div className="relative w-[46px] h-[46px] flex-none rounded-[10px] overflow-hidden">
          <img src={thumb} alt="" className="w-full h-full object-cover" />
          {d.type === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Play className="w-3.5 h-3.5 text-white" fill="#fff" />
            </div>
          )}
        </div>
      ) : (
        <div className="w-[46px] h-[46px] flex-none rounded-[10px] bg-inset flex items-center justify-center text-clay">
          {d.type === 'text' ? <Search className="w-[18px] h-[18px]" /> : <Bookmark className="w-[18px] h-[18px]" />}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-ink truncate">
          {d.title || d.body || `${TYPE_LABEL[d.type]} clip`}
        </div>
        <Anon t={d.t} plat={d.plat} />
      </div>
      <button
        aria-label="Save"
        className="flex-none w-[34px] h-[34px] rounded-[10px] border border-hairline bg-surface flex items-center justify-center text-clay transition-colors hover:bg-inset"
      >
        <Plus className="w-[17px] h-[17px]" />
      </button>
    </div>
  )
}

/* anonymous identity line */
function Anon({ t, plat }: { t: string; plat: PlatformId }) {
  return (
    <div className="flex items-center gap-1.5 text-ink-3">
      <span className="text-xs">Someone</span>
      <span className="text-xs">·</span>
      <span className="text-xs">{t}</span>
      <span className="text-xs">·</span>
      <PlatformGlyph platform={plat} size={12} />
    </div>
  )
}

/* discovery grid card */
function DiscoverCard({ d }: { d: LiveItem }) {
  const hasMedia = Boolean(d.media)
  return (
    <div className="flex flex-col h-full bg-surface border border-hairline rounded-card overflow-hidden shadow-m-sm">
      {hasMedia ? (
        <div className="relative">
          <img src={img(d.media!, 520, 400)} alt="" className="w-full block object-cover aspect-[4/3]" />
          <TypeBadge type={d.type} className="absolute top-2.5 left-2.5" />
          {d.saves >= 120 && (
            <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-bold bg-black/60 text-[#FDBA74]">
              <Zap className="w-3 h-3" fill="#FB923C" stroke="#FB923C" />
              {d.saves}
            </span>
          )}
          {d.type === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="w-11 h-11 rounded-full bg-black/45 backdrop-blur-sm flex items-center justify-center">
                <Play className="w-[18px] h-[18px] text-white" fill="#fff" />
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 pt-4 flex-1">
          <TypeBadge type={d.type} />
          <p className="text-[14.5px] text-ink leading-[1.5] mt-3 line-clamp-5">{d.body || d.title}</p>
        </div>
      )}
      <div className="flex items-center gap-2.5 px-3.5 py-3 mt-auto">
        <Anon t={d.t} plat={d.plat} />
        <button className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-clay-grad text-white shadow-glow font-semibold text-[13px] transition-transform hover:scale-[1.03]">
          <Plus className="w-3.5 h-3.5" />
          Save
        </button>
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
            {platform === 'ios' ? <Smartphone className="w-7 h-7" /> : <Monitor className="w-7 h-7" />}
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h2 className="font-serif font-semibold text-ink text-[18px] mb-2">
              {platform === 'ios' ? 'Share posts without the X drama' : 'Save posts with one click'}
            </h2>

            {platform === 'ios' ? (
              <>
                <p className="text-[14px] text-ink-2 leading-[1.5] mb-4">
                  Hit share on any post → get the full content with media, no login walls or algorithm nonsense. Perfect for sending posts to friends who refuse to make an account.
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
                  Drag this bookmarklet to your bookmarks bar. Click it on any X, Instagram, TikTok, or YouTube page to instantly open it in ADHX.
                </p>
                <div className="bg-inset rounded-card border border-hairline p-3 mb-4">
                  <code className="text-xs font-mono text-ink-2 break-all select-all">{BOOKMARKLET_CODE}</code>
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
                    You can also install ADHX as a PWA from your browser menu for share sheet access.
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
