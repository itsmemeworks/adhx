'use client'

import Link from 'next/link'
import { TrendingUp } from 'lucide-react'
import { MatterLogo, ConnectWithX } from '@/components/matter'
import { ThemeToggle } from '@/components/ThemeToggle'

/**
 * The shared signed-out top nav for the public surfaces (landing + /trending).
 *
 * One component so the two pages can't drift in height/spacing again (they were
 * hand-rolled separately before). "Trending" is visible on mobile too — it's an
 * icon on small screens (to fit) and the label on sm+ — so the hub is always
 * reachable from the header; "How it works" stays desktop-only.
 */
export function PublicNav({
  active,
  onConnect,
  connecting = false,
}: {
  /** Marks the current public surface so its nav item reads as active. */
  active?: 'trending'
  /** Connect-with-X handler (kicks off the OAuth flow). */
  onConnect: () => void
  connecting?: boolean
}) {
  return (
    <nav className="flex items-center border-b border-hairline px-5 py-4 sm:px-11">
      <Link href="/" aria-label="ADHX home">
        <MatterLogo size={20} />
      </Link>
      <div className="ml-auto flex items-center gap-4 sm:gap-6">
        <a
          href="/#how-it-works"
          className="hidden text-sm font-medium text-ink-2 transition-colors hover:text-ink sm:inline"
        >
          How it works
        </a>

        {active === 'trending' ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-clay">
            <TrendingUp className="h-[18px] w-[18px] sm:hidden" />
            <span className="hidden sm:inline">Trending</span>
          </span>
        ) : (
          <Link
            href="/trending"
            aria-label="Trending"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
          >
            <TrendingUp className="h-[18px] w-[18px] sm:hidden" />
            <span className="hidden sm:inline">Trending</span>
          </Link>
        )}

        <a
          href="https://github.com/itsmemeworks/adhx"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
          title="View source on GitHub"
          className="hidden text-ink-2 transition-colors hover:text-ink sm:inline-flex"
        >
          <GithubGlyph size={18} />
        </a>
        <ThemeToggle className="-mr-1 sm:mr-0" />
        <button
          onClick={onConnect}
          disabled={connecting}
          className="inline-flex items-center gap-2 rounded-[10px] bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <ConnectWithX size={14} />
        </button>
      </div>
    </nav>
  )
}

/** Inline GitHub mark — lucide's `Github` icon is deprecated, so we draw the glyph directly. */
function GithubGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 98 96" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
      />
    </svg>
  )
}
