import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { setSavePrivate } from '@/lib/bookmarks/privacy'

/**
 * PATCH /api/bookmarks/[id]/private { platform, private } → { private }
 *
 * "Just for me": a private save is still yours to search and play, but no one
 * else sees it, counts it or is told you saved it.
 */
export const PATCH = withAuth(
  async (request: NextRequest, userId, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params
      const body = (await request.json().catch(() => null)) as {
        platform?: unknown
        private?: unknown
      } | null
      if (!body || typeof body.private !== 'boolean') {
        return NextResponse.json({ error: 'Say whether it’s private.' }, { status: 400 })
      }
      const platform =
        typeof body.platform === 'string' && body.platform ? body.platform : 'twitter'
      const next = setSavePrivate(userId, platform, id, body.private)
      if (next === null) {
        return NextResponse.json({ error: 'That post isn’t in your saves.' }, { status: 404 })
      }
      return NextResponse.json({ private: next }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      return handleRouteError(error, {
        endpoint: '/api/bookmarks/[id]/private',
        userId,
        message: 'Couldn’t change that save. Try again.',
      })
    }
  },
)
