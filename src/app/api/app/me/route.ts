import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { badKey, withPhoneKey } from '@/lib/api/phone-auth'

/** GET /api/app/me — who this phone saves for. A 401 means it was removed. */
export const GET = withPhoneKey(async (_request, caller) => {
  const [user] = db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, caller.userId))
    .limit(1)
    .all()
  if (!user) return badKey()
  return NextResponse.json(
    { username: user.username, name: caller.name },
    { headers: { 'Cache-Control': 'no-store' } },
  )
})
