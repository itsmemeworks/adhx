'use client'

/**
 * Shared UI primitives repeated (byte-identical Tailwind classes) across the
 * theater's stage components. Pure extraction — same elements, same classes,
 * same event handlers at every call site; see the individual comments below
 * for exactly which occurrences each one replaces.
 */

import type { MouseEvent, ReactNode, TouchEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { PlatformChip } from '@/components/matter'
import { authorProfileUrl } from '@/lib/activity/preview-path'
import { PLATFORM_LABEL, type TheaterItem } from './types'
import { StageGlass } from './StageGlass'

/**
 * Bottom padding on scrollable text/article stages so the last lines can
 * sit above the overlay action row. Mobile also clears the peek bar
 * (`PEEK_H` 4.25rem in TheaterMobileChrome) + the 0.75rem scrim gap +
 * the 44px action pills + a little air. Desktop only needs the action
 * pills (`absolute bottom-6`).
 */
export const STAGE_TEXT_SCROLL_PAD = 'pb-[calc(4.25rem+0.75rem+44px+1.25rem)] lg:pb-24'

/**
 * Top padding on the typeset tweet column so the author row clears the
 * theater chrome (desktop brand + paste/avatar cluster; mobile top scrim).
 * Short posts still vertically center — this pad is inside that block.
 */
export const STAGE_TEXT_TOP_PAD = 'pt-24 lg:pt-28'

/**
 * When Read keeps the parent video playing, the player sits in this top
 * band. Never mask, fade, or blur the clip — the fade lives *under* it.
 */
export const STAGE_ARTICLE_VIDEO_BAND =
  'absolute inset-x-0 top-0 z-20 h-[38dvh] overflow-hidden lg:h-[42vh]'
export const STAGE_ARTICLE_TEXT_PANE = 'absolute inset-0 z-10'
/** First line sits below the fade so Read opens at full contrast. */
export const STAGE_ARTICLE_UNDER_BAND_PAD = 'pt-[calc(38dvh+3.25rem)] lg:pt-[calc(42vh+3.25rem)]'

/**
 * Stage-black gradient in the strip *below* the video (never overlapping
 * it). Text scrolling through this zone fades out before it tucks under
 * the clip. Sibling of the band — the band's overflow would clip it.
 */
export function StageArticleVideoFade() {
  return (
    <div
      aria-hidden
      data-testid="article-video-fade"
      className="pointer-events-none absolute inset-x-0 top-[38dvh] z-[25] h-12 bg-gradient-to-b from-[#08070a] to-transparent lg:top-[42vh]"
    />
  )
}

/**
 * 44px icon-button chrome (dark scrim actions) — was repeated identically 4×
 * in TheaterMobileChrome.tsx (the collection "Open on {platform}" link, the Tag
 * button, the Share button, and the non-collection "Open on {platform}" link).
 * Renders an `<a>` when `href` is given, otherwise a `<button type="button">`
 * — the two link occurrences and two button occurrences differ only in that.
 * Named props (rather than extending the full HTML attribute types) since
 * only these are actually used across the 4 call sites.
 */
const STAGE_ICON_BUTTON_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] flex-none items-center justify-center rounded-full border border-white/25 text-white disabled:opacity-70'

export interface StageIconButtonProps {
  href?: string
  target?: string
  rel?: string
  title?: string
  disabled?: boolean
  className?: string
  onClick?: (e: MouseEvent<HTMLElement>) => void
  onTouchEnd?: (e: TouchEvent<HTMLElement>) => void
  'aria-label': string
  children: ReactNode
}

export function StageIconButton({
  href,
  target,
  rel,
  title,
  disabled,
  className,
  onClick,
  onTouchEnd,
  children,
  ...rest
}: StageIconButtonProps) {
  const cls = cn(STAGE_ICON_BUTTON_CLASS, className)
  if (href) {
    return (
      <StageGlass
        as="a"
        href={href}
        target={target}
        rel={rel}
        title={title}
        onClick={onClick}
        className={cls}
        {...rest}
      >
        {children}
      </StageGlass>
    )
  }
  return (
    <StageGlass
      as="button"
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      onTouchEnd={onTouchEnd}
      className={cls}
      {...rest}
    >
      {children}
    </StageGlass>
  )
}

/**
 * Stage headline — was repeated identically in Stage.tsx (StagePoster's
 * title), StageWaiting.tsx ("You're all caught up"), StageYouTube.tsx (the
 * no-videoId fallback's title), and CollectionAllClear.tsx (the done-state
 * title). Always an `<h2>` with this exact class string.
 */
export function StageHeadline({ children }: { children: ReactNode }) {
  return <h2 className="font-serif text-2xl leading-tight text-white sm:text-3xl">{children}</h2>
}

/**
 * "Open preview" clay-grad CTA pill — was repeated identically in Stage.tsx
 * (StagePoster), StageArticle.tsx (fetch-failure fallback), and
 * StageYouTube.tsx (the no-videoId fallback). All three call sites use the
 * same "Open preview" label + trailing ArrowRight, so both are baked in
 * here rather than passed as children.
 *
 * NOTE: StageInstagram.tsx has a near-identical CTA but with an extra
 * `flex-none` class — deliberately left unextracted (not byte-identical).
 */
export function StageCTA({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-clay-grad px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90"
    >
      Open preview
      <ArrowRight size={15} />
    </a>
  )
}

/**
 * Stage background wrapper — was repeated identically in Stage.tsx
 * (StagePoster), StageInstagram.tsx (the probing-phase branch, NOT the
 * `failed` branch — that one is missing `overflow-hidden` and is left
 * unextracted), and StageYouTube.tsx (the no-videoId fallback).
 */
export function StageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#08070a]">
      {children}
    </div>
  )
}

/**
 * Tweet-style author row on text/quote/article stages — avatar + name +
 * `@handle` + platform chip. Links to the creator's profile on their own
 * platform (same `authorProfileUrl` the media chrome uses). Plain row when
 * there's no handle.
 */
export function StageAuthorRow({ item }: { item: TheaterItem }) {
  const handle = (item.author || '').replace(/^@+/, '').trim()
  const profileUrl = authorProfileUrl(item.platform, item.author ?? '')
  const authorName = item.authorName || (handle ? `@${handle}` : 'Saved post')
  const inner = (
    <>
      <AuthorAvatar src={item.authorAvatarUrl ?? undefined} author={item.author ?? ''} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-bold text-white">{authorName}</div>
        {handle ? <div className="truncate font-mono text-sm text-white/50">@{handle}</div> : null}
      </div>
    </>
  )
  return (
    <div className="mb-6 flex items-center gap-3">
      {profileUrl ? (
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-85"
          title={`View @${handle} on ${PLATFORM_LABEL[item.platform] ?? item.platform}`}
        >
          {inner}
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{inner}</div>
      )}
      <PlatformChip platform={item.platform} />
    </div>
  )
}
