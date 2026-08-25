'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import { STAGE_ALBUM_DOTS } from './stage-primitives'

/** Inset from the painted bottom of the clip so the pill sits on the picture. */
export const ALBUM_DOTS_PAD_PX = 12

/**
 * Shared album chrome for multi-photo and multi-video tweets: frost pill
 * with dots (tap advances, wraps), plus a snap-x scroller (tap-thirds / swipe).
 */

export function nextAlbumIndex(index: number, count: number): number {
  if (count < 2) return 0
  return index >= count - 1 ? 0 : index + 1
}

/** Left / right third → prev / next (no wrap). Center → null (caller owns tap). */
export function albumIndexFromTap(
  clientX: number,
  left: number,
  width: number,
  index: number,
  count: number,
): number | null {
  if (count < 2 || !width) return null
  const x = (clientX - left) / width
  if (x > 0.66) return Math.min(count - 1, index + 1)
  if (x < 0.33) return Math.max(0, index - 1)
  return null
}

/** Horizontal snap album — photos put images in the slides; videos put posters. */
export function StageAlbumScroller({
  count,
  index,
  onIndexChange,
  onCenterTap,
  label,
  overlay,
  children,
}: {
  count: number
  index: number
  onIndexChange: (index: number) => void
  onCenterTap: () => void
  label: string
  /** Sit on top of a playing video (transparent current slide). */
  overlay?: boolean
  children: ReactNode
}): React.ReactElement {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const scrolledRef = useRef(false)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el?.clientWidth) return
    const expected = index * el.clientWidth
    if (Math.abs(el.scrollLeft - expected) > 2) {
      el.scrollTo({ left: expected, behavior: 'auto' })
    }
  }, [index])

  function goTo(i: number) {
    const el = scrollerRef.current
    const next = Math.max(0, Math.min(count - 1, i))
    if (el?.scrollTo) el.scrollTo({ left: next * el.clientWidth, behavior: 'auto' })
    onIndexChange(next)
  }

  return (
    <div
      ref={scrollerRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onPointerDown={() => {
        scrolledRef.current = false
      }}
      onScroll={(e) => {
        const el = e.currentTarget
        scrolledRef.current = true
        if (!el.clientWidth) return
        const next = Math.round(el.scrollLeft / el.clientWidth)
        onIndexChange(Math.max(0, Math.min(count - 1, next)))
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (scrolledRef.current) return
        const rect = e.currentTarget.getBoundingClientRect()
        const next = albumIndexFromTap(e.clientX, rect.left, rect.width, index, count)
        if (next != null && next !== index) goTo(next)
        else onCenterTap()
      }}
      className={cn(
        'flex h-full w-full snap-x snap-mandatory touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain [&::-webkit-scrollbar]:hidden',
        overlay && 'absolute inset-0 z-[1]',
      )}
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      {children}
    </div>
  )
}

function intrinsicSize(el: Element): { w: number; h: number } {
  if (el instanceof HTMLVideoElement) return { w: el.videoWidth, h: el.videoHeight }
  if (el instanceof HTMLImageElement) return { w: el.naturalWidth, h: el.naturalHeight }
  return { w: 0, h: 0 }
}

/**
 * Distance from the positioned parent’s bottom to the pill’s bottom so the
 * pill overlays the object-contain picture (not letterbox / chrome).
 */
export function objectContainBottomPx({
  parentBottom,
  mediaBottom,
  mediaWidth,
  mediaHeight,
  intrinsicWidth,
  intrinsicHeight,
  padPx = ALBUM_DOTS_PAD_PX,
  previousPx,
}: {
  parentBottom: number
  mediaBottom: number
  mediaWidth: number
  mediaHeight: number
  intrinsicWidth: number
  intrinsicHeight: number
  padPx?: number
  /** Keep the last inset while the next clip’s size is still 0 (src swap). */
  previousPx?: number
}): number {
  if (!intrinsicWidth || !intrinsicHeight || !mediaWidth || !mediaHeight) {
    return previousPx ?? padPx
  }
  const ar = intrinsicWidth / intrinsicHeight
  const elAr = mediaWidth / mediaHeight
  const letterboxY = ar > elAr ? (mediaHeight - mediaWidth / ar) / 2 : 0
  const contentBottom = mediaBottom - letterboxY
  return Math.max(padPx, parentBottom - contentBottom + padPx)
}

function useObjectContainBottomPx(
  mediaRef: RefObject<HTMLElement | null> | undefined,
  hostRef: RefObject<HTMLElement | null>,
  revision: string | number | undefined,
): number {
  const [px, setPx] = useState(ALBUM_DOTS_PAD_PX)
  const pxRef = useRef(ALBUM_DOTS_PAD_PX)

  useLayoutEffect(() => {
    const media = mediaRef?.current
    const host = hostRef.current
    const parent = (host?.offsetParent as HTMLElement | null) ?? host?.parentElement
    if (!media || !parent) return

    const update = () => {
      const mr = media.getBoundingClientRect()
      const pr = parent.getBoundingClientRect()
      const { w, h } = intrinsicSize(media)
      const next = objectContainBottomPx({
        parentBottom: pr.bottom,
        mediaBottom: mr.bottom,
        mediaWidth: mr.width,
        mediaHeight: mr.height,
        intrinsicWidth: w,
        intrinsicHeight: h,
        previousPx: pxRef.current,
      })
      pxRef.current = next
      setPx(next)
    }

    update()
    media.addEventListener('loadedmetadata', update)
    media.addEventListener('loadeddata', update)
    media.addEventListener('load', update)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    ro?.observe(media)
    ro?.observe(parent)
    window.addEventListener('resize', update)
    return () => {
      media.removeEventListener('loadedmetadata', update)
      media.removeEventListener('loadeddata', update)
      media.removeEventListener('load', update)
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [mediaRef, hostRef, revision])

  return px
}

export function StageAlbumDots({
  count,
  index,
  onNext,
  noun,
  mediaRef,
  revision,
}: {
  count: number
  index: number
  onNext: () => void
  noun: 'photo' | 'video'
  /** Playing <video> or the current album <img> — used to hug the picture. */
  mediaRef?: RefObject<HTMLElement | null>
  /** Re-measure when the clip changes (src / album index). */
  revision?: string | number
}): React.ReactElement | null {
  const hostRef = useRef<HTMLDivElement>(null)
  const bottomPx = useObjectContainBottomPx(mediaRef, hostRef, revision)
  if (count < 2) return null
  return (
    <div ref={hostRef} className={STAGE_ALBUM_DOTS} style={{ bottom: bottomPx }}>
      <button
        type="button"
        aria-label={`Next ${noun}, ${index + 1} of ${count}`}
        onPointerDown={(e) => {
          e.stopPropagation()
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            /* jsdom / detached pointer */
          }
        }}
        onClick={(e) => {
          e.stopPropagation()
          onNext()
        }}
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/20 bg-black/40 px-2.5 py-1.5 backdrop-blur-md"
      >
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              'rounded-full',
              i === index ? 'h-1.5 w-1.5 bg-white' : 'h-1.5 w-1.5 bg-white/40',
            )}
          />
        ))}
      </button>
    </div>
  )
}
