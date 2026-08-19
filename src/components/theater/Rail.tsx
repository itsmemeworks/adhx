'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Flame, ChevronRight, LogIn, Loader2, Send } from 'lucide-react'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { MatterLogo, LiveDot, PlatformChip, ConnectWithX } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { previewPath } from '@/lib/activity/preview-path'
import { UpNextList } from './UpNextList'
import { useSendFile } from './useSendFile'
import type { TheaterItem, TheaterMode } from './types'

/**
 * ~400px right rail (spec §3): brand + Connect, the now-playing post, actions
 * (Copy link / Save / Open on {platform}), the live Up-next feed, and a
 * footer link to the browse list. Follows the theme tokens — the dark look
 * on theater routes comes from the theme system defaulting dark there
 * (spec §7), not from hardcoded colors in this component.
 */

const PLATFORM_LABEL: Record<string, string> = {
  twitter: 'X',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
}

export interface RailProps {
  mode: TheaterMode
  items: TheaterItem[]
  current: TheaterItem | null
  currentKey: string | null
  isSeen: (key: string) => boolean
  seenReady: boolean
  freshKeys: ReadonlySet<string>
  newCount: number
  savedToday: number
  onSelect: (key: string) => void
}

function BrandRow({ mode }: { mode: TheaterMode }) {
  return (
    <div className="flex-none border-b border-hairline px-5 pt-5 pb-4">
      <div className="flex items-center justify-between">
        <a href="/" className="flex items-center">
          <MatterLogo size={19} />
        </a>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          <LiveDot />
          Live
        </span>
      </div>

      {mode === 'home' && (
        <div className="mt-3.5">
          <a
            href="/api/auth/twitter"
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full bg-clay-grad px-4 text-[13px] font-semibold text-white shadow-glow transition-opacity hover:opacity-90"
          >
            <ConnectWithX size={14} />
          </a>
          <p className="mt-2 text-center text-[11.5px] text-ink-3">Keep a pile, later.</p>
        </div>
      )}
    </div>
  )
}

function NowPlaying({ current }: { current: TheaterItem | null }) {
  if (!current) {
    return (
      <div className="flex-none border-b border-hairline px-5 py-5">
        <div className="h-3 w-24 animate-pulse rounded bg-inset" />
        <div className="mt-3 h-8 w-8 animate-pulse rounded-full bg-inset" />
        <div className="mt-3 h-3 w-full animate-pulse rounded bg-inset" />
        <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-inset" />
      </div>
    )
  }

  const trendCount = current.trendCount ?? current.saveCount ?? 0
  const handle = current.author ? current.author.replace(/^@+/, '') : ''

  return (
    <div className="flex-none border-b border-hairline px-5 py-4">
      <div className="flex items-center gap-2">
        <PlatformChip platform={current.platform} />
        <span className="font-mono text-[12px] text-ink-3" suppressHydrationWarning>
          {formatCompactRelativeTime(current.createdAt)}
        </span>
        {trendCount >= 2 && (
          <span className="ml-auto inline-flex flex-none items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[11px] font-bold text-orange-300">
            <Flame size={11} className="text-orange-400" fill="currentColor" />
            {trendCount}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2.5">
        <AuthorAvatar
          src={current.authorAvatarUrl ?? current.thumbnailUrl}
          author={current.author}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-bold text-ink">
            {current.authorName || (handle ? `@${handle}` : 'Saved post')}
          </div>
          {handle && <div className="truncate font-mono text-[11px] text-ink-3">@{handle}</div>}
        </div>
      </div>

      <p className="mt-2.5 line-clamp-4 text-[14px] leading-relaxed text-ink">
        {(current.text || '').trim() || 'Saved post'}
      </p>
    </div>
  )
}

function Actions({ mode, current }: { mode: TheaterMode; current: TheaterItem | null }) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { supported: sendSupported, sending, send } = useSendFile(current)

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [],
  )

  if (!current) return null

  const platformLabel = PLATFORM_LABEL[current.platform] ?? current.platform

  const handleCopy = async () => {
    const path = previewPath(current.platform, current.author, current.bookmarkId || '')
    const shareUrl = new URL(path, window.location.origin).toString()
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard can be denied (permissions/insecure context) — silently no-op,
      // there's nothing actionable to show the user beyond the button itself.
    }
  }

  const buttonBase =
    'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-hairline bg-inset px-3 text-[12.5px] font-semibold text-ink transition-colors hover:bg-surface'
  // The emphasized (clay-grad) treatment: Save normally wears this on the home
  // rail, but Send takes it over as the first, primary action whenever the
  // current item has a sendable file — Save then drops to the outline style.
  const primaryBase =
    'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-clay-grad px-3 text-[12.5px] font-semibold text-white shadow-glow transition-opacity hover:opacity-90'

  return (
    <div className="flex-none border-b border-hairline px-5 py-3">
      <div className="flex items-center gap-2">
        {sendSupported && (
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            className={`${primaryBase} disabled:opacity-60`}
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send
          </button>
        )}

        <button type="button" onClick={handleCopy} className={buttonBase}>
          {copied ? <Check size={14} className="text-done" /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>

        {mode === 'home' && !sendSupported ? (
          <a href="/api/auth/twitter" className={primaryBase}>
            <LogIn size={14} />
            Save
          </a>
        ) : (
          <a href="/api/auth/twitter" className={buttonBase}>
            <LogIn size={14} />
            Save
          </a>
        )}

        <a
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonBase}
          title={`Open on ${platformLabel}`}
        >
          <ExternalLink size={14} />
          Open
        </a>
      </div>
    </div>
  )
}

export function Rail({
  mode,
  items,
  current,
  currentKey,
  isSeen,
  seenReady,
  freshKeys,
  newCount,
  savedToday,
  onSelect,
}: RailProps) {
  return (
    <div className="flex h-full w-full flex-col bg-surface text-ink lg:h-full lg:w-[360px] lg:border-l lg:border-hairline xl:w-[400px]">
      <BrandRow mode={mode} />
      <NowPlaying current={current} />
      <Actions mode={mode} current={current} />

      <div className="flex min-h-0 flex-1 flex-col">
        <h2 className="flex-none px-5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-3">
          Up next
        </h2>
        <UpNextList
          items={items}
          currentKey={currentKey}
          isSeen={isSeen}
          seenReady={seenReady}
          freshKeys={freshKeys}
          newCount={newCount}
          onSelect={onSelect}
          className="flex-1"
        />
      </div>

      <div className="flex flex-none items-center justify-between gap-3 border-t border-hairline px-5 py-3">
        <a
          href="/trending"
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-2 hover:text-ink"
        >
          Browse as list
          <ChevronRight size={14} />
        </a>
        {savedToday > 0 && (
          <span className="text-[11.5px] text-ink-3">{savedToday} saved today</span>
        )}
      </div>
    </div>
  )
}
