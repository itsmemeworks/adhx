'use client'

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
  const src = `/api/media/video?author=${encodeURIComponent(author)}&tweetId=${encodeURIComponent(bookmarkId)}&quality=hd`

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
