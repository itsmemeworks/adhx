import fs from 'fs/promises'
import { NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/auth/session'
import { phoneCaller } from '@/lib/api/phone-auth'
import { avatarFileFor } from '@/lib/avatar/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/files/avatar/<hash> — a member's picture. Members only (a signed-in
 * session or a phone key): a face names someone, and strangers never see
 * names. Only someone's current picture is served; the address changes with
 * each new one, so it can be cached for good.
 */
export async function GET(request: Request, ctx: { params: Promise<{ hash: string }> }) {
  const { hash } = await ctx.params
  const viewer = (await getCurrentUserId()) ?? (await phoneCaller(request))?.userId ?? null
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const file = avatarFileFor(hash)
  const body = file ? await fs.readFile(file).catch(() => null) : null
  if (!body) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(body.length),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
