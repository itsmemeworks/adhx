import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tagShares } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { listTaggedBookmarks, serializeSharedPosts } from '@/lib/tags/clone'

const responseHeaders = { 'Cache-Control': 'no-store' }

/** GET /api/share/tag/[code] — public playlist by legacy share code. Pair-safe. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params
    const [share] = await db.select().from(tagShares).where(eq(tagShares.shareCode, code)).limit(1)

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

    const results = await listTaggedBookmarks(share.userId, share.tag)
    if (!results) {
      return NextResponse.json(
        { error: 'Tag not found' },
        { status: 404, headers: responseHeaders },
      )
    }
    const tweets = serializeSharedPosts(results.bookmarks, results.media)

    return NextResponse.json(
      {
        tag: share.tag,
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
