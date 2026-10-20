'use client'

import type { MouseEvent, ReactNode } from 'react'

/** The phone menu: a <details> that closes again when one of its links is tapped. */
export function NavMenu({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const closeOnLink = (event: MouseEvent<HTMLElement>) => {
    if (!(event.target as HTMLElement).closest('a')) return
    event.currentTarget.closest('details')?.removeAttribute('open')
  }
  return (
    <details className="nx-menu relative md:hidden">
      {summary}
      <nav
        aria-label="Sections"
        onClick={closeOnLink}
        className="absolute right-0 top-[52px] flex w-56 flex-col rounded-[20px] border border-white/10 bg-nx-surface p-2 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
      >
        {children}
      </nav>
    </details>
  )
}
