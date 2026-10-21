'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { FeedItem } from '@/components/feed/types'
import { usableAvatarUrl } from '@/lib/avatar/generated-avatar'
import { networkLabel } from '@/lib/platform/networks'
import { fetchArticleMarkdown } from '@/lib/theater/article-body'
import { parseArticleMarkdown } from '@/lib/theater/article-markdown'
import { cn } from '@/lib/utils'
import { NetworkIcon } from '../NetworkIcon'
import { hasFullArticle, type NextPostKind } from '../post'
import { RichText, postBody } from '../rich-text'
import { articleBlocks } from '../stages/ArticleReader'
import { useReadingSettings } from '../stages'

/**
 * The original post, from the rail's network button (the phones'
 * `OriginalSheet`): who posted it and when, everything they wrote (a kept X
 * article in full), and the way to it on its network.
 */

/** A name worth showing: more than one letter, and not just the network's own name. */
function says(value: string | null | undefined, network: string): string | null {
  const v = (value ?? '').trim()
  if ([...v].length <= 1 || v.toLowerCase() === network.toLowerCase()) return null
  return v
}

/** Their name, else their handle; null when neither says more than the network. */
export function originalWho(
  post: Pick<FeedItem, 'authorName' | 'author' | 'platform'>,
): string | null {
  const network = networkLabel(post.platform)
  return says(post.authorName, network) ?? says(post.author?.replace(/^@/, ''), network)
}

/** `@handle`, unless it's the network's name, not a handle, or already the name shown. */
export function originalHandle(
  post: Pick<FeedItem, 'authorName' | 'author' | 'platform'>,
): string | null {
  const network = networkLabel(post.platform)
  const raw = says(post.author?.replace(/^@/, ''), network)
  if (!raw || /\s/.test(raw)) return null
  return raw.toLowerCase() === (originalWho(post) ?? '').toLowerCase() ? null : `@${raw}`
}

/** "18 Oct 2026", the day it was posted on its network. */
export function postedDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(at)
}

/** "@handle · Posted 18 Oct 2026" (the network's name when it has no date). */
export function originalLine(
  post: Pick<FeedItem, 'authorName' | 'author' | 'platform' | 'createdAt'>,
): string {
  const day = postedDay(post.createdAt)
  return [originalHandle(post), day ? `Posted ${day}` : networkLabel(post.platform)]
    .filter(Boolean)
    .join(' · ')
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'

export function OriginalSheet({
  post,
  kind,
  url,
  onCopy,
  onClose,
}: {
  post: FeedItem
  kind: NextPostKind
  /** The post on its network (null: we can't build one, so no buttons). */
  url: string | null
  /** Copy link: copies `url`, then says so (the sheet closes). */
  onCopy: (url: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { bionic, font } = useReadingSettings()
  const network = networkLabel(post.platform)
  const who = originalWho(post)
  const avatar = usableAvatarUrl(post.authorProfileImageUrl)
  const [broken, setBroken] = useState(false)
  // Their picture leads when there is one; otherwise the network's mark does (once).
  const pictureLeads = !!avatar && !broken
  const fullArticle = kind === 'article' && hasFullArticle(post)
  const [markdown, setMarkdown] = useState<string | null | undefined>(
    fullArticle ? undefined : null,
  )
  const text = postBody(post)

  useEffect(() => {
    if (!fullArticle) return
    let alive = true
    fetchArticleMarkdown(post.author, post.id).then((md) => {
      if (alive) setMarkdown(md)
    })
    return () => {
      alive = false
    }
  }, [fullArticle, post.author, post.id])

  // Callers pass a new onClose on every render; focus moves in once, on open.
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close.current()
        return
      }
      if (e.key !== 'Tab' || !ref.current) return
      // Keep Tab inside the sheet.
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !ref.current.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
  }, [])

  const noun =
    kind === 'photo'
      ? 'picture'
      : (post.platform as string | undefined) === 'soundcloud'
        ? 'sound'
        : 'video'
  const blocks = markdown ? parseArticleMarkdown(markdown) : []

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/40"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`The original post on ${network}`}
        tabIndex={-1}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-y-auto overscroll-contain rounded-t-[28px] font-nx-sans text-white outline-none',
          // Frosted over the stage, as on the phones.
          'border border-white/[0.08] bg-nx-surface/[0.72] shadow-[0_-10px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl backdrop-saturate-150',
          'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[min(720px,calc(100dvh-120px))] md:w-[min(480px,calc(100vw-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px] md:shadow-[0_24px_60px_rgba(0,0,0,0.6)]',
        )}
      >
        <div className="flex flex-col gap-[18px] px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-6">
          <header className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.12]"
            >
              {pictureLeads ? (
                <img
                  src={avatar}
                  alt=""
                  width={48}
                  height={48}
                  referrerPolicy="no-referrer"
                  onError={() => setBroken(true)}
                  className="block h-full w-full object-cover"
                />
              ) : (
                <NetworkIcon platform={post.platform} className="h-[22px] w-[22px] text-nx-cream" />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="truncate text-[17px] font-extrabold text-nx-cream">
                {who ?? network}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-nx-muted">
                {/* The network's mark shows once: here only when their picture leads. */}
                {pictureLeads && (
                  <NetworkIcon platform={post.platform} className="h-[13px] w-[13px]" />
                )}
                <span className="truncate">{originalLine(post)}</span>
              </span>
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-white hover:bg-white/20"
            >
              <X aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.6} />
            </button>
          </header>

          <div
            className="select-text text-[16px] leading-[1.55] text-nx-soft"
            style={font ? { fontFamily: font } : undefined}
          >
            {fullArticle && markdown === undefined ? (
              <p className="m-0 text-nx-muted">Getting the article…</p>
            ) : blocks.length > 0 ? (
              <div className="[&>*:first-child]:mt-0">{articleBlocks(blocks, bionic)}</div>
            ) : text ? (
              <RichText
                text={text}
                bionic={bionic}
                platform={post.platform ?? 'twitter'}
                linkClassName="font-semibold text-nx-cream underline decoration-current/30 underline-offset-[3px] hover:decoration-current"
              />
            ) : (
              <p className="m-0 text-nx-muted">{`No words with this one, just the ${noun}.`}</p>
            )}
          </div>

          {url && (
            <div className="flex flex-col gap-2.5 pt-1">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-nx-cream px-5 text-[15px] font-extrabold text-black hover:bg-white"
              >
                <NetworkIcon platform={post.platform} className="h-[18px] w-[18px]" />
                <span>{`Open on ${network}`}</span>
              </a>
              <button
                type="button"
                onClick={() => onCopy(url)}
                className="h-12 rounded-full border border-white/25 px-5 text-[15px] font-extrabold text-white hover:bg-white/[0.08]"
              >
                Copy link
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
