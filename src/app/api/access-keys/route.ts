import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { createAccessKey, listAccessKeys, MAX_ACCESS_KEYS } from '@/lib/auth/access-keys'

/** GET /api/access-keys — your keys (never the keys themselves, only their last four). */
export const GET = withAuth(async (_request, userId) => {
  return NextResponse.json({ keys: listAccessKeys(userId), max: MAX_ACCESS_KEYS })
})

/** POST /api/access-keys { name } — make a key; the response is the only time it's shown. */
export const POST = withAuth(async (request: NextRequest, userId) => {
  const body = await request.json().catch(() => ({}))
  const created = createAccessKey(userId, (body as { name?: unknown }).name)
  if (!created) {
    return NextResponse.json(
      { error: `You can have ${MAX_ACCESS_KEYS} keys. Remove one first.` },
      { status: 409 },
    )
  }
  const response = NextResponse.json(created, { status: 201 })
  response.headers.set('Cache-Control', 'no-store')
  return response
})
