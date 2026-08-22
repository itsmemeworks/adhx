import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserIdForUsername, resolveUsernameAlias } from '@/lib/users/lookup'
import { tagShares } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { listTaggedBookmarks, serializeSharedPosts } from '@/lib/tags/clone'

/**
 * GET /api/share/tag/by-name/[username]/[tag]
 * Public access to a shared tag using friendly URL (username + tag name)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string; tag: string }> },
) {
  try {
    const { username: usernameParam, tag: tagName } = await params

    let ownerId = await getUserIdForUsername(usernameParam)
    let username = usernameParam
    if (!ownerId) {
      const alias = await resolveUsernameAlias(usernameParam)
      if (alias) {
        ownerId = alias.userId
        username = alias.username
      }
    }

    if (!ownerId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const [share] = await db
      .select()
      .from(tagShares)
      .where(and(eq(tagShares.userId, ownerId), eq(tagShares.tag, tagName)))
      .limit(1)

    if (!share) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }
    if (!share.isPublic) {
      return NextResponse.json({ error: 'This tag is private' }, { status: 403 })
    }

    const { bookmarks: bookmarkResults, media: mediaResults } = await listTaggedBookmarks(
      share.userId,
      tagName,
    )
    const tweets = serializeSharedPosts(bookmarkResults, mediaResults)

    return NextResponse.json({
      tag: tagName,
      username,
      tweets,
      tweetCount: tweets.length,
    })
  } catch (error) {
    console.error('Error fetching shared tag:', error)
    return NextResponse.json({ error: 'Failed to fetch tag' }, { status: 500 })
  }
}
