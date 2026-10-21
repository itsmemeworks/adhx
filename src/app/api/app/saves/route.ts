import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { listSaves, savedPhonePost } from '@/lib/app/phone-post'

const MAX_LIMIT = 50

function int(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/**
 * GET /api/app/saves — your saves for the phone app's player, newest first,
 * without the ones you've archived: `{ items, total, nextOffset }`.
 * `offset` and `limit` (1–50, default 20) page through them.
 *
 * GET /api/app/saves?platform=…&id=… — one of your saves, archived or not:
 * `{ item }`, so a share in Shared lately opens in the player.
 */
export const GET = withPhoneKey(async (request, { userId }) => {
  const params = new URL(request.url).searchParams
  const platform = params.get('platform')
  const id = params.get('id')
  if (platform || id) {
    const item = platform && id ? await savedPhonePost(userId, platform, id) : null
    if (!item) return appError(404, 'not_saved', 'That post isn’t in your saves.')
    return NextResponse.json({ item }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const offset = int(params.get('offset'), 0, 0, 100_000)
  const limit = int(params.get('limit'), 20, 1, MAX_LIMIT)
  return NextResponse.json(await listSaves(userId, offset, limit), {
    headers: { 'Cache-Control': 'no-store' },
  })
})
