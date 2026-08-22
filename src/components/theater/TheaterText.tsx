'use client'

/**
 * Linkified text for the theater's dark surfaces — the shared primitive every
 * theater text site renders through (StageText, the rails' now-playing, the
 * mobile caption, the quote card), so URLs are clickable everywhere and the
 * styling stays consistent. Mirrors what `renderTextWithLinks` does for the
 * light feed surfaces (`src/components/feed/utils.tsx`) but styled for the
 * near-black stage (clay links) and built on a pure, unit-testable splitter.
 *
 * Media `t.co` tails are stripped when the post carries media (same
 * `stripMediaUrls` the feed cards use) — a video caption ending in its own
 * media link reads like a bug.
 *
 * The t.co link-resolution policy (spec §6b) lives here too, layered on top
 * of the raw splitter as a pure pipeline (`resolveLink` → `buildRenderSegments`)
 * so every rule is node-testable without rendering React.
 */

import React from 'react'
import { cn } from '@/lib/utils'
import { decodeHtmlEntities, stripMediaUrls } from '@/components/feed/utils'
import type { TextLinkRef } from './types'

const URL_PATTERN = /(https?:\/\/[^\s]+)/g
const DISPLAY_URL_MAX = 40
const TRAILING_PUNCT = /[.,)!?]/
const TCO_RE = /^https?:\/\/t\.co\//i
const TWEET_STATUS_RE = /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+/i

export type TextPart = { type: 'text'; value: string } | { type: 'link'; href: string }

/**
 * Pure: `@mention` detection, run only over the `text` parts `splitTextParts`
 * already carved out (never over `link` parts — a mention-shaped substring
 * inside a URL is never re-parsed). Handle grammar is platform-specific:
 * twitter has no dots (`[A-Za-z0-9_]{1,15}`), instagram/tiktok/others allow
 * dots (`[A-Za-z0-9._]{1,30}`) but a run of trailing dots is sentence
 * punctuation, not part of the handle, so it's excluded from the match (same
 * spirit as the URL trailing-punctuation split above).
 *
 * The char immediately before `@` must be absent (start of string) or a
 * non-word character — this is what keeps `a@b.com` from linkifying: the `a`
 * is a word character, so the `@` there never starts a mention.
 */
export type MentionTextPart = { type: 'text'; value: string } | { type: 'mention'; handle: string }

function mentionRegexFor(platform: string): RegExp {
  const isDotless = platform === 'twitter'
  const charClass = isDotless ? 'A-Za-z0-9_' : 'A-Za-z0-9._'
  const max = isDotless ? 15 : 30
  // Group 1: the char before `@` (captured so it's preserved as text), or
  // empty at start-of-string. Group 2: the raw handle (may have trailing dots
  // that get trimmed after the match).
  return new RegExp(`(^|[^A-Za-z0-9_])@([${charClass}]{1,${max}})`, 'g')
}

export function splitMentionParts(text: string, platform: string): MentionTextPart[] {
  const regex = mentionRegexFor(platform)
  const parts: MentionTextPart[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text))) {
    const prefix = match[1]
    const rawHandle = match[2]
    const mentionStart = match.index + prefix.length
    const rawEnd = mentionStart + 1 + rawHandle.length // +1 for '@'
    const handle = rawHandle.replace(/\.+$/, '')
    if (!handle) continue // all-dots after '@' — not a real handle, leave as text
    const mentionEnd = rawEnd - (rawHandle.length - handle.length)

    if (mentionStart > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, mentionStart) })
    }
    parts.push({ type: 'mention', handle })
    lastIndex = mentionEnd
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return parts
}

/** Pure: the profile URL a mention links to. `null` for a platform with no known profile URL shape (rendered as plain text, not an anchor). */
export function mentionHref(platform: string, handle: string): string | null {
  switch (platform) {
    case 'twitter':
      return `https://x.com/${handle}`
    case 'tiktok':
      return `https://www.tiktok.com/@${handle}`
    case 'instagram':
      return `https://www.instagram.com/${handle}/`
    case 'youtube':
      return `https://www.youtube.com/@${handle}`
    default:
      return null
  }
}

