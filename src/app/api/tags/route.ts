import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarkTags, tagShares, oauthTokens } from '@/lib/db/schema'
import { eq, sql, and } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'

// Get username for a user (for constructing friendly share URLs)
async function getUsername(userId: string): Promise<string | null> {
  const [token] = await db
    .select({ username: oauthTokens.username })
    .from(oauthTokens)
    .where(eq(oauthTokens.userId, userId))
    .limit(1)
  return token?.username ?? null
}

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
export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
  const shares = await db
    .select()
    .from(tagShares)
    .where(eq(tagShares.userId, userId))

  // Merge tags with share info, using friendly URLs
  const tagsWithShares = tags.map((t) => {
    const share = shares.find((s) => s.tag === t.tag)
    return {
      tag: t.tag,
      count: t.count,
      isPublic: share?.isPublic ?? false,
      // Friendly URL format: /t/{username}/{tag}
      shareUrl: share && username ? `/t/${username}/${t.tag}` : null,
    }
  })

  return NextResponse.json({ tags: tagsWithShares })
}

// PATCH /api/tags - Toggle public sharing for a tag
export async function PATCH(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
}

// DELETE /api/tags - Delete a tag from all bookmarks
export async function DELETE(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tag } = await request.json()
  if (!tag) {
    return NextResponse.json({ error: 'Tag is required' }, { status: 400 })
  }

  // Delete the tag from all user's bookmarks
  await db.delete(bookmarkTags).where(
    and(
      eq(bookmarkTags.userId, userId),
      eq(bookmarkTags.tag, tag)
    )
  )

  // Also delete any share settings for this tag
  await db.delete(tagShares).where(
    and(
      eq(tagShares.userId, userId),
      eq(tagShares.tag, tag)
    )
  )

  return NextResponse.json({ success: true })
}
