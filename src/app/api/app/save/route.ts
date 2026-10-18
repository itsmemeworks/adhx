import { NextResponse } from 'next/server'
import { appError, withPhoneKey } from '@/lib/api/phone-auth'
import { appPost, firstLink, savedPost } from '@/lib/app/phone-app'
import { addBookmark } from '@/lib/bookmarks/add'
import { isLinkNetwork } from '@/lib/platform/networks'
import { wakeKeep } from '@/lib/keep/worker'

const NOT_A_POST =
  'ADHX keeps single posts. Open the post itself (a Reel, a photo, a video) and share that.'

/**
 * POST /api/app/save { url } — the phone app's share sheet. `url` is a link,
 * or text with one in it. Saves it the way the website does (`addBookmark`)
 * and answers with what was saved, for the sheet to show.
 */
export const POST = withPhoneKey(async (request, { userId }) => {
  const body = (await request.json().catch(() => ({}))) as { url?: unknown }
  const url = firstLink(body?.url)
  if (!url) return appError(400, 'no_link', 'There’s no link in what was shared.')

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
