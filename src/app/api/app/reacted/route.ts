import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { toPhonePost } from '@/lib/app/phone-post'
import { pageParams, reactedPosts } from '@/lib/reactions/reacted'
import { checkRateLimit } from '@/lib/rate-limit'
import { captureException } from '@/lib/sentry'

export const dynamic = 'force-dynamic'

/**
 * GET /api/app/reacted?offset=&limit= — the reactions feed: posts you can see
 * with at least one reaction you can see, newest reaction first.
 * → `{ items, total, nextOffset }`. Each item is a `PhonePost` plus
 * `reactions: { count, last: { emoji, text, at, saver: { username, name,
 * avatarUrl, isYou } } }` (`emoji` or `text`, the other null). `limit` 1–50
 * (default 20); `total` is how many posts in all ("12 posts with reactions").
 * Banned reactors and hidden posts are left out. Errors: `busy` 429, `failed` 500.
 */
export const GET = withPhoneKey(async (request, { userId }) => {
  const limited = checkRateLimit(`app-reacted:${userId}`, { windowMs: 60_000, max: 120 })
  if (limited.limited) {
    const response = appError(429, 'busy', 'Lots of requests just now. Give it a moment.')
    response.headers.set('Retry-After', Math.ceil(limited.resetMs / 1000).toString())
    return response
  }
  const { offset, limit } = pageParams(new URL(request.url).searchParams)
  try {
    const page = await reactedPosts(userId, offset, limit)
    return NextResponse.json(
      {
        items: page.items.map(({ reactions, ...item }) => ({
          ...toPhonePost(item, false),
          reactions,
        })),
        total: page.total,
        nextOffset: page.nextOffset,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    captureException(error, { endpoint: '/api/app/reacted', userId })
    return appError(500, 'failed', 'That didn’t load just now. Try again.')
  }
})
