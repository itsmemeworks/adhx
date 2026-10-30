import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { getCurrentUserId } from '@/lib/auth/session'
import { requireAdmin } from '@/lib/admin/guard'
import { waitingCount } from '@/lib/auth/approval'
import { serverInfo } from '@/lib/admin/boards/overview'
import { systemProblems } from '@/lib/admin/boards/system'
import { AdminShell } from '@/components/next/admin/AdminShell'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
}

function count(query: ReturnType<typeof sql>): number {
  try {
    return Number(db.all<{ n: number }>(query)[0]?.n) || 0
  } catch {
    return 0
  }
}

/**
 * /admin/*: admins only (the account's stored role, never its username).
 * Signed out → home; signed in but not an admin → Settings.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/')
  const gate = await requireAdmin(userId)
  if (!gate.ok) redirect('/settings')

  const now = Date.now()
  const badges = {
    people: waitingCount(now),
    processing: count(
      sql`SELECT COUNT(*) AS n FROM keep_jobs WHERE status = 'unavailable' AND accepted_at IS NULL`,
    ),
    system: await systemProblems(now),
    // People who joined by a link and wait to be let in (Invites → Waiting for
    // you); an open link needs nothing from you.
    invites: waitingCount(now),
  }
  return (
    <AdminShell badges={badges} server={serverInfo()}>
      {children}
    </AdminShell>
  )
}
