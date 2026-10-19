'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthMe } from '@/components/auth'
import { cn } from '@/lib/utils'
import { useDoing } from './useDoing'

/** How often the header asks; the /doing page itself asks every 3 s. */
const PILL_POLL_MS = 20_000

/**
 * "3 on their way" in the header, linking to /doing (What your ADHX is
 * doing). Shown only to members, and only while something is on its way.
 */
export function OnTheirWayPill({ className }: { className?: string }) {
  const { me, loading } = useAuthMe()
  const pathname = usePathname()
  const signedIn = !loading && !!me?.authenticated
  const here = pathname === '/doing'
  const { summary } = useDoing({
    everyMs: PILL_POLL_MS,
    summaryOnly: true,
    enabled: signedIn && !here,
  })
  const n = summary?.onTheirWay ?? 0
  if (!signedIn || here || n <= 0) return null
  const label = `${n} on ${n === 1 ? 'its' : 'their'} way`
  return (
    <Link
      href="/doing"
      aria-label={`${label}${summary?.needsYou ? `, ${summary.needsYou} need you` : ''}. See what your ADHX is doing`}
      className={cn(
        'flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/[0.08] bg-[#1a1814] px-1.5 text-sm font-semibold text-nx-cream sm:pl-2.5 sm:pr-4',
        className,
      )}
    >
      <span
        aria-hidden
        className="block h-[18px] w-[18px] shrink-0 animate-nx-spin rounded-full border-[2.5px] border-[#4a453e] border-t-nx-accent"
      />
      <span className="hidden sm:inline">{label}</span>
      {!!summary?.needsYou && (
        <span
          aria-hidden
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff5a3c] px-1.5 text-[11px] font-extrabold text-black"
        >
          {summary.needsYou}
        </span>
      )}
    </Link>
  )
}
