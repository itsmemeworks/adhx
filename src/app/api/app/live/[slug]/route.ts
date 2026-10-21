import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { LIVE_LIMIT, phoneMomentDetail } from '@/lib/app/live'
import { announceWatching, getMomentDetail, visibleMomentKeys } from '@/lib/moments/engine'
import { momentSaverUpdates, reactionForViewer, withDetailPeople } from '@/lib/moments/people'
import { leaveWatch, recentReactions, renewWatch } from '@/lib/moments/presence'
import { SLUG } from '@/lib/moments/react'
import { privateKeysFor } from '@/lib/people/savers'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const WATCH_SESSION = /^[a-zA-Z0-9-]{16,64}$/
const POST_KEY = /^[a-z]{1,16}:[A-Za-z0-9_-]{1,128}$/
const MAX_KNOWN_BYTES = 45_000

/** Bound bytes and time before buffering a chunked request. */
async function knownBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'))
  if (declared > MAX_KNOWN_BYTES || !request.body) throw new Error('invalid body')
  const reader = request.body.getReader()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    void reader.cancel()
  }, 5_000)
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (timedOut) throw new Error('body timeout')
      if (done) break
      total += value.byteLength
      if (total > MAX_KNOWN_BYTES) {
        await reader.cancel()
        throw new Error('body too large')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return (JSON.parse(new TextDecoder().decode(bytes)) as { known?: unknown }).known ?? []
  } finally {
    clearTimeout(timer)
    reader.releaseLock()
  }
}

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
  return withPhoneKey(async (_request, { userId, keyId }) => {
    const limited = checkRateLimit(`app-live:${userId}`, LIVE_LIMIT)
    if (limited.limited) {
      const response = appError(429, 'busy', 'Lots of requests just now. Give it a moment.')
      response.headers.set('Retry-After', Math.ceil(limited.resetMs / 1000).toString())
      return response
    }
    let known: string[] = []
    try {
      // POST keeps up to 200 known references out of proxy-limited request URLs.
      let parsed: unknown
      if (request.method === 'POST') {
        parsed = await knownBody(request)
      } else {
        const raw = new URL(request.url).searchParams.get('known')
        parsed = raw ? JSON.parse(raw) : []
      }
      if (
        !Array.isArray(parsed) ||
        parsed.length > 200 ||
        parsed.some((key) => typeof key !== 'string' || !POST_KEY.test(key))
      )
        throw new Error('invalid')
      known = [...new Set(parsed)] as string[]
    } catch {
      return appError(400, 'bad_known', 'Refresh this moment and try again.')
    }
    const detail = SLUG.test(slug) ? await getMomentDetail(slug, 60) : null
    if (!detail) return appError(404, 'moment_gone', 'This moment has passed.')
    const session = request.headers.get('X-ADHX-Watch')
    if (session && !WATCH_SESSION.test(session))
      return appError(400, 'bad_watch', 'Refresh this moment and try again.')
    if (session && renewWatch(slug, userId, keyId, session)) announceWatching(slug)
    const present = new Set(visibleMomentKeys(slug, known))
    const fresh = new Set(
      detail.items.map((item) => `${item.post.platform ?? 'twitter'}:${item.post.id}`),
    )
    const saverUpdates = momentSaverUpdates(
      [...present].filter((key) => !fresh.has(key)),
      userId,
    )
    const phone = phoneMomentDetail(withDetailPeople(detail, userId))
    const ownPrivate = privateKeysFor(
      phone.items.map((item) => ({ platform: item.platform, id: item.id })),
      userId,
    )
    const reactions = recentReactions(slug)
      .map((signal) => reactionForViewer(signal, userId))
      .filter((r) => r !== null)
      .map(({ type: _type, ...reaction }) => reaction)
    return NextResponse.json(
      {
        ...phone,
        items: phone.items.map((item) => ({
          ...item,
          isPrivate: ownPrivate.has(`${item.platform}:${item.id}`),
        })),
        reactions,
        removedKeys: known.filter((key) => !present.has(key)),
        saverUpdates,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  })(request)
}

/** Leave this screen only; another phone or web tab remains present. Lost requests expire after 15 s. */
export async function DELETE(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  return withPhoneKey(async (_request, { userId, keyId }) => {
    const session = request.headers.get('X-ADHX-Watch')
    if (!SLUG.test(slug) || !session || !WATCH_SESSION.test(session))
      return appError(400, 'bad_watch', 'Refresh this moment and try again.')
    leaveWatch(slug, userId, keyId, session)
    announceWatching(slug)
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  })(request)
}

/** Foreground polling with a bounded known-post body; GET remains compatible with older clients. */
export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  return GET(request, ctx)
}
