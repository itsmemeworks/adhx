import type { ReactNode } from 'react'
import { NxHeader } from '../channels/ChannelParts'
import { AdminIcon, AdminNav, type AdminSectionId } from './AdminNav'

function uptimeLabel(seconds: number): string {
  const days = Math.floor(seconds / 86_400)
  if (days >= 1) return days === 1 ? 'up 1 day' : `up ${days} days`
  const hours = Math.floor(seconds / 3600)
  if (hours >= 1) return hours === 1 ? 'up 1 hour' : `up ${hours} hours`
  return 'up just now'
}

/** The yellow "Admin" chip in the header. */
export function AdminChip() {
  return (
    <span className="hidden h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-nx-accent/[0.14] px-3 text-[13px] font-extrabold text-nx-accent sm:inline-flex">
      <AdminIcon id="moderation" colour="#ffd23f" size={15} />
      <span>Admin</span>
    </span>
  )
}

/**
 * Every admin page: the app header with an Admin chip, then "Admin" and the
 * section list on the left (a chip row on phones) beside the section.
 */
export function AdminShell({
  badges,
  server,
  children,
}: {
  badges: Partial<Record<AdminSectionId, number>>
  server: { name: string; version: string; uptimeSeconds: number; healthy: boolean }
  children: ReactNode
}) {
  return (
    <div className="min-h-dvh bg-nx-ink font-nx-sans text-[#f4f1ea]">
      <NxHeader current={null}>
        <AdminChip />
      </NxHeader>
      <main className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)] gap-4 px-4 pb-24 pt-4 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-x-7 lg:px-8 lg:pb-6 lg:pt-5">
        <aside className="flex min-w-0 flex-col gap-3.5 lg:sticky lg:top-[92px] lg:h-[calc(100dvh-116px)]">
          <h1 className="m-0 mt-1 font-nx-serif text-[40px] font-normal leading-[0.95] lg:text-[52px]">
            Admin
          </h1>
          <AdminNav badges={badges} />
          <div className="mt-auto hidden flex-col gap-1.5 rounded-[18px] bg-[#1a1814] p-3.5 lg:flex">
            <span className="flex items-center gap-2 text-[13px] font-extrabold">
              <span
                aria-hidden
                className="block h-2 w-2 rounded-full"
                style={{ background: server.healthy ? '#7ddc8a' : '#ff8a7a' }}
              />
              <span>{server.name}</span>
            </span>
            <span className="text-xs text-[#a39b8b]">
              {`v${server.version} · ${uptimeLabel(server.uptimeSeconds)}`}
            </span>
          </div>
        </aside>
        <section className="flex min-w-0 flex-col gap-4 lg:min-h-[calc(100dvh-116px)]">
          {children}
        </section>
      </main>
    </div>
  )
}
