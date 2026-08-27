import Link from 'next/link'
import { Compass, Flame } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface border border-hairline mb-6">
          <Compass className="w-7 h-7 text-ink-3" />
        </div>

        <h1 className="font-serif text-[30px] sm:text-[38px] font-semibold tracking-tight text-ink mb-2">
          Nothing saved here
        </h1>
        <p className="text-[15px] text-ink-2 mb-8">
          This page doesn&rsquo;t exist, or it wandered off. Save it. Lose it. Find it. &mdash; just
          not at this URL.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-full bg-clay-grad px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90"
          >
            Back to Saved
          </Link>
          <Link
            href="/trending"
            className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-full border border-hairline bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-inset"
          >
            <Flame className="w-4 h-4 text-flame" />
            <span>See what&rsquo;s trending</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
