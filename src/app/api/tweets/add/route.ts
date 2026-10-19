import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { addTweet } from '@/lib/bookmarks/add-tweet'
import { privateFlag } from '@/lib/bookmarks/privacy'

// POST /api/tweets/add { url, source?, private? } - Add a tweet by URL
export const POST = withAuth(async (request, userId) => {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }
  const { url, source = 'manual' } = body as { url?: unknown; source?: string }
  return addTweet(userId, url, source, undefined, { private: privateFlag(body) })
})