/**
 * Preview-text cleanup for LIST ROWS (Up next, collection queue): rows render
 * plain clamped text with no anchors, so a bare `https://t.co/xxx` is pure
 * noise there — remove ALL t.co URLs and collapse the whitespace they leave.
 * Only for row previews; full surfaces render through TheaterLinkedText.
 */
export function stripShortLinksForPreview(text: string): string {
  return text
    .replace(/https?:\/\/t\.co\/[A-Za-z0-9]+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([.,!?)])/g, '$1')
    .trim()
}

/**
 * Pure: split text into text/link parts. Runs over the whole (possibly
 * multi-line) string — the URL regex already stops at whitespace/newlines,
 * so line breaks land inside surrounding text parts unchanged. Exported for
 * tests — the component below is a thin renderer over this.
 */
export function splitTextParts(line: string): TextPart[] {
  const parts: TextPart[] = []
  for (const piece of line.split(URL_PATTERN)) {
    if (!piece) continue
    URL_PATTERN.lastIndex = 0
    if (URL_PATTERN.test(piece)) {
      parts.push({ type: 'link', href: piece })
    } else {
      parts.push({ type: 'text', value: piece })
    }
    URL_PATTERN.lastIndex = 0
  }
  return parts
}

/** Pure: the shortened label an unresolved link renders as. */
export function displayUrl(href: string): string {
  return href.length > DISPLAY_URL_MAX ? `${href.slice(0, DISPLAY_URL_MAX)}...` : href
}

/** Pure: strip protocol + leading `www.`, then truncate — X's own display style. */
export function cleanDisplayUrl(url: string): string {
  const stripped = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  return stripped.length > DISPLAY_URL_MAX ? `${stripped.slice(0, DISPLAY_URL_MAX)}...` : stripped
}

function isUnresolvedTco(url: string): boolean {
  return TCO_RE.test(url)
}

function isTweetLink(link: TextLinkRef): boolean {
  return link.linkType === 'tweet' || TWEET_STATUS_RE.test(link.expandedUrl)
}

function buildShortUrlLookup(links: TextLinkRef[] | undefined): Map<string, TextLinkRef> {
  const map = new Map<string, TextLinkRef>()
  for (const link of links ?? []) {
    if (link.shortUrl) map.set(link.shortUrl, link)
  }
  return map
}

/**
 * A regex-captured URL can drag along sentence punctuation (`.,)!?`) that was
 * never part of the short link. Strip trailing punctuation one character at a
 * time, checking after each strip whether the remainder is a *known*
 * shortUrl — i.e. find the longest prefix that resolves. Unknown hrefs are
 * returned unchanged (their punctuation stays part of the raw URL, as today).
 */
function splitTrailingPunct(
  href: string,
  lookup: Map<string, TextLinkRef>,
): { base: string; tail: string } {
  if (lookup.has(href)) return { base: href, tail: '' }
  let base = href
  let tail = ''
  while (base.length > 0 && TRAILING_PUNCT.test(base[base.length - 1])) {
    tail = base[base.length - 1] + tail
    base = base.slice(0, -1)
    if (lookup.has(base)) return { base, tail }
  }
  return { base: href, tail: '' }
}

/**
 * Pure: is `parts[index]` (a link part) the LAST url in the whole text, with
 * only whitespace following it? Powers the trailing-link heuristic (spec
 * §6b) — X appends the quote-tweet link last, so an unresolved trailing t.co
 * can be stripped when the surface already renders that content; a link
 * anywhere else in the text is never stripped just for being unresolved.
 */
export function isTrailingLink(parts: TextPart[], index: number): boolean {
  for (let i = index + 1; i < parts.length; i++) {
    const part = parts[i]
    if (part.type === 'link') return false
    if (part.value.trim() !== '') return false
  }
  return true
}

