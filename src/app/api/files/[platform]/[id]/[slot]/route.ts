import fs from 'fs'
import { Readable } from 'stream'
import { NextRequest, NextResponse } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarkMedia, bookmarks } from '@/lib/db/schema'
import { readPostModeration } from '@/lib/admin/moderation'
import { absolutePath, isSlot, keptFile, type KeptFile, type Slot } from '@/lib/keep/store'
import { keepJobs } from '@/lib/db/schema'
import { proxySrc } from '@/lib/keep/src'
import { wakeKeep } from '@/lib/keep/worker'
import { ensurePoster } from '@/lib/keep/poster'
import { keptFileAccess, ownsSave, validFileToken } from '@/lib/keep/file-access'
import { getCurrentUserId } from '@/lib/auth/session'
import { phoneCaller } from '@/lib/api/phone-auth'

const PLATFORM = /^[a-z]{1,16}$/
const ID = /^[A-Za-z0-9._~:@-]{1,200}$/
const AUTHOR = /^[A-Za-z0-9._-]{1,64}$/
const TWIMG = /^https:\/\/pbs\.twimg\.com\//

/** A same-origin hand-off; relative so it works behind any host or proxy. */
function handOff(location: string): NextResponse {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: location, 'Cache-Control': 'no-store' },
  })
}

function notFound(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

/** Slot URLs stay stable when an uploaded browser copy replaces its source. */
function conversionPending(platform: string, id: string, slot: Slot): boolean {
  return (
    db.all(sql`SELECT 1 WHERE EXISTS (
    SELECT 1 FROM keep_jobs WHERE platform=${platform} AND post_id=${id} AND status='converting'
  ) OR EXISTS (
    SELECT 1 FROM media_conversions WHERE platform=${platform} AND post_id=${id} AND slot=${slot}
      AND status IN ('pending','running','failed')
  )`).length > 0
  )
}

const WAIT_MS = 25_000

/**
 * Why a post's video isn't here, for the player to say: the download gave up
 * (410, so a playlist skips it), it failed and will be tried again (404), or
 * nobody has saved it, so it was never downloaded (404: saving it fixes that).
 */
function notKeptReason(platform: string, id: string): { status: 404 | 410; reason: string } | null {
  const [job] = db
    .select({ status: keepJobs.status })
    .from(keepJobs)
    .where(and(eq(keepJobs.platform, platform), eq(keepJobs.postId, id)))
    .limit(1)
    .all()
  if (job?.status === 'unavailable') {
    return { status: 410, reason: 'This one couldn’t be downloaded. The original may still play.' }
  }
  if (job?.status === 'failed') {
    return { status: 404, reason: 'This one couldn’t be downloaded yet. ADHX will try again.' }
  }
  if (job) return null
  const [saved] = db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.platform, platform), eq(bookmarks.id, id)))
    .limit(1)
    .all()
  return saved
    ? null
    : { status: 404, reason: 'Nobody here has saved this yet. Save it to watch it here.' }
}

function findKept(platform: string, id: string, slot: Slot): KeptFile | null {
  return (
    keptFile(platform, id, slot) ??
    (slot === 'poster' ? keptFile(platform, id, 'photo-1') : null) ??
    (slot === 'video-1' ? keptFile(platform, id, 'audio-1') : null)
  )
}

/** Saved and on its way (or about to be queued). */
function downloading(platform: string, id: string): boolean {
  const [job] = db
    .select({ status: keepJobs.status })
    .from(keepJobs)
    .where(and(eq(keepJobs.platform, platform), eq(keepJobs.postId, id)))
    .limit(1)
    .all()
  if (job) return job.status === 'pending' || job.status === 'running'
  const [saved] = db
    .select({ id: bookmarkMedia.bookmarkId })
    .from(bookmarkMedia)
    .where(and(eq(bookmarkMedia.platform, platform), eq(bookmarkMedia.bookmarkId, id)))
    .limit(1)
    .all()
  return !!saved
}

async function waitForKept(
  platform: string,
  id: string,
  slot: Slot,
  signal: AbortSignal,
): Promise<KeptFile | null> {
  const until = Date.now() + WAIT_MS
  while (Date.now() < until && !signal.aborted) {
    await new Promise((r) => setTimeout(r, 750))
    const kept = findKept(platform, id, slot)
    if (kept) return kept
    if (!downloading(platform, id)) return null
  }
  return null
}

/** Parse a single `bytes=a-b` range against a file size. */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/)
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start: number
  let end: number
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  return start <= end && start < size ? { start, end } : null
}

