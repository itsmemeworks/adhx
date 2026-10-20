import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/lib/admin/guard'
import { hidePost, writeAudit } from '@/lib/admin/moderation'
import { clearPostNotes } from '@/lib/bookmarks/note'
import { parseAdminPostRef } from '@/lib/admin/parse-post'
import { inspectPost } from '@/lib/admin/query'
import { parseAnalyticsWindow } from '@/lib/analytics/query'
import { handleRouteError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

function resolveRef(
  request: NextRequest,
): { platform: string; id: string; contentType?: 'photo' | 'video' } | null {
  const q = request.nextUrl.searchParams
  const raw = q.get('url') || q.get('q') || ''
  if (raw) {
    const parsed = parseAdminPostRef(raw)
    if (parsed) {
      return {
        platform: parsed.platform,
        id: parsed.id,
        contentType: parsed.contentType,
      }
    }
  }
  const platform = (q.get('platform') || '').trim()
  const id = (q.get('id') || '').trim()
  if (platform && id) return { platform, id }
  return null
}

export const GET = withAdmin(async (request: NextRequest, actor) => {
  try {
    const ref = resolveRef(request)
    if (!ref) {
      return NextResponse.json({ error: 'url or platform+id is required' }, { status: 400 })
    }
    const window = parseAnalyticsWindow(request.nextUrl.searchParams.get('window'))
    return NextResponse.json(inspectPost(ref.platform, ref.id, window, ref.contentType), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/admin/posts', userId: actor.userId })
  }
})

export const POST = withAdmin(async (request: NextRequest, actor) => {
  try {
    let body: {
      platform?: unknown
      id?: unknown
      url?: unknown
      hidden?: unknown
      reason?: unknown
      contentType?: unknown
      clearNotes?: unknown
    }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const fromUrl = typeof body.url === 'string' ? parseAdminPostRef(body.url) : null
    const platform =
      (typeof body.platform === 'string' ? body.platform.trim() : '') || fromUrl?.platform || ''
    const bookmarkId = (typeof body.id === 'string' ? body.id.trim() : '') || fromUrl?.id || ''
    const hidden = typeof body.hidden === 'boolean' ? body.hidden : true
    const reason = typeof body.reason === 'string' ? body.reason : null
    const requestedContentType =
      body.contentType === 'photo' || body.contentType === 'video' ? body.contentType : undefined
    const contentType = fromUrl?.contentType ?? requestedContentType

    if (!platform || !bookmarkId) {
      return NextResponse.json({ error: 'platform and id (or url) are required' }, { status: 400 })
    }

    // Clear notes on the post instead of hiding it: `true` for everyone's, or
    // one member's username.
    if (body.clearNotes !== undefined) {
      const username =
        typeof body.clearNotes === 'string' && body.clearNotes.trim()
          ? body.clearNotes.trim()
          : undefined
      if (body.clearNotes !== true && !username) {
        return NextResponse.json(
          { error: 'clearNotes is true (every note) or a username' },
          { status: 400 },
        )
      }
      const notesCleared = clearPostNotes(platform, bookmarkId, username)
      writeAudit(actor.userId, 'clear_note', {
        platform,
        bookmarkId,
        ...(username ? { username } : {}),
        notesCleared,
      })
      return NextResponse.json({ platform, id: bookmarkId, notesCleared })
    }

    const result = hidePost({
      platform,
      bookmarkId,
      hidden,
      actorUserId: actor.userId,
      reason,
      contentType,
    })
    return NextResponse.json({ platform, id: bookmarkId, contentType, ...result })
  } catch (error) {
    return handleRouteError(error, { endpoint: '/api/admin/posts', userId: actor.userId })
  }
})
