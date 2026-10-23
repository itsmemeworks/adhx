'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

/** The admin sections, in the boards' order. */
export const ADMIN_SECTIONS = [
  { id: 'overview', href: '/admin', label: 'Overview' },
  { id: 'people', href: '/admin/people', label: 'People' },
  { id: 'posts', href: '/admin/posts', label: 'Posts' },
  { id: 'channels', href: '/admin/channels', label: 'Channels' },
  { id: 'live', href: '/admin/live', label: 'Live' },
  { id: 'analytics', href: '/admin/analytics', label: 'Analytics' },
  { id: 'processing', href: '/admin/processing', label: 'Processing' },
  { id: 'moderation', href: '/admin/moderation', label: 'Moderation' },
  { id: 'invites', href: '/admin/invites', label: 'Invites' },
] as const

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id']

const ICONS: Record<AdminSectionId, string> = {
  overview:
    '<rect x="3" y="3" width="7" height="9" rx="2"></rect><rect x="14" y="3" width="7" height="5" rx="2"></rect><rect x="14" y="12" width="7" height="9" rx="2"></rect><rect x="3" y="16" width="7" height="5" rx="2"></rect>',
  people:
    '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><path d="M16 4.5a3.5 3.5 0 0 1 0 7"></path><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"></path>',
  posts: '<rect x="3" y="4" width="18" height="16" rx="3"></rect><path d="M10 9l5 3-5 3z"></path>',
  channels: '<rect x="3" y="7" width="18" height="13" rx="3"></rect><path d="M8 3l4 4 4-4"></path>',
  live: '<circle cx="12" cy="12" r="2.5"></circle><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"></path>',
  processing:
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"></path>',
  moderation: '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"></path>',
  invites: '<path d="M4 6h16v12H4z"></path><path d="M4 7l8 6 8-6"></path>',
  analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path>',
}

export function AdminIcon({
  id,
  colour = 'currentColor',
  size = 18,
}: {
  id: AdminSectionId
  colour?: string
  size?: number
}) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={colour}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      dangerouslySetInnerHTML={{ __html: ICONS[id] }}
    />
  )
}

function current(pathname: string): AdminSectionId {
  if (pathname === '/admin' || pathname === '/admin/') return 'overview'
  const seg = pathname.split('/')[2]
  return (ADMIN_SECTIONS.find((s) => s.id === seg)?.id ?? 'overview') as AdminSectionId
}

/**
 * The admin sections: a column of links on wide screens, a row of chips that
 * scrolls sideways on phones. A yellow count says what needs you.
 */
export function AdminNav({ badges }: { badges: Partial<Record<AdminSectionId, number>> }) {
  const pathname = usePathname() ?? '/admin'
  const on = current(pathname)
  return (
    <nav
      aria-label="Admin sections"
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {ADMIN_SECTIONS.map((s) => {
        const active = s.id === on
        const badge = badges[s.id] ?? 0
        return (
          <Link
            key={s.id}
            href={s.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-[42px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 text-[15px]',
              active
                ? 'bg-nx-plate font-extrabold text-nx-ink'
                : 'font-semibold text-nx-ink-soft hover:bg-white/[0.05] hover:text-nx-ink',
              'max-lg:border max-lg:border-white/[0.08]',
            )}
          >
            <AdminIcon id={s.id} colour={active ? '#ffd23f' : 'currentColor'} />
            <span>{s.label}</span>
            {badge > 0 && (
              <span
                aria-label={`${badge} need you`}
                className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-nx-accent px-[7px] text-xs font-extrabold text-black lg:ml-auto"
              >
                <span aria-hidden>{badge}</span>
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
