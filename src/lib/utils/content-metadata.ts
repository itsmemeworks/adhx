import type { Metadata } from 'next'

/**
 * Platform-agnostic helpers for content-first `<title>` / meta description
 * generation, shared by all preview pages (tweet, Reel, TikTok, Short).
 *
 * "Content-first" means the tag leads with the post's own content instead of
 * a utility pitch ("Preview @user's post") — GSC showed the old utility
 * framing converting at 0.4% CTR, well below what a content-led snippet gets.
 *
 * The description is deliberately **not** a longer re-cut of the same opening
 * text as the title. A snippet whose description just restates its headline
 * adds no information past the first line and reads like a scraper mirror
 * (GSC, 2026-07-27: 1.89K impressions at avg position 7.7 for 9 clicks — the
 * pages were being seen and not chosen). `buildSnippetDescription` instead
 * continues where the title stopped, then appends what the page *holds*
 * (media, engagement) and why to open ours rather than the dead x.com link.
 */

const TITLE_LEN = 60
/**
 * ~155 rather than a flush 160: Google truncates on pixel width, not character
 * count, so the last clause is the first thing lost — and here that's the
 * closer, the part carrying the reason to click. The margin protects it.
 */
const DESC_LEN = 155
/** Separator for the metadata trail in a description. */
const SEP = ' · '
/** Below this many chars, a content continuation is noise — drop it entirely. */
const MIN_CONTINUATION = 24

/** Strip URLs, collapse whitespace. Shared by every builder here. */
function normalize(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Truncate at a word boundary near `maxLength`, stripping URLs and collapsing
 * whitespace first. Falls back to a hard cut when the nearest earlier space
 * would throw away too much of the budget (< 60% of it).
 */
export function truncateWordBoundary(text: string, maxLength: number): string {
  const clean = normalize(text)
  if (clean.length <= maxLength) return clean
  const sliced = clean.slice(0, maxLength)
  const lastSpace = sliced.lastIndexOf(' ')
  const cut = lastSpace > maxLength * 0.6 ? sliced.slice(0, lastSpace) : sliced
  return `${cut.trimEnd()}…`
}

/**
 * Content-first `<title>`: the post's own content. No brand suffix here — the
 * root layout's title template (`%s | ADHX`) appends it exactly once; adding
 * it in the string too rendered a double "| ADHX | ADHX".
 */
export function buildContentTitle(content: string, maxLength = TITLE_LEN): string {
  return truncateWordBoundary(content, maxLength)
}

/**
 * The part of `content` a title doesn't already show, so the description can
 * carry new text instead of repeating the headline.
 *
 * Reduces the title back to the content lead it displays (dropping a trailing
 * `— @handle` attribution and any truncation ellipsis); if that lead prefixes
 * the content, returns the rest. Returns the full content when the title isn't
 * derived from it at all (an X Article headline, a `Video by @user` fallback),
 * since there's nothing to duplicate in that case.
 */
export function contentAfterTitle(title: string, content: string): string {
  const clean = normalize(content)
  const lead = normalize(title)
    .replace(/\s+—\s+@\S+$/, '')
    .replace(/…$/, '')
    .trim()
  if (!lead || !clean.toLowerCase().startsWith(lead.toLowerCase())) return clean
  return clean
    .slice(lead.length)
    .replace(/^[\s—–-]+/, '')
    .trim()
}

/**
 * Attribution fact for a description trail — `"@user on TikTok"` — suppressed
 * when `title` already names the author, so a snippet never says it twice.
 * Falls back to the bare platform name when the author is unknown.
 */
export function attributionFact(
  title: string,
  who: string | undefined,
  platform: string,
): string | undefined {
  if (!who) return platform
  return title.includes(who) ? undefined : `${who} on ${platform}`
}

export interface SnippetDescriptionInput {
  /** The `<title>` content already generated for this page (no brand suffix). */
  title: string
  /** The post's full text/caption. Whatever the title didn't show gets used. */
  content?: string
  /** Short facts about what the page holds, e.g. `['Video', '7.3K likes']`. */
  facts?: string[]
  /** Closing clause — the reason to open this page. Kept even when tight. */
  closer?: string
  maxLength?: number
}

/**
 * Metadata for a valid preview URL whose trusted content could not be resolved.
 *
 * Both confirmed removals and transient upstream failures use this shape:
 * crawlers must not index a thin generic page, while the canonical remains
 * stable so a later dynamic request can become indexable after recovery.
 * Deliberately omits Open Graph and Twitter media claims.
 */
export function unavailablePreviewMetadata({
  title,
  description,
  canonicalUrl,
}: {
  title: string
  description: string
  canonicalUrl: string
}): Metadata {
  return {
    title,
    description,
    robots: { index: false },
    alternates: { canonical: canonicalUrl },
    openGraph: null,
    twitter: null,
  }
}

/**
 * Meta description for the SERP snippet: `<content the title didn't show> ·
 * <facts> · <closer>`, capped at `maxLength` so Google shows the whole thing
 * rather than cutting the closer off.
 *
 * The continuation is what flexes — facts and closer are fixed-cost and carry
 * the differentiation, so they get their budget first and the content takes
 * what's left (and is dropped entirely when that's less than
 * `MIN_CONTINUATION` chars, which is also what happens for a post short enough
 * that the title already showed all of it).
 */
export function buildSnippetDescription({
  title,
  content = '',
  facts = [],
  closer = '',
  maxLength = DESC_LEN,
}: SnippetDescriptionInput): string {
  const fixed = [...facts, closer].map((part) => part.trim()).filter(Boolean)
  const fixedStr = fixed.join(SEP)

  // Guard only: callers pass short facts/closers, so this stays well under
  // budget in practice. If it ever doesn't, the trail alone is the description.
  if (fixedStr.length >= maxLength - MIN_CONTINUATION) {
    return truncateWordBoundary(fixedStr, maxLength)
  }

  const available = maxLength - fixedStr.length - (fixed.length > 0 ? SEP.length : 0)
  const remainder = contentAfterTitle(title, content)
  const isContinuation = remainder.length > 0 && remainder !== normalize(content)
  // The leading "…" signals the text picks up from the title.
  const budget = isContinuation ? available - 1 : available
  const truncated = remainder.length > 0 ? truncateWordBoundary(remainder, budget) : ''

  // A stub continuation is only worth dropping when facts/closer can carry the
  // description on their own — otherwise dropping it would emit nothing at all.
  const minLead = fixed.length > 0 ? MIN_CONTINUATION : 1
  const lead = truncated.length >= minLead ? `${isContinuation ? '…' : ''}${truncated}` : ''

  return [lead, ...fixed].filter(Boolean).join(SEP)
}

/**
 * Shared OG / Twitter / canonical tail for Reels, TikTok, and Shorts.
 * The tweet page stays richer (article:author, creator, tombstone).
 */
export function previewPageMetadata({
  title,
  description,
  canonicalUrl,
  image,
  videoUrl,
  ogType,
}: {
  title: string
  description: string
  canonicalUrl: string
  image: string
  videoUrl?: string
  ogType?: 'video.other' | 'article'
}): Metadata {
  const type = ogType ?? (videoUrl ? 'video.other' : 'article')
  return {
    title,
    description,
    openGraph: {
      type,
      title,
      description,
      siteName: 'ADHX',
      url: canonicalUrl,
      images: [{ url: image, alt: title }],
      ...(videoUrl
        ? { videos: [{ url: videoUrl, type: 'video/mp4' as const, width: 1080, height: 1920 }] }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    alternates: {
      canonical: canonicalUrl,
    },
  }
}