export type LinkResolution =
  { kind: 'strip'; tail: string } | { kind: 'anchor'; href: string; label: string; tail: string }

/**
 * Pure: the whole t.co resolution policy (spec §6b) for a single URL token.
 * `href` is the raw regex-captured token (may carry trailing punctuation —
 * see `splitTrailingPunct`). `isTrailing` should come from `isTrailingLink`
 * over the full parts array.
 */
export function resolveLink(
  href: string,
  links: TextLinkRef[] | undefined,
  hideTweetLinks: boolean | undefined,
  isTrailing: boolean,
): LinkResolution {
  const lookup = buildShortUrlLookup(links)
  const { base, tail } = splitTrailingPunct(href, lookup)
  const match = lookup.get(base)

  if (match) {
    if (isTweetLink(match) && hideTweetLinks) {
      return { kind: 'strip', tail }
    }
    return {
      kind: 'anchor',
      href: match.expandedUrl,
      label: cleanDisplayUrl(match.expandedUrl),
      tail,
    }
  }

  if (hideTweetLinks && isTrailing && isUnresolvedTco(base)) {
    return { kind: 'strip', tail: '' }
  }

  return { kind: 'anchor', href, label: displayUrl(href), tail: '' }
}

export type RenderSegment =
  | { type: 'text'; value: string }
  | { type: 'anchor'; href: string; label: string }
  | { type: 'mention'; handle: string; href: string | null }

/**
 * Pure: text → renderable segments, applying the full link-resolution policy
 * and collapsing whitespace left behind by any stripped link. This is the
 * whole §6b pipeline in one node-testable function; the component below just
 * maps it to JSX.
 *
 * `platform` (default `'twitter'`) governs mention grammar (`splitMentionParts`)
 * and the resulting profile href (`mentionHref`) — it never affects URL/t.co
 * handling, which is platform-agnostic.
 */
export function buildRenderSegments(
  text: string,
  links: TextLinkRef[] | undefined,
  hideTweetLinks: boolean | undefined,
  platform: string = 'twitter',
): RenderSegment[] {
  const parts = splitTextParts(text)
  const raw: RenderSegment[] = []
  let stripped = false

  parts.forEach((part, i) => {
    if (part.type === 'text') {
      for (const sub of splitMentionParts(part.value, platform)) {
        if (sub.type === 'text') {
          raw.push({ type: 'text', value: sub.value })
        } else {
          raw.push({ type: 'mention', handle: sub.handle, href: mentionHref(platform, sub.handle) })
        }
      }
      return
    }
    const trailing = isTrailingLink(parts, i)
    const resolution = resolveLink(part.href, links, hideTweetLinks, trailing)
    if (resolution.kind === 'strip') {
      stripped = true
      if (resolution.tail) raw.push({ type: 'text', value: resolution.tail })
    } else {
      raw.push({ type: 'anchor', href: resolution.href, label: resolution.label })
      if (resolution.tail) raw.push({ type: 'text', value: resolution.tail })
    }
  })

  // Merge adjacent text segments (a strip can leave two text runs touching).
  const merged: RenderSegment[] = []
  for (const seg of raw) {
    const prev = merged[merged.length - 1]
    if (seg.type === 'text' && prev && prev.type === 'text') {
      prev.value += seg.value
    } else {
      merged.push(seg.type === 'text' ? { type: 'text', value: seg.value } : seg)
    }
  }

  if (!stripped) return merged

  // A stripped link can leave doubled spaces (`hello  world`) or a bare edge
  // (`hello ` / ` world`) behind — collapse/trim only what stripping caused.
  for (const seg of merged) {
    if (seg.type === 'text') seg.value = seg.value.replace(/[ \t]{2,}/g, ' ')
  }
  while (merged.length) {
    const first = merged[0]
    if (first.type !== 'text' || first.value.trim() !== '') break
    merged.shift()
  }
  while (merged.length) {
    const last = merged[merged.length - 1]
    if (last.type !== 'text' || last.value.trim() !== '') break
    merged.pop()
  }
  if (merged.length && merged[0].type === 'text') {
    merged[0].value = merged[0].value.replace(/^[ \t]+/, '')
  }
  if (merged.length && merged[merged.length - 1].type === 'text') {
    const last = merged[merged.length - 1]
    if (last.type === 'text') last.value = last.value.replace(/[ \t]+$/, '')
  }

  return merged
}

