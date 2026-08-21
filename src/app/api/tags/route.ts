import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUsernameForUserId } from '@/lib/users/lookup'
import { bookmarkTags, tagShares } from '@/lib/db/schema'
import { eq, sql, and } from 'drizzle-orm'
import { withAuth } from '@/lib/api/with-auth'
import { getOwnerCollectionStats } from '@/lib/discovery/rank'

// Username for friendly share URLs — users-table-first (email-only accounts
// have no oauth_tokens row; reading only that table 404'd their shares).
const getUsername = getUsernameForUserId

// Generate a short random code for sharing
function generateShareCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  const array = new Uint8Array(10)
  crypto.getRandomValues(array)
  for (let i = 0; i < 10; i++) {
    result += chars[array[i] % chars.length]
  }
  return result
}

// GET /api/tags - List all unique tags with bookmark counts and share info
export const GET = withAuth(async (_request, userId) => {
  // Get username for constructing friendly share URLs
  const username = await getUsername(userId)

  // Get all tags with counts for user's bookmarks
  const tags = await db
    .select({
      tag: bookmarkTags.tag,
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(bookmarkTags)
    .where(eq(bookmarkTags.userId, userId))
    .groupBy(bookmarkTags.tag)
    .orderBy(sql`COUNT(*) DESC`)

  // Get all tag shares for this user
  const shares = await db.select().from(tagShares).where(eq(tagShares.userId, userId))

  // Discovery view/save stats (docs/specs/discovery-leaderboards.md §6) —
  // one call for the whole page, week window. Private tags never accrue
  // events (recording is public-only, see `record.ts`), but we still gate
  // on `isPublic` explicitly here so a tag's stats disappear the moment it's
  // made private rather than lingering from before it was unshared.
  const collectionStats = getOwnerCollectionStats(userId)

  // Merge tags with share info, using friendly URLs
  const tagsWithShares = tags.map((t) => {
    const share = shares.find((s) => s.tag === t.tag)
    const isPublic = share?.isPublic ?? false
    const tagStats = isPublic ? collectionStats.byTag[t.tag] : undefined
    return {
      tag: t.tag,
      count: t.count,
      isPublic,
      // Friendly URL format: /t/{username}/{tag}
      shareUrl: share && username ? `/t/${username}/${t.tag}` : null,
      viewCount: tagStats?.viewCount ?? 0,
      cloneCount: tagStats?.cloneCount ?? 0,
      rank: tagStats?.rank ?? null,
    }
  })

  return NextResponse.json({
    tags: tagsWithShares,
    stats: {
      viewCount: collectionStats.totals.viewCount,
      cloneCount: collectionStats.totals.cloneCount,
      bestRank: collectionStats.totals.bestRank,
    },
  })
})

// PATCH /api/tags - Toggle public sharing for a tag
export const PATCH = withAuth(async (request, userId) => {
  const { tag, isPublic } = await request.json()
  if (!tag || typeof isPublic !== 'boolean') {
    return NextResponse.json({ error: 'Tag and isPublic are required' }, { status: 400 })
  }

  // Get username for constructing friendly share URL
  const username = await getUsername(userId)
  if (!username) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Check if share record exists
  const [existing] = await db
    .select()
    .from(tagShares)
    .where(and(eq(tagShares.userId, userId), eq(tagShares.tag, tag)))
    .limit(1)

  if (existing) {
    // Update existing share
    await db
      .update(tagShares)
      .set({ isPublic, updatedAt: new Date().toISOString() })
      .where(and(eq(tagShares.userId, userId), eq(tagShares.tag, tag)))
  } else {
    // Create new share record (shareCode still stored for backward compatibility)
    const shareCode = generateShareCode()
    await db.insert(tagShares).values({
      userId,
      tag,
      shareCode,
      isPublic,
      createdAt: new Date().toISOString(),
    })
  }

  // Return friendly URL format: /t/{username}/{tag}
  return NextResponse.json({ success: true, shareUrl: `/t/${username}/${tag}`, isPublic })
})

// DELETE /api/tags - Delete a tag from all bookmarks
export const DELETE = withAuth(async (request, userId) => {
  const { tag } = await request.json()
  if (!tag) {
    return NextResponse.json({ error: 'Tag is required' }, { status: 400 })
  }

  // Delete the tag from all user's bookmarks
  await db
    .delete(bookmarkTags)
    .where(and(eq(bookmarkTags.userId, userId), eq(bookmarkTags.tag, tag)))

  // Also delete any share settings for this tag
  await db.delete(tagShares).where(and(eq(tagShares.userId, userId), eq(tagShares.tag, tag)))

  return NextResponse.json({ success: true })
})
