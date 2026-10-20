import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { groupChannelKeys } from '@/lib/channels/group'
import { keysToHits } from '@/lib/channels/channels'
import { loadSearchItems } from '@/lib/semantic/items'
import { newKeysFor } from '@/lib/feed/views'
import { keptGroupChannel } from '@/lib/channels/group-keep'

const SLUG = /^[a-z0-9-]{1,64}$/

/**
 * GET /api/channels/group/{slug} — a From everyone channel as a play queue:
 * its posts newest save first, each with its savers and `isNew` (you
 * haven't saved or seen it, from `post_views`). Members only. `kept` is
 * `{ tag, url }` once you've kept it as one of your channels, else null.
 */
export const GET = withAuth(
  async (_request: NextRequest, userId, { params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params
    if (!SLUG.test(slug)) return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
    try {
      const channel = await groupChannelKeys(slug)
      if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
      const loaded = await loadSearchItems(keysToHits(channel.keys), userId)
      const fresh = newKeysFor(
        userId,
        loaded.map((i) => `${i.post.platform}:${i.post.id}`),
      )
      const items = loaded.map((i) => ({
        ...i,
        isNew: fresh.has(`${i.post.platform}:${i.post.id}`),
      }))
      const kept = await keptGroupChannel(userId, { name: channel.name, slug })
      const response = NextResponse.json({
        name: channel.name,
        kept,
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
