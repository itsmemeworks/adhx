'use client'

/**
 * Knowledge Graph — the saved-post card shown inside the detail panel.
 *
 * Renders a save faithfully per content type (article / video / photo / quote /
 * text) using Matter tokens — the in-panel analogue of the prototype's `GCard`.
 * Built from the compact `GraphCardData` the API returns (no extra fetch).
 */
import { Play } from 'lucide-react'
import { PlatformGlyph } from '@/components/matter'
import { cn } from '@/lib/utils'
import { TYPE_COLORS, type GraphCardData } from './types'

function initials(name: string | null, handle: string | null): string {
  const base = (name || handle || '?').replace(/^@/, '')
  return base
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function durationLabel(ms: number | null): string | null {
  if (!ms || ms <= 0) return null
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function Avatar({ card }: { card: GraphCardData }) {
  return (
    <div
      className="flex h-[38px] w-[38px] flex-none items-center justify-center overflow-hidden rounded-full bg-inset text-[13px] font-semibold text-ink-2"
      aria-hidden="true"
    >
      {card.avatarUrl ? (
        <img
          src={card.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        initials(card.authorName, card.handle)
      )}
    </div>
  )
}

export function GraphPostCard({ card }: { card: GraphCardData }) {
  const dur = durationLabel(card.durationMs)
  const showHero =
    (card.type === 'video' || card.type === 'photo' || card.type === 'article') && !!card.heroUrl

  return (
    <article className="overflow-hidden rounded-card border border-hairline bg-surface">
      {/* author header */}
      <header className="flex items-center gap-3 px-4 pt-4 pb-2">
        <Avatar card={card} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold text-ink">
            {card.authorName || card.handle || 'Unknown'}
          </p>
          {card.handle && (
            <p className="truncate font-mono text-[12px] text-ink-3">{card.handle}</p>
          )}
        </div>
        <span className="flex-none text-ink-3">
          <PlatformGlyph platform={card.platform} size={16} />
        </span>
      </header>

      {/* article title */}
      {card.type === 'article' && card.articleTitle && (
        <h3 className="px-4 pb-2 font-serif text-[17px] font-semibold leading-snug text-ink">
          {card.articleTitle}
        </h3>
      )}

      {/* body / caption */}
      {card.body && (
        <p
          className={cn(
            'whitespace-pre-wrap break-words px-4 text-[14px] leading-relaxed text-ink-2 [overflow-wrap:anywhere]',
            showHero ? 'pb-3 line-clamp-4' : 'pb-3',
          )}
        >
          {card.body}
        </p>
      )}

      {/* hero media */}
      {showHero && (
        <div className="relative mx-4 mb-4 overflow-hidden rounded-2xl bg-black">
          <img
            src={card.heroUrl as string}
            alt=""
            className="max-h-[340px] w-full object-cover"
            referrerPolicy="no-referrer"
          />
          {card.isVideo && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55">
                <Play className="ml-0.5 h-5 w-5 text-white" fill="currentColor" />
              </span>
            </span>
          )}
          {dur && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
              {dur}
            </span>
          )}
        </div>
      )}

      {/* quoted tweet */}
      {card.type === 'quote' && card.quote && (
        <div className="mx-4 mb-4 rounded-xl border border-hairline bg-inset px-3 py-2.5">
          {card.quote.handle && (
            <p className="mb-1 font-mono text-[11.5px] text-ink-3">{card.quote.handle}</p>
          )}
          {card.quote.text && (
            <p className="line-clamp-4 break-words text-[13px] leading-relaxed text-ink-2">
              {card.quote.text}
            </p>
          )}
        </div>
      )}

      {/* article description (when no body) */}
      {card.type === 'article' && !card.body && card.articleDescription && (
        <p className="px-4 pb-4 text-[13.5px] leading-relaxed text-ink-3">
          {card.articleDescription}
        </p>
      )}

      {/* type accent strip */}
      <div
        className="h-1 w-full"
        style={{ background: TYPE_COLORS[card.type] }}
        aria-hidden="true"
      />
    </article>
  )
}
