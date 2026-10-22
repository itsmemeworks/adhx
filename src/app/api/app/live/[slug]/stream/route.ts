import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { phoneEvent } from '@/lib/app/live'
import { momentStreamResponse } from '@/lib/moments/stream'
import { SLUG } from '@/lib/moments/react'

export const dynamic = 'force-dynamic'

/**
 * GET /api/app/live/{slug}/stream — Tune in, live, on the phone
 * (Server-Sent Events, `Authorization: Bearer` phone key). Counts you as
 * watching (by name, for your people) and sends this moment's events, named
 * like the web's: `watching` (`watching`, `watchers`), `save` (`item.post` a
 * `PhonePost`, `saver`, `moment`), `formed`, `reaction`
 * (`{ saver, emoji | text, post: { platform, id } }`).
 */
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  return withPhoneKey(async (req, { userId, keyId }) => {
    if (!SLUG.test(slug)) return appError(404, 'moment_gone', 'This moment has passed.')
    return momentStreamResponse({
      request: req,
      watch: slug,
      viewerId: userId,
      keyId,
      only: slug,
      map: phoneEvent,
      notify: new URL(req.url).searchParams.get('notify') === '1',
    })
  })(request)
}
