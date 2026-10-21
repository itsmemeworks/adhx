'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { NxLogo } from '@/components/next/PrimaryNav'

/** Something broke while rendering a page. Full screen, in the new design. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Note: Server-side errors are captured by Sentry Node SDK before reaching this boundary.
    // Client-only React errors log here but aren't sent to Sentry (no @sentry/browser installed).
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black font-nx-sans text-white">
      <header className="px-4 py-3 md:px-7 md:py-[18px]">
        <NxLogo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-24 text-center">
        <h1 className="m-0 font-nx-serif text-[40px] font-normal leading-none md:text-[52px]">
          Something slipped
        </h1>
        <p className="m-0 max-w-[420px] text-[15px] text-white/70">
          That didn’t work. Give it another try, or head to Right now.
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">
          <button
            type="button"
            onClick={reset}
            className="flex h-12 items-center gap-2 rounded-full bg-nx-accent px-6 text-[15px] font-extrabold text-black"
          >
            <RefreshCw aria-hidden className="h-4 w-4" />
            <span>Try again</span>
          </button>
          <Link
            href="/now"
            className="flex h-12 items-center rounded-full border border-white/30 px-6 text-[15px] font-bold"
          >
            Right now
          </Link>
        </div>
        {error.digest && <p className="m-0 text-xs text-white/45">{`Error ID: ${error.digest}`}</p>}
      </main>
    </div>
  )
}
