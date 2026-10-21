import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { keepAutoChannel } from '@/lib/channels/auto'

const SLUG = /^[a-z0-9-]{1,64}$/

/**
 * POST /api/channels/auto/{slug}/keep { isPublic?: boolean } — turn a
 * "Made for you" channel into a real channel (a tag on its posts). Public
 * unless `isPublic: false`, matching new channels made from the theater.
 */
export const POST = withAuth(
  async (request: NextRequest, userId, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params
    if (!SLUG.test(slug)) return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
    const body = (await request.json().catch(() => ({}))) as { isPublic?: unknown }
    const isPublic = body.isPublic !== false
    try {
      const kept = await keepAutoChannel(userId, slug, isPublic)
      if (!kept) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
      return NextResponse.json(kept)
    } catch (error) {
      return handleRouteError(error, {
        endpoint: '/api/channels/auto/keep',
        userId,
        message: 'Failed to keep channel',
      })
    }
  },
)
