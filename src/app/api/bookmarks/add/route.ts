import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { addBookmark } from '@/lib/bookmarks/add'
import { privateFlag } from '@/lib/bookmarks/privacy'
import { noteOption } from '@/lib/bookmarks/note'

/**
 * Platform-agnostic bookmark add endpoint.
 *
 * POST /api/bookmarks/add { url, source?: 'manual' | 'url_prefix', private?: boolean, note?: string }
 *
 * `private: true` keeps it just for you; on a repeat save, `private` updates the flag.
 * `note` is a few words for your people (members only, ≤140 characters); on a
 * repeat save it replaces the note (empty clears it).
 *
 * Returns the created bookmark with the platform field so the client knows
 * where to redirect after save (`/?added=success&platform=...&id=...`). The
 * work is in `addBookmark` (src/lib/bookmarks/add.ts).
 */
export const POST = withAuth(async (request: NextRequest, userId: string) => {
  let body: { url?: unknown; source?: string; private?: unknown; note?: unknown }
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
  return addBookmark(userId, body.url, body.source ?? 'manual', undefined, {
    private: privateFlag(body),
    note: noteOption(body),
  })
})
