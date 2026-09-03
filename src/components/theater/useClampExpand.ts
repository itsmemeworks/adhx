'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * Overflow measurement for the theater's 2-line caption. The caption becomes
 * the Read control when `overflowing` is true (or the post is a quote-on-media).
 *
 * Once a caption overflows for the current item, the flag stays true until
 * the item changes. Read unmounts the clamped line; a ResizeObserver then
 * fires at 0×0 and would otherwise drop Watch.
 */
export function useClampExpand(resetKey: string | null) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [overflowing, setOverflowing] = useState(false)
  const keyRef = useRef(resetKey)
  const ref = useCallback((el: HTMLElement | null) => {
    setNode(el)
  }, [])

  useLayoutEffect(() => {
    if (keyRef.current !== resetKey) {
      keyRef.current = resetKey
      setOverflowing(false)
    }
    if (!node) return

    const measure = () => {
      if (node.scrollHeight > node.clientHeight + 1) setOverflowing(true)
    }

    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    return () => ro.disconnect()
  }, [resetKey, node])

  return { ref, overflowing }
}

/** Test-only leftover name — expand preference is gone. */
export function resetClampExpandPreference() {}
