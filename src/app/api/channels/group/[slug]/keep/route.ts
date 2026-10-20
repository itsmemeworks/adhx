import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { keepGroupChannel } from '@/lib/channels/group-keep'

const SLUG = /^[a-z0-9-]{1,64}$/

/**
 * POST /api/channels/group/{slug}/keep — "Keep this channel" on a From
 * everyone channel → `{ tag, url, added }`: its visible posts go into one of
 * your channels named after it (posts you haven't saved are saved for you
 * first, not private; posts at 5 tags are skipped). Not made public.
 */
export const POST = withAuth(
  async (_request: NextRequest, userId, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params
    if (!SLUG.test(slug)) {
      return NextResponse.json({ error: 'Invalid channel', code: 'not_found' }, { status: 404 })
    }
    try {
      const kept = await keepGroupChannel(userId, slug)
      if (!kept) {
        return NextResponse.json({ error: 'Channel not found', code: 'not_found' }, { status: 404 })
      }
      return NextResponse.json(kept, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      return handleRouteError(error, {
        endpoint: '/api/channels/group/keep',
        userId,
        message: 'Failed to keep channel',
      })
    }
  },
)
