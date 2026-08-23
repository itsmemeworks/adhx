'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Session-scoped expand preference shared by every `useClampExpand` call site
 * (desktop chrome + mobile chrome, both always mounted at once). Once the user
 * explicitly expands or collapses a caption, later items default to that
 * choice instead of always collapsing — in-memory only (no sessionStorage) is
 * fine since it only needs to survive item changes, not reloads.
 */
let preferExpanded = false

/**
 * Clamped text + expand toggle, shared by the desktop stage chrome's caption
 * overlay and the mobile chrome's bottom-scrim caption. Detects overflow via
 * `scrollHeight` vs `clientHeight` on the ref'd (clamped) element — never a
 * character-count guess — and resets to the shared `preferExpanded`
 * preference whenever `resetKey` changes (the theater advancing to a new
 * item), not unconditionally to collapsed.
 */
export function useClampExpand(resetKey: string | null) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpandedState] = useState(preferExpanded)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    setExpandedState(preferExpanded)
  }, [resetKey])

  useLayoutEffect(() => {
    if (expanded) return
    const el = ref.current
    setOverflowing(!!el && el.scrollHeight > el.clientHeight + 1)
  }, [resetKey, expanded])

  const setExpanded = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setExpandedState((prev) => {
      const next = typeof value === 'function' ? (value as (prev: boolean) => boolean)(prev) : value
      preferExpanded = next
      return next
    })
  }, [])

  const toggle = useCallback(() => {
    setExpanded((v) => !v)
  }, [setExpanded])

  return { ref, expanded, setExpanded, toggle, overflowing }
}

/** Test-only: the sticky preference is module state shared by every hook. */
export function resetClampExpandPreference() {
  preferExpanded = false
}
