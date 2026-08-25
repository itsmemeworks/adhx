'use client'

/**
 * Keyboard + click-away for the theater playlist (desktop Show all, mobile
 * up-next sheet). Same overlay contract as the avatar menu: while open,
 * ↑/↓ move among queue rows, Enter plays the focused row, Escape / a click
 * outside closes. `Q` is left alone so the theater handler can toggle.
 */

import { useEffect, type RefObject } from 'react'
import { THEATER_SHORTCUT_KEYS, isTheaterTypingTarget } from './theater-shortcuts'

export const THEATER_QUEUE_ITEM_ATTR = 'data-theater-queue-item'
export const THEATER_QUEUE_SCROLL_ATTR = 'data-theater-queue-scroll'

export interface UseTheaterQueueOverlayArgs {
  open: boolean
  onClose: () => void
  containerRef: RefObject<HTMLElement | null>
  /**
   * Focus the current row when the playlist opens. Desktop Show all wants
   * this. The mobile bottom sheet must not: focusing a row that is still
   * mid-translate (or below the visual viewport) pans iOS so the sheet
   * jumps to the top of the screen — filters vanish, the stage reads as a
   * black void, and the open animation fights the scroll.
   */
  autoFocus?: boolean
}

function queueRows(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return [...root.querySelectorAll<HTMLElement>(`[${THEATER_QUEUE_ITEM_ATTR}]`)]
}

function focusRow(el: HTMLElement | undefined): void {
  if (!el) return
  // Never scrollIntoView — that walks ancestors and pans the visual
  // viewport. Keep keyboard focus; only nudge the list scroller itself.
  el.focus({ preventScroll: true })
  const scroller = el.closest<HTMLElement>(`[${THEATER_QUEUE_SCROLL_ATTR}]`)
  if (!scroller) return
  const row = el.getBoundingClientRect()
  const box = scroller.getBoundingClientRect()
  if (row.top < box.top) scroller.scrollTop -= box.top - row.top
  else if (row.bottom > box.bottom) scroller.scrollTop += row.bottom - box.bottom
}

function inQueueFilter(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('[data-theater-queue-filter]'))
}

export function useTheaterQueueOverlay({
  open,
  onClose,
  containerRef,
  autoFocus = true,
}: UseTheaterQueueOverlayArgs): void {
  useEffect(() => {
    if (!open) return

    const trigger = containerRef.current?.querySelector<HTMLElement>(
      '[data-theater-action="show-all"]',
    )
    const restore =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    if (autoFocus) {
      const rows = queueRows(containerRef.current)
      const current = rows.find((el) => el.getAttribute('aria-current') === 'true') ?? rows[0]
      focusRow(current)
    }

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    function focusAt(index: number, items: HTMLElement[]) {
      if (items.length === 0) return
      focusRow(items[(index + items.length) % items.length])
    }

    function handleKeyDownCapture(e: KeyboardEvent) {
      if (isTheaterTypingTarget(e.target)) return

      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        onClose()
        return
      }

      // `Q` toggles this overlay via the theater handler clicking the
      // trigger. `?` / `.` should still open help / the account menu — close
      // so they are not stacked under the playlist.
      if (e.key === 'q' || e.key === 'Q') return
      if (e.key === '.' || e.key === '?' || (e.key === '/' && e.shiftKey)) {
        onClose()
        return
      }

      // Filter pills are real buttons: Enter / Space must toggle them.
      // Arrows are eaten so they don't scroll the stage, but they do not
      // steal focus into the list while a pill is active.
      if (inQueueFilter(e.target)) {
        if (
          e.key === 'ArrowDown' ||
          e.key === 'ArrowUp' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight'
        ) {
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }

      const items = queueRows(containerRef.current)
      const currentIndex = items.findIndex((el) => el === document.activeElement)

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        focusAt(currentIndex >= 0 ? currentIndex + 1 : 0, items)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        focusAt(currentIndex >= 0 ? currentIndex - 1 : items.length - 1, items)
        return
      }
      if (e.key === 'Enter') {
        const item = currentIndex >= 0 ? items[currentIndex] : null
        if (item) {
          e.preventDefault()
          e.stopPropagation()
          item.click()
        }
        return
      }

      if (THEATER_SHORTCUT_KEYS.has(e.key)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDownCapture, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDownCapture, true)
      if (restore?.isConnected) restore.focus({ preventScroll: true })
    }
  }, [open, onClose, containerRef, autoFocus])
}
