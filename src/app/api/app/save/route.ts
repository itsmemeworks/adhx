import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { appPost, firstLink, savedPost } from '@/lib/app/phone-app'
import { addBookmark } from '@/lib/bookmarks/add'
import { privateFlag } from '@/lib/bookmarks/privacy'
import { noteOption } from '@/lib/bookmarks/note'
import { isLinkNetwork } from '@/lib/platform/networks'
import { wakeKeep } from '@/lib/keep/worker'
import {
  enqueueSave,
  NOT_A_POST,
  queuedSave,
  updateQueuedPrivacy,
  QueuedSaveConflict,
} from '@/lib/app/save-queue'

/**
 * POST /api/app/save { url, private?, note? } — the phone app's share sheet. `url`
 * is a link, or text with one in it. `private: true` keeps it just for you (in
 * the queue too); on a repeat save, `private` updates the flag. `note` is a few
 * words for your people (≤140 characters, kept with a queued share too); on a
 * repeat save it replaces the note, and an empty one clears it.
 *
 * With `Prefer: respond-async` (the current apps), the link is queued and the
 * answer comes at once: 202 `{ queued: true, id, state }`. The post is read and
 * saved in the background; `GET /api/app/save?id=` says how it's going.
 * Without it (older apps), it's saved now the way the website does
 * (`addBookmark`) and the answer is what was saved.
 */
export const POST = withPhoneKey(async (request, { userId }) => {
  const body = (await request.json().catch(() => ({}))) as {
    url?: unknown
    private?: unknown
    note?: unknown
    deferPublish?: unknown
    requestId?: unknown
  }
  const isPrivate = privateFlag(body)
  const note = noteOption(body)
  const url = firstLink(body?.url)
  if (!url) return appError(400, 'no_link', 'There’s no link in what was shared.')

  if (/respond-async/i.test(request.headers.get('prefer') ?? '')) {
    if (
      body.requestId !== undefined &&
      (typeof body.requestId !== 'string' ||
        !/^(?:[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}|[A-Za-z0-9_-]{21})$/i.test(
          body.requestId,
        ))
    ) {
      return appError(400, 'bad_request', 'Send a UUID or 21-character share request id.')
    }
    let queued
    try {
      queued = enqueueSave(userId, url, undefined, {
        private: isPrivate,
        note,
        deferPublish: body?.deferPublish === true,
        requestId: body.requestId as string | undefined,
      })
    } catch (error) {
      if (error instanceof QueuedSaveConflict)
        return appError(
          409,
          'request_conflict',
          'That share request was already used for a different link.',
        )
      throw error
    }
    return NextResponse.json(
      { queued: true, id: queued.id, state: queued.state },
      {
        status: 202,
        headers: { 'Cache-Control': 'no-store', 'Preference-Applied': 'respond-async' },
      },
    )
  }

  const response = await addBookmark(userId, url, 'phone_app', undefined, {
    private: isPrivate,
    note,
  })
  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean
    isDuplicate?: boolean
    platform?: string
    bookmark?: { id?: string; platform?: string }
    error?: string
  }

  if (response.status === 400) return appError(422, 'not_a_post', NOT_A_POST)
  if (response.status === 404) {
    return appError(404, 'unavailable', 'That post couldn’t be read. It may be private or deleted.')
  }
  const platform = data.bookmark?.platform ?? data.platform
  const id = data.bookmark?.id
  const row = response.ok && platform && id ? savedPost(userId, platform, id) : null
  if (!row) {
    return appError(500, 'failed', 'Something went wrong saving that. Try again in a moment.')
  }

  const alreadySaved = !!data.isDuplicate
  // Link-network saves already woke the downloader; start the others now too
  // so the sheet's progress bar moves while it's open.
  if (!alreadySaved && !isLinkNetwork(row.platform)) wakeKeep()
  return NextResponse.json(appPost(row, alreadySaved), {
    headers: { 'Cache-Control': 'no-store' },
  })
})

/**
 * GET /api/app/save?id= — how a queued link is going: waiting, saving, saved
 * (with the post, like a save answers) or failed (with `code` and words to show).
 */
export const GET = withPhoneKey(async (request, { userId }) => {
  const id = new URL(request.url).searchParams.get('id') ?? ''
  const queued = id ? queuedSave(userId, id) : null
  if (!queued) return appError(404, 'not_queued', 'That share isn’t waiting to be saved.')
  const headers = { 'Cache-Control': 'no-store' }
  if (queued.state === 'saved' && queued.platform && queued.postId) {
    const row = savedPost(userId, queued.platform, queued.postId)
    if (row) {
      return NextResponse.json(
        { id, state: 'saved', post: appPost(row, queued.alreadySaved) },
        { headers },
      )
    }
  }
  if (queued.state === 'failed') {
    return NextResponse.json(
      { id, state: 'failed', code: queued.errorCode ?? 'failed', error: queued.error },
      { headers },
    )
  }
  return NextResponse.json(
    { id, state: queued.state === 'saved' ? 'saving' : queued.state },
    { headers },
  )
})

/** PATCH /api/app/save { id, private?, intentVersion? }: persist queued intent.
 * Versioned acknowledgement retries are a no-op once accepted, including
 * after a later web edit; genuinely newer explicit intents remain mutations.
 */
export const PATCH = withPhoneKey(async (request, { userId }) => {
  const body = (await request.json().catch(() => null)) as {
    id?: unknown
    private?: unknown
    intentVersion?: unknown
  } | null
  if (
    typeof body?.id !== 'string' ||
    !body.id ||
    (body.private !== undefined && typeof body.private !== 'boolean') ||
    (body.intentVersion !== undefined &&
      (typeof body.intentVersion !== 'number' ||
        !Number.isSafeInteger(body.intentVersion) ||
        body.intentVersion < 1))
  ) {
    return appError(
      400,
      'bad_request',
      'Send the queued share id and, optionally, whether it is private.',
    )
  }
  if (
    !updateQueuedPrivacy(
      userId,
      body.id,
      body.private as boolean | undefined,
      body.intentVersion as number | undefined,
    )
  ) {
    return appError(404, 'not_queued', 'That share is not yours or is no longer waiting.')
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
})
