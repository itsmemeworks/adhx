import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { addBookmark } from '@/lib/bookmarks/add'

/**
 * Platform-agnostic bookmark add endpoint.
 *
 * POST /api/bookmarks/add { url, source?: 'manual' | 'url_prefix' }
 *
 * Returns the created bookmark with the platform field so the client knows
 * where to redirect after save (`/?added=success&platform=...&id=...`). The
 * work is in `addBookmark` (src/lib/bookmarks/add.ts).
 */
export const POST = withAuth(async (request: NextRequest, userId: string) => {
  let body: { url?: unknown; source?: string }
  try {
    body = await request.json()
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/bookmarks/add',
      userId,
      message: 'Failed to add bookmark',
    })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }
  return addBookmark(userId, body.url, body.source ?? 'manual')
})
