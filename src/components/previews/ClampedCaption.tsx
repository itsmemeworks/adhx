'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A caption/body paragraph that collapses to a few lines and offers a
 * Show more / Show less toggle **only when the text is actually clipped**.
 *
 * Why this exists: the preview cards used to gate the toggle on a character
 * count (`text.length > 180`) while the clamp itself was gated on "is there
 * media". Those two conditions disagree — a 179-character post with a blank
 * line wraps past three lines and got clipped with no way to expand it (and
 * the TikTok / Instagram / YouTube cards clamped with no toggle at all). No
 * character threshold can predict wrapping: it depends on viewport width,
 * font metrics, embedded newlines and long unbroken URLs.
 *
 * So we measure instead of guess — `scrollHeight > clientHeight` on the
 * clamped element is the ground truth, re-checked on resize and once webfonts
 * settle (a font swap re-wraps the text).
 *
 * The full text is always present in the DOM — clamping is purely visual — so
 * crawlers and the JSON API still see everything regardless of this state.
 */

/**
 * While collapsed, a blank line must not eat one of the three preview lines.
 *
 * `renderTextWithLinks` turns each newline into a real `<br>`, so a post with a
 * paragraph break renders `…</span><br><span></span><br><span>…`. Under a
 * 3-line clamp that empty line consumed a third of the budget and the second
 * paragraph vanished entirely, leaving a lone "…" — which is what the reported
 * post looked like. Suppressing the empty span and the `<br>` that follows it
 * collapses the double break to a single one, so the preview shows real text
 * instead of whitespace. Expanding restores `whitespace-pre-wrap` and the
 * original paragraph spacing.
 *
 * Harmless for the plain-string captions (Instagram/TikTok/YouTube): with no
 * `<br>` children there is nothing for these selectors to match.
 */
const COLLAPSE_BLANK_LINES = '[&_span:empty]:hidden [&_span:empty+br]:hidden'

interface ClampedCaptionProps {
  children: ReactNode
  /**
   * When false the text renders in full: no clamp, no toggle. Callers pass the
   * "is there media alongside this text" condition here, matching the previous
   * behaviour where text-only posts were never collapsed.
   */
  clamp?: boolean
  /** Classes always applied to the paragraph. */
  className?: string
  /** Clamp utility applied while collapsed. */
  clampClassName?: string
  /** Extra classes for the toggle button. */
  toggleClassName?: string
}

export function ClampedCaption({
  children,
  clamp = true,
  className,
  clampClassName = 'line-clamp-3',
  toggleClassName,
}: ClampedCaptionProps) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [isClipped, setIsClipped] = useState(false)

  // Only meaningful while collapsed: once expanded there's nothing to clip, so
  // we keep the last verdict (sticky) and the "Show less" affordance survives.
  const measure = useCallback(() => {
    const el = ref.current
    if (!el || !clamp || expanded) return
    setIsClipped(el.scrollHeight > el.clientHeight + 1)
  }, [clamp, expanded])

  useEffect(() => {
    if (!clamp) {
      setIsClipped(false)
      setExpanded(false)
      return
    }
    measure()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
    // `children` is a dep so swapping post text re-measures.
  }, [clamp, measure, children])

  // Webfonts land after first paint and change wrapping — re-measure once they do.
  useEffect(() => {
    if (!clamp) return
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    if (!fonts?.ready) return
    let cancelled = false
    fonts.ready
      .then(() => {
        if (!cancelled) measure()
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clamp, measure])

  const collapsed = clamp && !expanded

  return (
    <>
      <p
        ref={ref}
        className={cn(
          className,
          collapsed ? cn(clampClassName, COLLAPSE_BLANK_LINES) : 'whitespace-pre-wrap',
        )}
      >
        {children}
      </p>
      {clamp && isClipped && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn(
            'mt-1.5 text-[13px] font-semibold text-clay hover:opacity-80',
            toggleClassName,
          )}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  )
}
