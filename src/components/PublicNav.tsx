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
