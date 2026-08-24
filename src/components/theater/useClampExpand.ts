'use client'

import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Overflow measurement for the theater's 2-line caption. Read appears when
 * `overflowing` is true (or the post is a quote-on-media). There is no
 * tap-to-expand — that path hid Read if a leftover expand preference was set.
 */
export function useClampExpand(resetKey: string | null) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      setOverflowing(el.scrollHeight > el.clientHeight + 1)
    }

    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [resetKey])

  return { ref, overflowing }
}

/** Test-only leftover name — expand preference is gone. */
export function resetClampExpandPreference() {}
