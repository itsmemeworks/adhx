'use client'

/**
 * Shared UI primitives repeated (byte-identical Tailwind classes) across the
 * theater's stage components. Pure extraction — same elements, same classes,
 * same event handlers at every call site; see the individual comments below
 * for exactly which occurrences each one replaces.
 */

import type { MouseEvent, ReactNode, TouchEvent } from 'react'
import { ArrowRight } from 'lucide-react'

/**
 * 44px icon-button chrome (dark scrim actions) — was repeated identically 4×
 * in TheaterMobileChrome.tsx (the triage "Open on {platform}" link, the Tag
 * button, the Share button, and the non-triage "Open on {platform}" link).
 * Renders an `<a>` when `href` is given, otherwise a `<button type="button">`
 * — the two link occurrences and two button occurrences differ only in that.
 * Named props (rather than extending the full HTML attribute types) since
 * only these are actually used across the 4 call sites.
 */
const STAGE_ICON_BUTTON_CLASS =
  'inline-flex min-h-[44px] min-w-[44px] flex-none items-center justify-center rounded-full border border-white/25 bg-white/[0.14] text-white'

export interface StageIconButtonProps {
  href?: string
  target?: string
  rel?: string
  onClick?: (e: MouseEvent<HTMLElement>) => void
  onTouchEnd?: (e: TouchEvent<HTMLElement>) => void
  'aria-label': string
  children: ReactNode
}

export function StageIconButton({
  href,
  target,
  rel,
  onClick,
  onTouchEnd,
  children,
  ...rest
}: StageIconButtonProps) {
  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        onClick={onClick}
        className={STAGE_ICON_BUTTON_CLASS}
        {...rest}
      >
        {children}
      </a>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onTouchEnd={onTouchEnd}
      className={STAGE_ICON_BUTTON_CLASS}
      {...rest}
    >
      {children}
    </button>
  )
}

/**
 * Stage headline — was repeated identically in Stage.tsx (StagePoster's
 * title), StageWaiting.tsx ("You're all caught up"), StageYouTube.tsx (the
 * no-videoId fallback's title), and TriageAllClear.tsx (the done-state
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
