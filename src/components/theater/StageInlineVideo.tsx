'use client'

import { keptSrc } from '@/lib/keep/src'
/** Compact in-reader player — parent or quoted video, with native controls. */
export function StageInlineVideo({
  author,
  bookmarkId,
  poster,
  testId,
}: {
  author: string
  bookmarkId: string
  poster?: string | null
  testId?: string
}) {
  const src = keptSrc('twitter', bookmarkId, 'video-1', author)

  return (
    <video
      src={src}
      poster={poster ?? undefined}
      controls
      playsInline
      muted
      preload="metadata"
      data-testid={testId}
      className="mt-4 w-full rounded-xl bg-black"
    />
  )
}
