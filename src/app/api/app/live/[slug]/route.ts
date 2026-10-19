import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { LIVE_LIMIT, phoneMomentDetail } from '@/lib/app/live'
import { getMomentDetail } from '@/lib/moments/engine'
import { reactionForViewer, withDetailPeople } from '@/lib/moments/people'
import { recentReactions } from '@/lib/moments/presence'
import { SLUG } from '@/lib/moments/react'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/app/live/{slug} — one moment for Tune in on the phone:
 * `{ moment, items, watchers, reactions }`. `items` are `PhonePost`s newest
 * first (each names its `savers`; `savedAt` is when it was last saved),
 * `watchers` the members tuned in now (not you), `reactions` the last few
 * seconds of reactions (`{id, at, saver, emoji | text, post}`) for a phone
 * that polls. 404 `moment_gone` when it has passed.
 */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  return withPhoneKey(async (_request, { userId }) => {
    const limited = checkRateLimit(`app-live:${userId}`, LIVE_LIMIT)
    if (limited.limited) {
      const response = appError(429, 'busy', 'Lots of requests just now. Give it a moment.')
      response.headers.set('Retry-After', Math.ceil(limited.resetMs / 1000).toString())
      return response
    }
    const detail = SLUG.test(slug) ? await getMomentDetail(slug, 60) : null
    if (!detail) return appError(404, 'moment_gone', 'This moment has passed.')
    const reactions = recentReactions(slug)
      .map((signal) => reactionForViewer(signal, userId))
      .filter((r) => r !== null)
      .map(({ type: _type, ...reaction }) => reaction)
    return NextResponse.json(
      { ...phoneMomentDetail(withDetailPeople(detail, userId)), reactions },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  })(request)
}
