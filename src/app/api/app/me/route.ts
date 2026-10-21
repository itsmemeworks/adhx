import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { userPreferences, users } from '@/lib/db/schema'
import { badKey, withPhoneKey } from '@/lib/api/phone-auth'
import { memberAvatar } from '@/lib/people/savers'
import { avatarSourceOf } from '@/lib/preferences/server'

/**
 * GET /api/app/me — who this phone saves for. A 401 means it was removed.
 * `avatarUrl` is the picture your saves show (null for the generated icon),
 * so your own reactions carry the same face. `avatarSource` says where it
 * came from: `upload`, `gob`, `x` or `generated` (Settings shows the choice).
 */
export const GET = withPhoneKey(async (_request, caller) => {
  const [user] = db
    .select({
      username: users.username,
      avatarUrl: users.avatarUrl,
      avatarSource: userPreferences.value,
    })
    .from(users)
    .leftJoin(
      userPreferences,
      and(eq(userPreferences.userId, users.id), eq(userPreferences.key, 'avatarSource')),
    )
    .where(eq(users.id, caller.userId))
    .limit(1)
    .all()
  if (!user) return badKey()
  const avatarUrl = memberAvatar(user.avatarUrl, user.avatarSource)
  return NextResponse.json(
    {
      username: user.username,
      name: caller.name,
      avatarUrl,
      // No usable picture is the generated icon, whatever was stored.
      avatarSource: avatarUrl ? avatarSourceOf(user.avatarUrl, user.avatarSource) : 'generated',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
})
