import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminClient } from './AdminClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin — ADHX',
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/')

  const gate = await requireAdmin(userId)
  if (!gate.ok) redirect('/settings')

  return <AdminClient />
}
