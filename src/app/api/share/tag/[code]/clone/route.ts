import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { db } from '@/lib/db'
import { tagShares } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { cloneTagToUser } from '@/lib/tags/clone'

/** POST /api/share/tag/[code]/clone — legacy share-code clone. Pair-safe. */
export const POST = withAuth(
  async (_request, userId, { params }: { params: Promise<{ code: string }> }) => {
    try {
      const { code } = await params
      const [share] = await db
        .select()
        .from(tagShares)
        .where(eq(tagShares.shareCode, code))
        .limit(1)

      if (!share || !share.isPublic) {
        return NextResponse.json({ error: 'Tag not found or not public' }, { status: 404 })
      }

      const result = await cloneTagToUser({
        sourceUserId: share.userId,
        tagName: share.tag,
        currentUserId: userId,
      })

      if (!result.ok) {
        const status = result.status === 403 ? 404 : result.status
        return NextResponse.json({ error: result.error }, { status })
      }

      return NextResponse.json({
        cloned: result.clonedCount,
        skipped: result.skipped,
        total: result.total,
        tag: result.tag,
        clonedIds: result.clonedIds,
      })
    } catch (error) {
      console.error('Error cloning shared tag:', error)
      return NextResponse.json({ error: 'Failed to clone tag' }, { status: 500 })
    }
  },
)
