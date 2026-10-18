'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { parseShareUrl, extractSharedUrl } from '@/lib/utils/parse-share-url'
import { markPreviewOpenIntent } from '@/lib/theater/autosave-shared'
import Link from 'next/link'
import { AdhxLoader } from '@/components/next/loader'
import { NxLogo } from '@/components/next/PrimaryNav'

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

    if (searchParams.get('error') === 'unsupported') {
      setError(true)
      return
    }
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
    // navigation. App routes use the client router (no full reload). Stamp
    // share-intent so a signed-in viewer autosaves the lead; in-app
    // clicks never set this flag.
    markPreviewOpenIntent('share')
    if (parsed.path.startsWith('/api/')) {
      window.location.replace(parsed.path)
    } else {
      router.replace(parsed.path)
    }
  }, [searchParams, router])

  if (error) return <NotSupported />
  return <Grabbing />
}

/** While the shared link is worked out (a moment, usually). */
function Grabbing() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-black font-nx-sans text-white">
      <AdhxLoader label="Grabbing it…" />
    </div>
  )
}

function NotSupported() {
  return (
    <div className="flex min-h-dvh flex-col bg-black font-nx-sans text-white">
      <header className="px-4 py-3 md:px-7 md:py-[18px]">
        <NxLogo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-24 text-center">
        <h1 className="m-0 font-nx-serif text-[40px] font-normal leading-none md:text-[52px]">
          Not a supported link
        </h1>
        <p className="m-0 max-w-[460px] text-[15px] text-white/70">
          That doesn’t look like a link to one post. ADHX keeps posts from X, Instagram, TikTok,
          YouTube, Facebook, Reddit, LinkedIn, Vimeo, SoundCloud, Pinterest, Twitch, Threads, Imgur
          and Bluesky.
        </p>
        <Link
          href="/"
          className="flex h-12 items-center rounded-full bg-nx-accent px-6 text-[15px] font-extrabold text-black"
        >
          Go to ADHX
        </Link>
      </main>
    </div>
  )
}

export default function SharePage() {
  return (
    <Suspense fallback={<Grabbing />}>
      <ShareRedirect />
    </Suspense>
  )
}
