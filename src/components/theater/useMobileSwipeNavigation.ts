'use client'

import { useRef, type TouchEventHandler } from 'react'

export type MobileSwipeDirection = 'next' | 'prev'

interface SwipePoint {
  x: number
  y: number
  at: number
}

const MIN_SWIPE_DISTANCE = 56
const MIN_FLICK_DISTANCE = 34
const MAX_FLICK_MS = 260
const MAX_SWIPE_MS = 900
const VERTICAL_DOMINANCE = 1.2

export function resolveMobileSwipe(
  start: SwipePoint,
  end: SwipePoint,
): MobileSwipeDirection | null {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const distance = Math.abs(dy)
  const elapsed = Math.max(0, end.at - start.at)
  const isFlick = elapsed <= MAX_FLICK_MS && distance >= MIN_FLICK_DISTANCE

  if (elapsed > MAX_SWIPE_MS) return null
  if (distance < MIN_SWIPE_DISTANCE && !isFlick) return null
  if (distance < Math.abs(dx) * VERTICAL_DOMINANCE) return null

  return dy < 0 ? 'next' : 'prev'
}

interface ActiveSwipe extends SwipePoint {
  identifier: number
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'button, a, input, textarea, select, [role="button"], [contenteditable="true"], [data-theater-no-swipe]',
      ),
    )
  )
}

/**
 * Touch-only navigation for the mobile theater's right-side thumb zone.
 * Keeping this on a bounded surface preserves normal article scrolling,
 * album swipes, links, and iframe controls everywhere else on the stage.
 */
export function useMobileSwipeNavigation({
  disabled,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  disabled?: boolean
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
}) {
  const activeRef = useRef<ActiveSwipe | null>(null)

  const onTouchStart: TouchEventHandler<HTMLElement> = (event) => {
    if (disabled || event.touches.length !== 1 || isInteractiveTarget(event.target)) {
      activeRef.current = null
      return
    }
    const touch = event.touches[0]
    activeRef.current = {
      identifier: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      at: event.timeStamp,
    }
  }

  const onTouchMove: TouchEventHandler<HTMLElement> = (event) => {
    const start = activeRef.current
    if (!start) return
    const touch = Array.from(event.touches).find(
      (candidate) => candidate.identifier === start.identifier,
    )
    if (!touch) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * VERTICAL_DOMINANCE) {
      event.preventDefault()
    }
  }

  const onTouchEnd: TouchEventHandler<HTMLElement> = (event) => {
    const start = activeRef.current
    activeRef.current = null
    if (!start) return
    const touch = Array.from(event.changedTouches).find(
      (candidate) => candidate.identifier === start.identifier,
    )
    if (!touch) return

    const direction = resolveMobileSwipe(start, {
      x: touch.clientX,
      y: touch.clientY,
      at: event.timeStamp,
    })
    if (direction === 'next' && canNext) onNext()
    if (direction === 'prev' && canPrev) onPrev()
  }

  const onTouchCancel: TouchEventHandler<HTMLElement> = () => {
    activeRef.current = null
  }

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel }
}
