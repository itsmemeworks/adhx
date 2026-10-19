import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { appPost, firstLink, savedPost } from '@/lib/app/phone-app'
import { addBookmark } from '@/lib/bookmarks/add'
import { isLinkNetwork } from '@/lib/platform/networks'
import { wakeKeep } from '@/lib/keep/worker'
import { enqueueSave, NOT_A_POST, queuedSave } from '@/lib/app/save-queue'

/**
 * POST /api/app/save { url } — the phone app's share sheet. `url` is a link,
 * or text with one in it.
 *
 * With `Prefer: respond-async` (the current apps), the link is queued and the
 * answer comes at once: 202 `{ queued: true, id, state }`. The post is read and
 * saved in the background; `GET /api/app/save?id=` says how it's going.
 * Without it (older apps), it's saved now the way the website does
 * (`addBookmark`) and the answer is what was saved.
 */
export const POST = withPhoneKey(async (request, { userId }) => {
  const body = (await request.json().catch(() => ({}))) as { url?: unknown }
  const url = firstLink(body?.url)
  if (!url) return appError(400, 'no_link', 'There’s no link in what was shared.')

  if (/respond-async/i.test(request.headers.get('prefer') ?? '')) {
    const queued = enqueueSave(userId, url)
    return NextResponse.json(
      { queued: true, id: queued.id, state: queued.state },
      {
        status: 202,
        headers: { 'Cache-Control': 'no-store', 'Preference-Applied': 'respond-async' },
      },
    )
  }

  const response = await addBookmark(userId, url, 'phone_app')
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
