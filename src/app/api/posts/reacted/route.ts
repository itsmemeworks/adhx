import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { pageParams, reactedPosts } from '@/lib/reactions/reacted'
import { captureException } from '@/lib/sentry'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * GET /api/posts/reacted?offset=&limit= — the reactions feed for the web
 * (`/play?reacted=1`, the Reactions row on /channels): posts you can see with
 * at least one reaction you can see, newest reaction first, as a play queue
 * (`{ name, items, total, nextOffset }`, each item a search item plus
 * `reactions: { count, last }`). Same rules as `GET /api/app/reacted`.
 */
export const GET = withAuth(async (request: NextRequest, userId) => {
  const { offset, limit } = pageParams(request.nextUrl.searchParams)
  try {
    const page = await reactedPosts(userId, offset, limit)
    return NextResponse.json(
      {
        name: 'Reactions',
        items: page.items,
        total: page.total,
        nextOffset: page.nextOffset,
        understood: true,
        close: true,
        refined: false,
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    captureException(error, { endpoint: '/api/posts/reacted', userId })
    return NextResponse.json(
      { error: 'That didn’t load just now. Try again.', code: 'failed' },
      { status: 500, headers: NO_STORE },
    )
  }
})
