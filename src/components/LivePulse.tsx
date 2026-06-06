'use client'

import { useEffect, useState } from 'react'
import { Instagram, Youtube } from 'lucide-react'
import { XIcon } from '@/components/icons'
import { formatCompactRelativeTime } from '@/lib/utils/format'

/**
 * LivePulse — the landing-page "what's happening on ADHX right now" ticker.
 *
 * Polls the public, anonymous /api/activity feed and scrolls it as a marquee.
 * Hovering pauses the scroll (and the poll-driven reshuffle) so a visitor can
 * read/click an item; moving away resumes it. Renders nothing until there's
 * activity, so a fresh install stays clean.
 */

interface PulseItem {
  action: 'preview' | 'save' | 'read'
  platform: 'twitter' | 'instagram' | 'tiktok' | string
  author: string
  authorName?: string | null
  text?: string | null
  thumbnailUrl?: string | null
  url: string
  createdAt: string
}

const VERB: Record<string, string> = {
  preview: 'previewed',
  save: 'saved',
  read: 'read',
}

const POLL_MS = 12_000

/** Inline TikTok glyph (lucide ships none). */
function TikTokGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 0 1-5.201 1.743 2.896 2.896 0 0 1 2.342-4.585c.28 0 .55.04.808.115V9.435a6.327 6.327 0 0 0-.808-.051 6.272 6.272 0 0 0-6.272 6.272A6.272 6.272 0 0 0 9.515 22h.005a6.272 6.272 0 0 0 6.272-6.272V8.687a8.182 8.182 0 0 0 4.773 1.526V6.78a4.795 4.795 0 0 1-.976-.094z" />
    </svg>
  )
}

function PlatformGlyph({ platform }: { platform: string }) {
  if (platform === 'instagram') return <Instagram className="w-3.5 h-3.5 text-pink-500" />
  if (platform === 'tiktok') return <TikTokGlyph className="w-3.5 h-3.5 text-gray-900 dark:text-white" />
  if (platform === 'youtube') return <Youtube className="w-3.5 h-3.5 text-red-600" />
  return <XIcon className="w-3 h-3 text-gray-900 dark:text-white" />
}

function PulseCard({ item }: { item: PulseItem }) {
  const verb = VERB[item.action] ?? 'saved'
  const who = item.authorName || `@${item.author}`
  return (
    <a
      href={item.url}
      className="flex items-center gap-3 shrink-0 max-w-xs px-3 py-2 rounded-2xl bg-white/80 dark:bg-gray-800/70 backdrop-blur border border-gray-200/70 dark:border-gray-700/70 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md transition-all"
    >
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          className="w-10 h-10 rounded-lg object-cover bg-gray-200 dark:bg-gray-700 shrink-0"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : (
        <span className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
          <PlatformGlyph platform={item.platform} />
        </span>
      )}
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-900 dark:text-white">
          <PlatformGlyph platform={item.platform} />
          <span className="truncate">
            Someone {verb} · {who}
          </span>
        </span>
        {item.text && (
          <span className="block text-xs text-gray-500 dark:text-gray-400 truncate max-w-[14rem]">
            {item.text}
          </span>
        )}
        <span className="block text-[10px] uppercase tracking-wide text-gray-400">
          {formatCompactRelativeTime(item.createdAt)}
        </span>
      </span>
    </a>
  )
}

export function LivePulse() {
  const [items, setItems] = useState<PulseItem[]>([])
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      // Don't reshuffle the list out from under a hovering reader.
      if (paused) return
      try {
        const res = await fetch('/api/activity', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (alive && Array.isArray(data.items)) setItems(data.items)
      } catch {
        // offline / transient — keep showing what we have
      }
    }
    load()
    const t = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [paused])

  if (items.length === 0) return null

  // Render the list twice so the -50% marquee loops seamlessly. Speed scales
  // with item count so a short list doesn't whip past.
  const duration = `${Math.max(24, items.length * 4)}s`
  const loop = [...items, ...items]

  return (
    <section
      aria-label="Live activity on ADHX"
      className="relative max-w-6xl mx-auto px-4 py-6"
    >
      <div className="flex items-center justify-center gap-2 mb-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Live on ADHX right now
        </span>
      </div>

      {/* edge fade so cards slide in/out softly */}
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
        <div
          className="flex w-max gap-3 animate-marquee motion-reduce:animate-none hover:[animation-play-state:paused]"
          style={{ ['--marquee-duration' as string]: duration }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {loop.map((item, i) => (
            <PulseCard key={`${item.url}-${i}`} item={item} />
          ))}
        </div>
      </div>
    </section>
  )
}
