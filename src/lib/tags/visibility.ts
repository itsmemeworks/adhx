import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tagShares } from '@/lib/db/schema'
import { getUsernameForUserId } from '@/lib/users/lookup'
import { invalidateTagCollectionCache } from '@/lib/tags/query'
import { recordAnalytic } from '@/lib/analytics/record'

/** Short random code (kept on share rows for old `/share/tag/{code}` links). */
function generateShareCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  const array = new Uint8Array(10)
  crypto.getRandomValues(array)
  for (let i = 0; i < 10; i++) result += chars[array[i] % chars.length]
  return result
}

/**
 * Make one of a user's tags (a channel) public or private. Returns its
 * friendly share path, or null when the user has no username yet.
 * Shared by `PATCH /api/tags` and "keep this channel".
 */
export async function setTagVisibility(
  userId: string,
  tag: string,
  isPublic: boolean,
): Promise<{ shareUrl: string } | null> {
  const username = await getUsernameForUserId(userId)
  if (!username) return null

  const [existing] = await db
    .select()
    .from(tagShares)
    .where(and(eq(tagShares.userId, userId), eq(tagShares.tag, tag)))
    .limit(1)

  if (existing) {
    // better-sqlite3 mutations must `.run()` — `await` alone does not write.
    db.update(tagShares)
      .set({ isPublic, updatedAt: new Date().toISOString() })
      .where(and(eq(tagShares.userId, userId), eq(tagShares.tag, tag)))
      .run()
  } else {
    db.insert(tagShares)
      .values({
        userId,
        tag,
        shareCode: generateShareCode(),
        isPublic,
        createdAt: new Date().toISOString(),
      })
      .run()
  }

  invalidateTagCollectionCache(username, tag)
  revalidatePath(`/t/${username}/${tag}`)
  revalidatePath(`/t/${username}`)
  recordAnalytic({
    name: isPublic ? 'playlist.publish' : 'playlist.unpublish',
    userId,
    tag,
    surface: 'playlist',
  })
  return { shareUrl: `/t/${username}/${tag}` }
}
