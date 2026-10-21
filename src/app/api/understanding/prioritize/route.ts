import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { prioritize, type PostKey } from '@/lib/semantic'

const MAX_KEYS = 20

function parseKeys(body: unknown): PostKey[] | null {
  if (!body || typeof body !== 'object') return null
  const raw = (body as { posts?: unknown }).posts
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_KEYS) return null
  const keys: PostKey[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null
    const { platform, id } = entry as { platform?: unknown; id?: unknown }
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null
    if (platform !== undefined && (typeof platform !== 'string' || !/^[a-z]{1,16}$/.test(platform)))
      return null
    keys.push({ platform: (platform as string | undefined) ?? 'twitter', postId: id })
  }
  return keys
}

// POST /api/understanding/prioritize { posts: [{ platform, id }] } — move
// up to 20 of this user's saves (e.g. Up next) to the front of the line.
export const POST = withAuth(async (request: NextRequest, userId) => {
  try {
    const keys = parseKeys(await request.json().catch(() => null))
    if (!keys)
      return NextResponse.json(
        { error: 'posts must be 1-20 { platform, id } entries' },
        { status: 400 },
      )
    const prioritized = await prioritize(userId, keys)
    return NextResponse.json({ prioritized })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/understanding/prioritize',
      userId,
      message: 'Failed to prioritize',
    })
  }
})
