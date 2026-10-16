import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth/session'
import { handleRouteError } from '@/lib/api/response'
import { publicReadRateLimit } from '@/lib/rate-limit'
import { channelQueue } from '@/lib/channels/channels'

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

/**
 * GET /api/channels/by/{username}/{tag} — a channel as a play queue. Public
 * channels for anyone (signed in or not); owners also get their private
 * ones. Same visibility gate as `/t/{username}/{tag}`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string; tag: string }> },
) {
  const limited = publicReadRateLimit(request)
  if (limited) return noStore(limited)
  const { username, tag } = await params
  try {
    const viewer = await getCurrentUserId()
    const result = await channelQueue(decodeURIComponent(username), decodeURIComponent(tag), viewer)
    if (result.status !== 'ok') {
      return noStore(NextResponse.json({ error: 'Channel not found' }, { status: 404 }))
    }
    return noStore(
      NextResponse.json({
        channel: {
          username: result.username,
          tag: result.tag,
          count: result.count,
          isPublic: result.isPublic,
          mine: result.mine,
        },
        items: result.items,
        total: result.items.length,
        understood: true,
        close: true,
        refined: false,
        nextOffset: null,
      }),
    )
  } catch (error) {
    return noStore(
      handleRouteError(error, { endpoint: '/api/channels/by', message: 'Failed to load channel' }),
    )
  }
}
