import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { setSaveNote } from '@/lib/bookmarks/note'

/**
 * PATCH /api/bookmarks/[id]/note { platform, note } → { note }
 *
 * Set or clear the note on your save: a few words for your people, shown next
 * to your face to members only. Cleaned and capped at 140 characters; an empty
 * note (or null) clears it.
 */
export const PATCH = withAuth(
  async (request: NextRequest, userId, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params
      const body = (await request.json().catch(() => null)) as {
        platform?: unknown
        note?: unknown
      } | null
      if (!body || (typeof body.note !== 'string' && body.note !== null)) {
        return NextResponse.json({ error: 'Send the note, or null to clear it.' }, { status: 400 })
      }
      const platform =
        typeof body.platform === 'string' && body.platform ? body.platform : 'twitter'
      const done = setSaveNote(userId, platform, id, body.note)
      if (done === null) {
        return NextResponse.json({ error: 'That post isn’t in your saves.' }, { status: 404 })
      }
      return NextResponse.json(done, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      return handleRouteError(error, {
        endpoint: '/api/bookmarks/[id]/note',
        userId,
        message: 'Couldn’t change that note. Try again.',
      })
    }
  },
)
