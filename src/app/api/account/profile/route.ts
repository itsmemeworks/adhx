import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { withAuth } from '@/lib/api/with-auth'
import { cleanDisplayName } from '@/lib/people/display-name'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/account/profile { displayName } → { displayName }: the name your
 * people see on your saves. Empty (or null) shows your username instead.
 */
export const PATCH = withAuth(async (request: NextRequest, userId) => {
  const body = (await request.json().catch(() => null)) as { displayName?: unknown } | null
  const displayName = cleanDisplayName(body?.displayName)
  if (displayName === undefined) {
    return NextResponse.json({ error: 'Send a display name.' }, { status: 400 })
  }
  db.update(users).set({ displayName }).where(eq(users.id, userId)).run()
  return NextResponse.json({ displayName }, { headers: { 'Cache-Control': 'private, no-store' } })
})
