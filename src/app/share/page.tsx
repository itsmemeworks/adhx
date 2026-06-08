'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { parseShareUrl, extractSharedUrl } from '@/lib/utils/parse-share-url'

function ShareRedirect() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState(false)

  useEffect(() => {
    // Apps don't agree on which field carries the link: a clean share sets
    // `url`, but TikTok (and others) drop it into `text` alongside a caption.
    const shared = extractSharedUrl(
      searchParams.get('url'),
      searchParams.get('text'),
      searchParams.get('title'),
    )

    if (!shared) {
      router.replace('/')
      return
    }

    const parsed = parseShareUrl(shared)
    if (!parsed) {
      setError(true)
      return
    }

    // TikTok short links resolve via an /api route that 307s to the preview;
    // the client router can't follow a cross-route redirect, so do a real
    // navigation. App routes use the client router (no full reload).
    if (parsed.path.startsWith('/api/')) {
      window.location.replace(parsed.path)
    } else {
      router.replace(parsed.path)
    }
  }, [searchParams, router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-ink mb-3">Not a supported link</h1>
          <p className="text-ink-2 mb-6">
            The shared URL doesn&apos;t look like a post we can preview. Try an X, Instagram,
            TikTok, or YouTube link like x.com/user/status/123 or youtube.com/shorts/abc.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 text-white font-medium rounded-full bg-clay-grad shadow-glow transition-all hover:scale-105"
          >
            Go to ADHX
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="w-6 h-6 border-2 border-clay border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-paper">
          <div className="w-6 h-6 border-2 border-clay border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ShareRedirect />
    </Suspense>
  )
}
