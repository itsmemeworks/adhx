import Link from 'next/link'
import type { ReactNode } from 'react'
import { MatterLogo } from '@/components/matter'

/**
 * Shared chrome for `/trending` and `/trending/archive`. Dark bar, brand
 * left, status chip, then the same underlined jumps as the live hub.
 */
export function TrendingListHeader({
  status,
  links,
}: {
  status: ReactNode
  links: Array<{ href: string; label: string }>
}) {
  return (
    <header className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-6">
      <Link href="/" aria-label="ADHX home">
        <MatterLogo size={19} surface="dark" />
      </Link>
      <span className="ml-2 inline-flex items-center gap-2">{status}</span>
      <span className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-[13px] font-semibold text-white/60 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white"
          >
            <span>{link.label}</span>
          </Link>
        ))}
      </span>
    </header>
  )
}