export interface TheaterLinkedTextProps {
  text: string
  /** Strip trailing media t.co links (pass true when the post has media). */
  hasMedia?: boolean
  className?: string
  /** Link styling override — defaults to clay-on-dark. */
  linkClassName?: string
  /**
   * Short-link expansions for URLs in the text (spec §6b — from
   * bookmark_links / FxTwitter urls). When a t.co matches, the anchor points
   * at the real destination and displays a cleaned form of it.
   */
  links?: TextLinkRef[]
  /**
   * The surface renders the referenced tweet content (a quote card), so
   * links resolving to twitter statuses are stripped — plus the trailing
   * unresolved t.co, as X clients do (spec §6b).
   */
  hideTweetLinks?: boolean
  /**
   * Source platform of the post, for `@mention` grammar + profile hrefs
   * (`splitMentionParts` / `mentionHref`). Defaults to `'twitter'`, which is
   * already correct for the dominant case — callers rendering non-twitter
   * posts should pass `platform={item.platform}`.
   */
  platform?: string
}

/**
 * Renders text with URLs as real anchors. Clicks on links stop propagation so
 * they never trigger the surrounding stage/rail tap handlers (unmute, play,
 * row select, swipe taps).
 *
 * Every text run is wrapped in a `<span>` rather than emitted as a bare text
 * node — DELIBERATE, don't "simplify" it away. Browser/extension page
 * translation rewrites text nodes into its own `<font>` wrappers; a bare text
 * node sitting between an `<a>` and a `<br />` is then gone from under React,
 * and the next update that removes it throws NotFoundError ("Failed to execute
 * 'removeChild' on 'Node'"), which killed the whole theater when advancing to
 * the next post. With each run inside an element, translation only ever mutates
 * that element's children, and React's removes/text-sets still target a node
 * that is really there. (`translate="no"` in the root layout stops the
 * built-in translators; this is what covers extensions, which ignore it.)
 */
export function TheaterLinkedText({
  text,
  hasMedia = false,
  className,
  linkClassName,
  links,
  hideTweetLinks,
  platform = 'twitter',
}: TheaterLinkedTextProps) {
  const cleaned = stripMediaUrls(decodeHtmlEntities(text), hasMedia)
  const segments = buildRenderSegments(cleaned, links, hideTweetLinks, platform)

  return (
    <span className={className}>
      {segments.map((segment, segIndex) => {
        if (segment.type === 'anchor' || (segment.type === 'mention' && segment.href)) {
          const href = segment.type === 'anchor' ? segment.href : (segment.href as string)
          const label = segment.type === 'anchor' ? segment.label : `@${segment.handle}`
          return (
            <a
              key={segIndex}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              className={cn(
                'break-all underline decoration-clay/50 underline-offset-2 transition-colors hover:decoration-clay',
                linkClassName ?? 'text-clay',
              )}
            >
              {label}
            </a>
          )
        }
        if (segment.type === 'mention') {
          // Unknown platform — no profile URL shape to link to; render plain.
          return <span key={segIndex}>{`@${segment.handle}`}</span>
        }
        const lines = segment.value.split('\n')
        return (
          <React.Fragment key={segIndex}>
            {lines.map((line, lineIndex) => (
              <React.Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                <span>{line}</span>
              </React.Fragment>
            ))}
          </React.Fragment>
        )
      })}
    </span>
  )
}