/**
 * GET /api/files/:platform/:id/:slot — a post's kept file (`video-1`,
 * `photo-2`, `audio-1`, `poster`), served with Range support so video seeks.
 *
 * Until the file is downloaded, X, Instagram and TikTok hand off to their old
 * proxies (`?a=` carries the author they need); other networks wait for the
 * download.
 *
 * A post whose only saves are Just for me is served to its owners only (their
 * session or phone key, or the post's `?k=` file token) and never cached. To
 * anyone else it looks exactly like a post nobody saved, and why a file isn't
 * here is only said to members (`src/lib/keep/file-access.ts`).
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ platform: string; id: string; slot: string }> },
) {
  const { platform, id, slot } = await ctx.params
  if (!PLATFORM.test(platform) || !ID.test(id) || !isSlot(slot)) return notFound()
  const moderation = readPostModeration(platform, id)
  if (!moderation.ok || moderation.value) return notFound()

  // Who's asking, read once and only when it matters.
  let caller: string | null | undefined
  const callerId = async (): Promise<string | null> => {
    if (caller === undefined) {
      caller = (await getCurrentUserId()) ?? (await phoneCaller(request))?.userId ?? null
    }
    return caller
  }
  const access = keptFileAccess(platform, id)
  let privateToOwner = false
  if (access === 'private') {
    if (validFileToken(platform, id, request.nextUrl.searchParams.get('k'))) {
      privateToOwner = true
    } else {
      const who = await callerId()
      privateToOwner = !!who && ownsSave(who, platform, id)
    }
  }
  // Someone else's Just for me save: answer as if nobody had saved it.
  const hidden = access === 'private' && !privateToOwner

  // A picture post has no separate poster: its first picture is the poster.
  // A sound-only post (SoundCloud) plays its sound in the video slot.
  let kept = hidden ? null : findKept(platform, id, slot)
  // Networks with no proxy: a fresh save is usually seconds from kept. Wait
  // for it rather than failing the player.
  if (!kept && !hidden && !proxySrc(platform, id, slot, 'x') && downloading(platform, id)) {
    wakeKeep()
    kept = await waitForKept(platform, id, slot, request.signal)
  }
  // A video kept before stills were taken on download: make its poster now.
  if (!kept && !hidden && slot === 'poster') kept = await ensurePoster(platform, id)
  if (kept) {
    let file: string
    let size: number
    let modified: number
    try {
      file = absolutePath(kept.path)
      const stat = fs.statSync(file)
      size = stat.size
      modified = Math.floor(stat.mtimeMs)
    } catch {
      return notFound()
    }
    const headers: Record<string, string> = {
      'Content-Type': kept.mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': privateToOwner
        ? 'private, no-store'
        : conversionPending(platform, id, kept.slot)
          ? 'no-store'
          : // A poster can be remade (a black one is replaced once), so it's
            // checked again hourly; the ETag keeps that a cheap 304.
            kept.slot === 'poster'
            ? 'public, max-age=3600'
            : 'public, max-age=604800',
      'X-Content-Type-Options': 'nosniff',
    }
    if (kept.slot === 'poster' && !privateToOwner) {
      const etag = `"${size}-${modified}"`
      headers['ETag'] = etag
      if (request.headers.get('if-none-match') === etag) {
        return new NextResponse(null, { status: 304, headers })
      }
    }
    if (request.nextUrl.searchParams.get('download') === '1') {
      const ext = kept.path.split('.').pop()
      headers['Content-Disposition'] =
        `attachment; filename="${platform}-${id.replace(/[^A-Za-z0-9_-]/g, '_')}-${slot}.${ext}"`
    }
    const range = request.headers.get('range')
    const r = parseRange(range, size)
    if (range && !r) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      })
    }
    const start = r?.start ?? 0
    const end = r?.end ?? size - 1
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream
    return new NextResponse(stream, {
      status: r ? 206 : 200,
      headers: {
        ...headers,
        'Content-Length': String(end - start + 1),
        ...(r ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
      },
    })
  }

  // Not kept yet: make sure it's on its way, and use the proxy meanwhile.
  if (!hidden) wakeKeep()
  const author = request.nextUrl.searchParams.get('a') ?? ''
  const download = request.nextUrl.searchParams.get('download') === '1'
  const fallback = proxySrc(platform, id, slot, AUTHOR.test(author) ? author : '', download)
  if (fallback) return handOff(fallback)
  if (slot === 'poster' && platform === 'twitter') {
    // A saver's stored picture would say someone saved it: not for a hidden post.
    const [row] = hidden
      ? []
      : db
          .select({ previewUrl: bookmarkMedia.previewUrl })
          .from(bookmarkMedia)
          .where(and(eq(bookmarkMedia.platform, platform), eq(bookmarkMedia.bookmarkId, id)))
          .limit(1)
          .all()
    if (row?.previewUrl && TWIMG.test(row.previewUrl)) {
      return handOff(row.previewUrl)
    }
    const photo = proxySrc(platform, id, 'photo-1', AUTHOR.test(author) ? author : '')
    if (photo) return handOff(photo)
  }
  // Why it isn't here is for members: to a stranger it would say whether
  // anyone on this server saved the post.
  if (!hidden && /^(video|audio)-/.test(slot) && (await callerId())) {
    const why = notKeptReason(platform, id)
    if (why) return NextResponse.json({ reason: why.reason }, { status: why.status })
  }
  return notFound()
}
