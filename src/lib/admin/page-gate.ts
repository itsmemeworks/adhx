import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/session'
import { requireAdmin, type AdminActor } from './guard'

/**
 * Every admin page checks again (layouts aren't re-run on every
 * navigation): signed out → home, not an admin → Settings.
 */
export async function adminPageActor(): Promise<AdminActor> {
  const userId = await getCurrentUserId()
  if (!userId) redirect('/')
  const gate = await requireAdmin(userId)
  if (!gate.ok) redirect('/settings')
  return gate.actor
}

export type AdminSearchParams = Promise<Record<string, string | string[] | undefined>>

export async function rangeParam(searchParams: AdminSearchParams | undefined): Promise<unknown> {
  const params = searchParams ? await searchParams : {}
  const raw = params.range
  return Array.isArray(raw) ? raw[0] : raw
}
