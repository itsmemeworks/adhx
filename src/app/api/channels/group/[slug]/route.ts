import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { groupChannelKeys } from '@/lib/channels/group'
import { keysToHits } from '@/lib/channels/channels'
import { loadSearchItems } from '@/lib/semantic/items'

const SLUG = /^[a-z0-9-]{1,64}$/

/**
 * GET /api/channels/group/{slug} — a From everyone channel as a play queue:
 * its posts newest save first, each with its savers. Members only.
 */
export const GET = withAuth(
  async (_request: NextRequest, userId, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params
    if (!SLUG.test(slug)) return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
    try {
      const channel = await groupChannelKeys(slug)
      if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
      const items = await loadSearchItems(keysToHits(channel.keys), userId)
      const response = NextResponse.json({
        name: channel.name,
        items,
        total: items.length,
        understood: true,
        close: true,
        refined: false,
        nextOffset: null,
      })
      response.headers.set('Cache-Control', 'no-store')
      return response
    } catch (error) {
      return handleRouteError(error, {
        endpoint: '/api/channels/group',
        userId,
        message: 'Failed to load channel',
      })
    }
  },
)
