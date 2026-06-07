import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarkTags, bookmarks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { metrics } from '@/lib/sentry'
import { sanitizeTag } from '@/lib/utils/tag'
import { withAuth } from '@/lib/api/with-auth'

function getPlatform(request: NextRequest): string {
  return request.nextUrl.searchParams.get('platform') || 'twitter'
}

// GET /api/bookmarks/[id]/tags?platform=... - Get tags for a bookmark
export const GET = withAuth(
  async (request: NextRequest, userId, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    const platform = getPlatform(request)

    const [bookmark] = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(
        and(eq(bookmarks.userId, userId), eq(bookmarks.platform, platform), eq(bookmarks.id, id)),
      )
      .limit(1)

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    const tags = await db
      .select({ tag: bookmarkTags.tag })
      .from(bookmarkTags)
      .where(
        and(
          eq(bookmarkTags.userId, userId),
          eq(bookmarkTags.platform, platform),
          eq(bookmarkTags.bookmarkId, id),
        ),
      )

    return NextResponse.json({ tags: tags.map((t) => t.tag) })
  },
)

// POST /api/bookmarks/[id]/tags?platform=... - Add tag to bookmark
export const POST = withAuth(
  async (request: NextRequest, userId, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    const platform = getPlatform(request)
    const { tag } = await request.json()

    if (!tag || typeof tag !== 'string') {
      return NextResponse.json({ error: 'Tag is required' }, { status: 400 })
    }

    const cleanTag = sanitizeTag(tag)
    if (cleanTag.length === 0) {
      return NextResponse.json({ error: 'Tag cannot be empty' }, { status: 400 })
    }

    const [bookmark] = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(
        and(eq(bookmarks.userId, userId), eq(bookmarks.platform, platform), eq(bookmarks.id, id)),
      )
      .limit(1)

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    try {
      await db.insert(bookmarkTags).values({
        userId,
        platform,
        bookmarkId: id,
        tag: cleanTag,
      })

      const allTags = await db
        .select({ tag: bookmarkTags.tag })
        .from(bookmarkTags)
        .where(
          and(
            eq(bookmarkTags.userId, userId),
            eq(bookmarkTags.platform, platform),
            eq(bookmarkTags.bookmarkId, id),
          ),
        )

      metrics.bookmarkTagged(allTags.length)
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        return NextResponse.json({ success: true, tag: cleanTag })
      }
      throw error
    }

    return NextResponse.json({ success: true, tag: cleanTag })
  },
)

// DELETE /api/bookmarks/[id]/tags?platform=... - Remove tag from bookmark
export const DELETE = withAuth(
  async (request: NextRequest, userId, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    const platform = getPlatform(request)
    const { tag } = await request.json()

    if (!tag) {
      return NextResponse.json({ error: 'Tag is required' }, { status: 400 })
    }

    const [bookmark] = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(
        and(eq(bookmarks.userId, userId), eq(bookmarks.platform, platform), eq(bookmarks.id, id)),
      )
      .limit(1)

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    await db
      .delete(bookmarkTags)
      .where(
        and(
          eq(bookmarkTags.userId, userId),
          eq(bookmarkTags.platform, platform),
          eq(bookmarkTags.bookmarkId, id),
          eq(bookmarkTags.tag, tag),
        ),
      )

    return NextResponse.json({ success: true })
  },
)
