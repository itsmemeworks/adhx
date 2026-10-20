import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth/session'
import { requireAdmin } from './guard'

/**
 * For a read that used to be public and now isn't: null when the caller is a
 * signed-in admin, else the 401/403 response to return. A private friends
 * server has no anonymous audience for its activity, trending or analytics.
 */
export async function adminOnlyResponse(): Promise<NextResponse | null> {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const gate = await requireAdmin(userId)
  return gate.ok ? null : gate.response
}
