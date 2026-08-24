'use client'

import { use, useEffect } from 'react'
import type { SharedResolveResult } from '@/lib/theater/shared-resolve'

/**
 * Suspends until the preview-page resolve Promise settles, then hands the
 * result to TheaterShell. Wrapped in <Suspense> so chrome paints immediately.
 */
export function SharedResolveBridge({
  promise,
  onResult,
}: {
  promise: Promise<SharedResolveResult>
  onResult: (result: SharedResolveResult) => void
}) {
  const result = use(promise)
  useEffect(() => {
    onResult(result)
  }, [result, onResult])
  return null
}
