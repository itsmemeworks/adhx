import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { toPhonePost } from '@/lib/app/phone-post'
import { parseBlendQuery } from '@/lib/feed/blend'
import { blendPage } from '@/lib/feed/blend-db'
import { checkRateLimit } from '@/lib/rate-limit'
import { captureException } from '@/lib/sentry'

const LIMIT = { windowMs: 60_000, max: 60 }

/**
 * GET /api/app/feed?mode=new|everyone|friends|mine&types=video,photo&cursor&limit
 * — the blended feed for the phone: `{ items: PhonePost[], nextCursor,
 * caughtUp, nothingYet, total, types, waiting }`. `types` (video, photo, text,
 * article; audio plays with video) defaults to the stored choice
 * (`/api/app/feed/types`), else video and photo. Each item carries `why` (and `whyReasons`) besides
 * the usual `savers` / `isPrivate`. Mark what's been on screen with
 * `POST /api/app/seen`.
 */
export const GET = withPhoneKey(async (request, { userId }) => {
  const query = parseBlendQuery(new URL(request.url).searchParams)
  if ('error' in query) return appError(400, 'bad_query', query.error)
  const limited = checkRateLimit(`blend:${userId}`, LIMIT)
  if (limited.limited) {
    const response = appError(429, 'busy', 'Lots of requests just now. Give it a moment.')
    response.headers.set('Retry-After', Math.ceil(limited.resetMs / 1000).toString())
    return response
  }
  try {
    const page = await blendPage(userId, query.mode, {
      limit: query.limit,
      cursor: query.cursor,
      types: query.types,
    })
    return NextResponse.json(
      {
        items: page.items.map((post) => ({
          ...toPhonePost(
            {
              post,
              saved: !!post.savers?.some((s) => s.isYou),
              matched: [],
              strength: 'strong',
            },
            false,
          ),
          why: post.why,
          whyReasons: post.whyReasons,
        })),
        nextCursor: page.nextCursor,
        caughtUp: page.caughtUp,
        nothingYet: page.nothingYet,
        total: page.total,
        types: page.types,
        waiting: page.waiting,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    captureException(error, { endpoint: '/api/app/feed' })
    return appError(500, 'failed', 'The feed didn’t load just now. Try again.')
  }
})
