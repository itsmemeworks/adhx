import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { listAccessKeys, MAX_PHONE_KEYS } from '@/lib/auth/access-keys'

/** GET /api/app/phones — the phones connected to this account. */
export const GET = withAuth(async (_request, userId) => {
  const phones = listAccessKeys(userId, 'phone').map(({ id, name, createdAt, lastUsedAt }) => ({
    id,
    name,
    createdAt,
    lastUsedAt,
  }))
  const response = NextResponse.json({ phones, max: MAX_PHONE_KEYS })
  response.headers.set('Cache-Control', 'no-store')
  return response
})
