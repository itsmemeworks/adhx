import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminClient } from './AdminClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin — ADHX',
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  const session = await getSession()
  if (!session) redirect('/')

  const gate = await requireAdmin(session.userId)
  if (!gate.ok) redirect('/settings')

  return <AdminClient />
}
