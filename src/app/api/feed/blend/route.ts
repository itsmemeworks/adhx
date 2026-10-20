import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { parseBlendQuery } from '@/lib/feed/blend'
import { blendPage } from '@/lib/feed/blend-db'
import { checkRateLimit } from '@/lib/rate-limit'

// A first page computes a snapshot; later pages read it.
const LIMIT = { windowMs: 60_000, max: 60 }

/**
 * GET /api/feed/blend?mode=new|everyone|friends|mine&limit&cursor — the
 * blended feed (docs/specs/friends-feed.md): `{ items, nextCursor, caughtUp,
 * nothingYet, total, types, waiting }`. Items are `FeedItem`s with `savers`, `isPrivate`,
 * `why` (the headline reason) and `whyReasons`. Members only.
 *
 * - `new`: only posts you haven't seen; `caughtUp` once there are no more.
 *   `nothingYet`: your people haven't saved anything lately at all.
 * - `everyone`: all members' saves, yours sparingly.
 * - `friends`: what friends saved that you haven't.
 * - `mine`: your saves.
 * - `types=video,photo,text,article` ("What's in your feed"; sound counts
 *   as video): omitted, the stored choice (`/api/feed/types`), else video
 *   and photo. `caughtUp` and `why` apply within it; New's `waiting` counts
 *   the unseen posts it leaves out, by kind.
 * - `cursor` is opaque; pages from one cursor chain never reshuffle (send the
 *   same `types` with each page).
 */
export const GET = withAuth(async (request: NextRequest, userId) => {
  const query = parseBlendQuery(request.nextUrl.searchParams)
  if ('error' in query) return NextResponse.json({ error: query.error }, { status: 400 })
  const limited = checkRateLimit(`blend:${userId}`, LIMIT)
  if (limited.limited) {
    return NextResponse.json(
      { error: 'Lots of requests just now. Give it a moment.' },
      { status: 429, headers: { 'Retry-After': Math.ceil(limited.resetMs / 1000).toString() } },
    )
  }
  try {
    const page = await blendPage(userId, query.mode, {
      limit: query.limit,
      cursor: query.cursor,
      types: query.types,
    })
    return NextResponse.json(page, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/feed/blend',
      userId,
      message: 'Failed to load the feed',
    })
  }
})
