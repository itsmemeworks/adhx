'use client'

import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { FeedItem } from '@/components/feed/types'
import { toBionicText } from '@/components/feed/text-rendering'
import { cn } from '@/lib/utils'
import { NxImage } from './primitives'

/**
 * Post words as people wrote them: paragraphs kept, links, @mentions and
 * #hashtags clickable, Bionic Reading when it's on. Plus the card for a
 * linked page (picture, title, site) when the post links out.
 */

// A URL, an @mention or a #hashtag. URLs stop before trailing punctuation.
const TOKEN =
  /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]|@[A-Za-z0-9_]{1,15}\b|#[\p{L}\p{N}_]{2,60})/gu

export { postBody } from '@/lib/feed/post-body'

/** First external (not X) link in the text, if any. */
export function externalUrl(text: string): string | null {
  for (const m of text.matchAll(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g)) {
    try {
      const host = new URL(m[0]).hostname.replace(/^www\./, '')
      if (host !== 'x.com' && host !== 'twitter.com' && host !== 't.co') return m[0]
    } catch {
      // not a URL
    }
  }
  return null
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname === '/' ? '' : u.pathname
    const s = `${u.hostname.replace(/^www\./, '')}${path}`
    return s.length > 42 ? `${s.slice(0, 40)}…` : s
  } catch {
    return url
  }
}

function hrefFor(token: string, platform: string): string | null {
  if (token.startsWith('http')) return token
  if (platform !== 'twitter') return null
  if (token.startsWith('@')) return `https://x.com/${token.slice(1)}`
  if (token.startsWith('#')) return `https://x.com/hashtag/${encodeURIComponent(token.slice(1))}`
  return null
}

function line(
  text: string,
  bionic: boolean,
  platform: string,
  linkClass: string,
  key: string,
): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    const k = `${key}-${i}`
    if (!part) return null
    if (i % 2 === 1) {
      const href = hrefFor(part, platform)
      if (href) {
        return (
          <a
            key={k}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            // The stage underneath pauses or advances on taps; a link isn't one.
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={linkClass}
          >
            {part.startsWith('http') ? shortUrl(part) : part}
          </a>
        )
      }
    }
    return <span key={k}>{bionic ? toBionicText(part) : part}</span>
  })
}

/** Paragraphs of post text with clickable links. */
export function RichText({
  text,
  bionic = false,
  platform = 'twitter',
  className,
  paragraphClassName,
  style,
  linkClassName = 'font-semibold underline decoration-current/30 underline-offset-[3px] hover:decoration-current',
}: {
  text: string
  bionic?: boolean
  platform?: string
  className?: string
  paragraphClassName?: string
  style?: CSSProperties
  linkClassName?: string
}) {
  const paragraphs = text.split(/\n{2,}/)
  return (
    <div className={cn('flex flex-col gap-[0.7em]', className)} style={style}>
      {paragraphs.map((para, p) => (
        <p key={p} className={cn('m-0', paragraphClassName)}>
          {para.split('\n').map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {line(l, bionic, platform, linkClassName, `${p}-${i}`)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  )
}

export interface LinkCardData {
  url: string
  title: string | null
  description: string | null
  image: string | null
  site: string
}

const cards = new Map<string, Promise<LinkCardData | null>>()

function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * The card for the page a post links to: from the saved preview when there
 * is one, else from the post's public JSON (the preview pages' source).
 */
export function useLinkCard(item: FeedItem, text: string): LinkCardData | null {
  const url = externalUrl(text)
  const preview = item.articlePreview
  const stored =
    preview && preview.url && siteOf(preview.url) !== 'x.com' && (preview.title || preview.imageUrl)
      ? {
          url: preview.url,
          title: preview.title ?? null,
          description: preview.description ?? null,
          image: preview.imageUrl ?? null,
          site: preview.domain || siteOf(preview.url),
        }
      : null
  const [fetched, setFetched] = useState<LinkCardData | null>(null)
  const key = `${item.author}:${item.id}`

  useEffect(() => {
    setFetched(null)
    if (stored || !url || (item.platform ?? 'twitter') !== 'twitter' || !item.author) return
    let alive = true
    let pending = cards.get(key)
    if (!pending) {
      pending = fetch(
        `/api/share/tweet/${encodeURIComponent(item.author)}/${encodeURIComponent(item.id)}`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (
            d: {
              externalLink?: {
                url?: string
                title?: string
                description?: string
                thumbnailUrl?: string
                displayUrl?: string
              }
            } | null,
          ) => {
            const link = d?.externalLink
            if (!link?.url) return null
            return {
              url: link.url,
              title: link.title ?? null,
              description: link.description ?? null,
              image: link.thumbnailUrl ?? null,
              site: link.displayUrl || siteOf(link.url),
            }
          },
        )
        .catch(() => null)
      cards.set(key, pending)
    }
    void pending.then((card) => {
      if (alive) setFetched(card)
    })
    return () => {
      alive = false
    }
    // `stored` is derived from `item`; key and url cover what matters.
  }, [key, url])

  return stored ?? fetched
}

/** Remove the card's URL from the text when it's the last thing in it (X does the same). */
export function withoutCardUrl(text: string, card: LinkCardData | null): string {
  if (!card) return text
  const trimmed = text.trimEnd()
  if (trimmed.endsWith(card.url)) return trimmed.slice(0, -card.url.length).trimEnd()
  return text
}

export function LinkCard({ card, className }: { card: LinkCardData; className?: string }) {
  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'group block overflow-hidden rounded-2xl border border-nx-bone bg-white/60 text-nx-ink no-underline transition-colors hover:bg-white',
        className,
      )}
    >
      {card.image && (
        <span className="relative block aspect-[1.91/1] overflow-hidden bg-nx-bone/40">
          <NxImage
            src={card.image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </span>
      )}
      <span className="flex flex-col gap-1 px-4 py-3 font-nx-sans">
        {card.title && (
          <span className="line-clamp-2 text-[15px] font-bold leading-snug">{card.title}</span>
        )}
        {card.description && (
          <span className="line-clamp-2 text-[13px] leading-snug text-nx-on-cream">
            {card.description}
          </span>
        )}
        <span className="text-[12px] font-semibold uppercase tracking-wide text-nx-on-cream">
          {card.site}
        </span>
      </span>
    </a>
  )
}
