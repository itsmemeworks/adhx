import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserIdForUsername, resolveUsernameAlias } from '@/lib/users/lookup'
import { tagShares } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { listTaggedBookmarks, serializeSharedPosts } from '@/lib/tags/clone'

const responseHeaders = { 'Cache-Control': 'no-store' }

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
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: responseHeaders },
      )
    }

    const [share] = await db
      .select()
      .from(tagShares)
      .where(and(eq(tagShares.userId, ownerId), eq(tagShares.tag, tagName)))
      .limit(1)

    if (!share) {
      return NextResponse.json(
        { error: 'Tag not found' },
        { status: 404, headers: responseHeaders },
      )
    }
    if (!share.isPublic) {
      return NextResponse.json(
        { error: 'This tag is private' },
        { status: 403, headers: responseHeaders },
      )
    }

    const results = await listTaggedBookmarks(share.userId, tagName)
    if (!results) {
      return NextResponse.json(
        { error: 'Tag not found' },
        { status: 404, headers: responseHeaders },
      )
    }
    const tweets = serializeSharedPosts(results.bookmarks, results.media)

    return NextResponse.json(
      {
        tag: tagName,
        username,
        tweets,
        tweetCount: tweets.length,
      },
      { headers: responseHeaders },
    )
  } catch (error) {
    console.error('Error fetching shared tag:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tag' },
      { status: 500, headers: responseHeaders },
    )
  }
}
