'use client'

/**
 * Clicks the matching `[data-theater-action]` control in the visible chrome.
 * Desktop and mobile both stay mounted (CSS-hidden), so each chrome passes
 * its surface and we no-op when that surface is not the live viewport.
 */

import { useEffect, type RefObject } from 'react'
import {
  THEATER_ACTION_ATTR,
  THEATER_ACTION_EVENTS,
  isTheaterHotkeySurface,
  type TheaterActionName,
  type TheaterHotkeySurface,
} from './theater-shortcuts'

function clickAction(root: HTMLElement | null, name: TheaterActionName): void {
  if (!root) return
  const el = root.querySelector<HTMLElement>(`[data-theater-action="${THEATER_ACTION_ATTR[name]}"]`)
  if (!el || (el instanceof HTMLButtonElement && el.disabled)) return
  el.click()
}

export function useTheaterActionHotkeys(
  surface: TheaterHotkeySurface,
  rootRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const entries = Object.entries(THEATER_ACTION_EVENTS) as [TheaterActionName, string][]
    const listeners = entries.map(([name, event]) => {
      const handler = () => {
        if (!isTheaterHotkeySurface(surface)) return
        clickAction(rootRef.current, name)
      }
      window.addEventListener(event, handler)
      return () => window.removeEventListener(event, handler)
    })
    return () => {
      for (const off of listeners) off()
    }
  }, [surface, rootRef])
}
