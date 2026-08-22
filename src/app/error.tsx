'use client'

import { useEffect } from 'react'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import Link from 'next/link'

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
    <div className="min-h-screen bg-paper flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface border border-hairline mb-6">
          <TriangleAlert className="w-7 h-7 text-clay" />
        </div>

        <h1 className="font-serif text-[30px] sm:text-[38px] font-semibold tracking-tight text-ink mb-2">
          Something slipped
        </h1>
        <p className="text-[15px] text-ink-2 mb-8">
          An unexpected error occurred. Give it another try, or head back to your collection.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-full bg-clay-grad px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try again</span>
          </button>
          <Link
            href="/"
            className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-full border border-hairline bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-inset"
          >
            Back to your collection
          </Link>
        </div>

        {error.digest && <p className="text-xs text-ink-3 mt-6">Error ID: {error.digest}</p>}
      </div>
    </div>
  )
}
