import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { setSaveNote } from '@/lib/bookmarks/note'

/**
 * POST /api/app/note { platform, id, note } → { note }
 *
 * The phone's "Add a note": set or clear the note on your save. Members see it
 * next to your face; strangers never do. Cleaned and capped at 140 characters;
 * an empty note (or null) clears it.
 */
export const POST = withPhoneKey(async (request, { userId }) => {
  const body = (await request.json().catch(() => null)) as {
    platform?: unknown
    id?: unknown
    note?: unknown
  } | null
  const platform = typeof body?.platform === 'string' ? body.platform : ''
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!platform || !id || (typeof body?.note !== 'string' && body?.note !== null)) {
    return appError(400, 'bad_request', 'Send the post’s platform and id, and the note.')
  }
  const done = setSaveNote(userId, platform, id, body.note)
  if (done === null) return appError(404, 'not_saved', 'That post isn’t in your saves.')
  return NextResponse.json(done, { headers: { 'Cache-Control': 'no-store' } })
})
