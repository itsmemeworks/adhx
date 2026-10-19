'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bookmark, LayoutGrid, Radio, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Gob } from './Gob'
import { useLogoBusy } from './logo-busy'
import { QuickSearch, openQuickSearch } from './QuickSearch'

/**
 * The four places in ADHX, the same on every screen: Right now (what people
 * are saving, live, and where Tune in starts), Channels, My saves and Search.
 * Desktop shows them as tabs in the header; phones get a bar along the bottom.
 */

export type NavId = 'now' | 'channels' | 'saves' | 'search'

export const NAV: { id: NavId; label: string; href: string }[] = [
  { id: 'now', label: 'Right now', href: '/now' },
  { id: 'channels', label: 'Channels', href: '/channels' },
  { id: 'saves', label: 'My saves', href: '/play?recent=1' },
  { id: 'search', label: 'Search', href: '/search' },
]

/** Which place a path belongs to (the theater says for itself, from its queue). */
export function navFor(pathname: string | null): NavId | null {
  if (!pathname) return null
  if (pathname === '/now' || pathname.startsWith('/moments/')) return 'now'
  if (pathname === '/channels' || pathname.startsWith('/t/')) return 'channels'
  if (pathname === '/search') return 'search'
  return null
}

function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block h-2 w-2 shrink-0 rounded-full bg-nx-accent animate-nx-live-pulse',
        className,
      )}
    />
  )
}

const ICON = { now: Radio, channels: LayoutGrid, saves: Bookmark, search: Search }

/** The adhx mark and name, linking home; first in every header. */
export function NxLogo({ className, busy = false }: { className?: string; busy?: boolean }) {
  const working = useLogoBusy()
  return (
    <Link
      href="/"
      aria-label="adhx home"
      className={cn('gob-host flex shrink-0 items-center gap-2.5', className)}
    >
      <Gob size={32} mood={busy || working ? 'busy' : 'idle'} />
      <span className="font-nx-serif text-2xl leading-none text-white">adhx</span>
    </Link>
  )
}

/**
 * Header tabs (desktop), right after the logo on every screen, theater
 * included. Search is left out where the header has its own search field.
 */
export function PrimaryNav({
  current,
  withSearch = false,
  className,
}: {
  current?: NavId | null
  withSearch?: boolean
  className?: string
}) {
  const pathname = usePathname()
  const active = current === undefined ? navFor(pathname) : current
  const items = withSearch ? NAV : NAV.filter((n) => n.id !== 'search')
  return (
    <nav
      aria-label="Main"
      className={cn(
        'hidden shrink-0 items-center gap-1 rounded-full bg-[#1c1b19] p-1 md:flex',
        className,
      )}
    >
      {items.map((n) => (
        <Link
          key={n.id}
          href={n.href}
          aria-current={active === n.id ? 'page' : undefined}
          className={cn(
            'flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-bold transition-colors',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-nx-accent',
            active === n.id ? 'bg-nx-cream text-black' : 'text-white/75 hover:text-white',
          )}
        >
          {n.id === 'now' && <LiveDot />}
          <span>{n.label}</span>
        </Link>
      ))}
    </nav>
  )
}

/**
 * The bar along the bottom on phones. The page keeps clear of it through
 * `body:has([data-nx-bottom-nav])` in globals.css, wherever this is rendered.
 * Every new-design page renders this once, so it also carries the search sheet.
 */
export function BottomNav({
  current,
  searchSheet = true,
}: {
  current?: NavId | null
  /** The Search page has its own field, so it leaves the sheet out. */
  searchSheet?: boolean
}) {
  const pathname = usePathname()
  const active = current === undefined ? navFor(pathname) : current
  return (
    <>
      <nav
        data-nx-bottom-nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/10 bg-black/90 pb-[env(safe-area-inset-bottom)] font-nx-sans backdrop-blur md:hidden"
      >
        {NAV.map((n) => {
          const Icon = ICON[n.id]
          const on = active === n.id
          return (
            <Link
              key={n.id}
              href={n.href}
              aria-current={on ? 'page' : undefined}
              onClick={
                n.id === 'search'
                  ? (e) => {
                      // Type straight away: focusing inside the tap brings up the keyboard.
                      e.preventDefault()
                      openQuickSearch()
                    }
                  : undefined
              }
              className={cn(
                'flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-bold',
                on ? 'text-nx-accent' : 'text-white/60',
              )}
            >
              <span className="relative">
                <Icon aria-hidden className="h-[22px] w-[22px]" strokeWidth={on ? 2.4 : 2} />
                {n.id === 'now' && <LiveDot className="absolute -right-1 -top-0.5 h-1.5 w-1.5" />}
              </span>
              <span>{n.label}</span>
            </Link>
          )
        })}
      </nav>
      {searchSheet && <QuickSearch />}
    </>
  )
}
