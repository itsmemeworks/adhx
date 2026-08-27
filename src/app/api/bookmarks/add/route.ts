import { NextRequest, NextResponse } from 'next/server'
import { db, runInTransaction } from '@/lib/db'
import { bookmarks, bookmarkMedia } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { withAuth } from '@/lib/api/with-auth'
import { metrics } from '@/lib/sentry'
import { handleRouteError } from '@/lib/api/response'
import { fetchInstagramMetadata } from '@/lib/media/instafix'
import { fetchTikTokMetadata, resolveTikTokUrl, isTikTokShortLink } from '@/lib/media/tnktok'
import { tiktokCreatedAtFromId } from '@/lib/media/tiktok-id'
import { fetchYouTubeMetadata, youtubeThumbnail, youtubeShortUrl } from '@/lib/media/youtube'
import { recordActivity, previewPath } from '@/lib/activity/record'
import { detectPlatformPost } from '@/lib/platform/url'
import { fetchWithTimeout } from '@/lib/utils/fetch-timeout'

/**
 * Platform-agnostic bookmark add endpoint.
 *
 * POST /api/bookmarks/add { url, source?: 'manual' | 'url_prefix' }
 *
 * Detects the source platform from the URL and dispatches:
 *   - X / Twitter → delegates to /api/tweets/add (richer FxTwitter flow)
 *   - Instagram   → fetches via InstaFix, inserts a 'video' bookmark
 *   - TikTok      → fetches via fxTikTok, inserts a 'video' bookmark
 *
 * Returns the created bookmark with the platform field so the client knows
 * where to redirect after save (`/?added=success&platform=...&id=...`).
 */

export const POST = withAuth(async (request: NextRequest, userId: string) => {
  try {
    const body = await request.json()
    const { url, source = 'manual' } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Detect the platform/id once via the shared detector (single source of
    // truth for the per-platform URL patterns).
    const detected = detectPlatformPost(url)

    // Dispatch based on detected platform
    if (detected?.platform === 'twitter') {
      // Delegate to the existing tweet-specific flow (FxTwitter resolver +
      // article + quote-tweet + facet URL handling are all baked in there).
      // The self-call MUST go over loopback: `request.url`'s public origin is
      // not reachable from inside the machine the same way it is from outside
      // (on Fly the app speaks plain HTTP on $PORT behind the proxy, so
      // dialing our own https:// origin fails the TLS handshake with
      // "wrong version number" and every tweet save 500s with fetch failed).
      const delegateUrl = new URL('/api/tweets/add', request.url)
      delegateUrl.protocol = 'http:'
      delegateUrl.host = `127.0.0.1:${process.env.PORT || delegateUrl.port || '3000'}`
      const tweetResponse = await fetchWithTimeout(delegateUrl.toString(), 10_000, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: request.headers.get('cookie') || '',
        },
        body: JSON.stringify({ url, source }),
      })
      const tweetData = await tweetResponse.json()
      return NextResponse.json(
        { ...tweetData, platform: 'twitter' },
        { status: tweetResponse.status },
      )
    }

    // YouTube Shorts only — watch / youtu.be / embed are regular videos.
    if (detected?.platform === 'youtube') {
      return await addYouTubeShort(userId, detected.id, source)
    }

    if (detected?.platform === 'instagram') {
      return await addInstagramPost(
        userId,
        detected.id,
        source,
        detected.previewPath.startsWith('/p/') ? 'post' : 'reel',
      )
    }

    // TikTok: canonical (@user/video/id) or a short link (vm./vt.tiktok.com).
    // resolveTikTokUrl handles both — canonical is parsed inline, short links
    // are followed server-side to their canonical form.
    if (detected?.platform === 'tiktok' || isTikTokShortLink(url)) {
      const resolved = await resolveTikTokUrl(url)
      if (resolved) {
        return await addTikTokVideo(userId, resolved.handle, resolved.videoId, source)
      }
    }

    return NextResponse.json(
      {
        error:
          'Unsupported URL. Supported: x.com, twitter.com, instagram.com/p or /reels, tiktok.com/@user/video, youtube.com/shorts.',
      },
      { status: 400 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add bookmark'
    return handleRouteError(error, { endpoint: '/api/bookmarks/add', userId, message })
  }
})

async function addInstagramPost(
  userId: string,
  postId: string,
  source: string,
  pathHint: 'post' | 'reel',
) {
  const [existing] = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.platform, 'instagram'),
        eq(bookmarks.id, postId),
      ),
    )
    .limit(1)

  const meta = await fetchInstagramMetadata(postId, pathHint)
  if (!meta) {
    if (existing) {
      const current = runInTransaction(
        () =>
          db
            .select()
            .from(bookmarks)
            .where(
              and(
                eq(bookmarks.userId, userId),
                eq(bookmarks.platform, 'instagram'),
                eq(bookmarks.id, postId),
              ),
            )
            .limit(1)
            .all()[0],
      )
      if (current) {
        return NextResponse.json(
          { success: false, isDuplicate: true, platform: 'instagram', bookmark: current },
          { status: 200 },
        )
      }
    }
    return NextResponse.json({ error: 'Instagram post not available' }, { status: 404 })
  }

  const contentType = meta.contentType
  const media = meta.media
  if (
    contentType === 'photo' &&
    (media.length === 0 || !media.every((item) => Boolean(item.imageUrl)))
  ) {
    return NextResponse.json({ error: 'Instagram images not available' }, { status: 404 })
  }
  const hasCompleteMediaReplacement =
    media.length > 0 &&
    media.every((item) => Boolean(item.imageUrl)) &&
    meta.mediaComplete !== false

  const now = new Date().toISOString()
  const handle = (meta.author || '').replace(/^@/, '') || 'instagram'
  const sourcePath = contentType === 'photo' ? 'p' : 'reel'
  const postUrl = `https://www.instagram.com/${sourcePath}/${postId}/`

  const result = runInTransaction(() => {
    const bookmarkInsert = db
      .insert(bookmarks)
      .values({
        id: postId,
        userId,
        platform: 'instagram',
        author: handle,
        authorName: meta.authorName || meta.author || null,
        authorProfileImageUrl: null,
        text: meta.caption || meta.description || '',
        tweetUrl: postUrl,
        createdAt: meta.takenAt || null,
        processedAt: now,
        category: contentType,
        source,
      })
      .onConflictDoNothing()
      .run()

    // A `/p/` URL used to be persisted as a Reel. Repair its routing/type on
    // the next save without changing this user's original saved-at timestamp
    // or overwriting content won by a concurrent insert.
    if (bookmarkInsert.changes === 0) {
      db.update(bookmarks)
        .set({ category: contentType, tweetUrl: postUrl })
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.platform, 'instagram'),
            eq(bookmarks.id, postId),
          ),
        )
        .run()
    }

    const duplicateHasMedia =
      bookmarkInsert.changes === 0 &&
      db
        .select({ id: bookmarkMedia.id })
        .from(bookmarkMedia)
        .where(
          and(
            eq(bookmarkMedia.userId, userId),
            eq(bookmarkMedia.platform, 'instagram'),
            eq(bookmarkMedia.bookmarkId, postId),
          ),
        )
        .limit(1)
        .all().length > 0

    // Replace the ordered child set atomically when the post is new, the
    // duplicate has no media to preserve, or the resolver returned a complete
    // Relay set. OpenGraph only exposes the lead image and must not collapse a
    // richer saved carousel.
    if (
      bookmarkInsert.changes > 0 ||
      (media.length > 0 && (!duplicateHasMedia || hasCompleteMediaReplacement))
    ) {
      db.delete(bookmarkMedia)
        .where(
          and(
            eq(bookmarkMedia.userId, userId),
            eq(bookmarkMedia.platform, 'instagram'),
            eq(bookmarkMedia.bookmarkId, postId),
          ),
        )
        .run()

      media.forEach((item, index) => {
        // Mixed `/p/` carousel videos currently have a reliable poster but no
        // indexed child-video stream. Persist them as poster-only photo slides
        // so feed/theater never point several children at the container MP4.
        const persistedType = contentType === 'photo' ? 'photo' : item.type
        db.insert(bookmarkMedia)
          .values({
            // Preserve the legacy Reel row id so existing references reconcile.
            id:
              contentType === 'video' && index === 0
                ? `${postId}_photo_0`
                : `${postId}_${persistedType}_${index}`,
            userId,
            platform: 'instagram',
            bookmarkId: postId,
            mediaType: persistedType,
            originalUrl: item.imageUrl || postUrl,
            previewUrl: item.imageUrl || null,
            width: item.width,
            height: item.height,
            altText: item.altText,
          })
          .run()
      })
    }

    return {
      inserted: bookmarkInsert.changes > 0,
      bookmark: db
        .select()
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.platform, 'instagram'),
            eq(bookmarks.id, postId),
          ),
        )
        .limit(1)
        .all()[0],
    }
  })

  if (!result.inserted) {
    return NextResponse.json(
      { success: false, isDuplicate: true, platform: 'instagram', bookmark: result.bookmark },
      { status: 200 },
    )
  }

  metrics.bookmarkAdded(source as 'manual' | 'url_prefix')

  recordActivity({
    action: 'save',
    platform: 'instagram',
    bookmarkId: postId,
    author: handle,
    authorName: meta.authorName || meta.author || null,
    text: meta.caption || meta.description || null,
    thumbnailUrl: meta.imageUrl
      ? `/api/media/instagram/thumbnail?id=${encodeURIComponent(postId)}`
      : null,
    contentType,
    url: previewPath('instagram', handle, postId, contentType),
    userId,
    source: source as 'manual' | 'url_prefix' | 'pwa_share',
  })

  return NextResponse.json({
    success: true,
    isDuplicate: false,
    platform: 'instagram',
    bookmark: result.bookmark,
    message: `${contentType === 'photo' ? 'Instagram post' : 'Reel'} added to Saved.`,
  })
}

async function addTikTokVideo(userId: string, handle: string, videoId: string, source: string) {
  const [existing] = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.platform, 'tiktok'),
        eq(bookmarks.id, videoId),
      ),
    )
    .limit(1)

  const meta = await fetchTikTokMetadata(handle, videoId)
  if (!meta) {
    if (existing) {
      const current = runInTransaction(
        () =>
          db
            .select()
            .from(bookmarks)
            .where(
              and(
                eq(bookmarks.userId, userId),
                eq(bookmarks.platform, 'tiktok'),
                eq(bookmarks.id, videoId),
              ),
            )
            .limit(1)
            .all()[0],
      )
      if (current) {
        return NextResponse.json(
          { success: false, isDuplicate: true, platform: 'tiktok', bookmark: current },
          { status: 200 },
        )
      }
    }
    return NextResponse.json({ error: 'TikTok not available' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const tiktokUrl = `https://www.tiktok.com/@${handle}/video/${videoId}`

  const result = runInTransaction(() => {
    const bookmarkInsert = db
      .insert(bookmarks)
      .values({
        id: videoId,
        userId,
        platform: 'tiktok',
        author: handle,
        authorName: meta.authorName || null,
        authorProfileImageUrl: null,
        text: meta.description || meta.title || '',
        tweetUrl: tiktokUrl,
        // tnktok metadata carries no date, but TikTok ids are Snowflake-style.
        createdAt: tiktokCreatedAtFromId(videoId),
        processedAt: now,
        category: 'video',
        source,
      })
      .onConflictDoNothing()
      .run()

    if (meta.videoUrl) {
      db.insert(bookmarkMedia)
        .values({
          id: `${videoId}_video_0`,
          userId,
          platform: 'tiktok',
          bookmarkId: videoId,
          mediaType: 'video',
          originalUrl: meta.videoUrl,
        })
        .onConflictDoUpdate({
          target: [bookmarkMedia.userId, bookmarkMedia.platform, bookmarkMedia.id],
          set: {
            bookmarkId: videoId,
            mediaType: 'video',
            originalUrl: meta.videoUrl,
          },
        })
        .run()
    }

    return {
      inserted: bookmarkInsert.changes > 0,
      bookmark: db
        .select()
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.platform, 'tiktok'),
            eq(bookmarks.id, videoId),
          ),
        )
        .limit(1)
        .all()[0],
    }
  })

  if (!result.inserted) {
    return NextResponse.json(
      { success: false, isDuplicate: true, platform: 'tiktok', bookmark: result.bookmark },
      { status: 200 },
    )
  }

  metrics.bookmarkAdded(source as 'manual' | 'url_prefix')

  recordActivity({
    action: 'save',
    platform: 'tiktok',
    bookmarkId: videoId,
    author: handle,
    authorName: meta.authorName || null,
    text: meta.description || meta.title || null,
    thumbnailUrl: null, // tnktok exposes no poster; card falls back to the glyph
    url: previewPath('tiktok', handle, videoId),
    userId,
    source: source as 'manual' | 'url_prefix' | 'pwa_share',
  })

  return NextResponse.json({
    success: true,
    isDuplicate: false,
    platform: 'tiktok',
    bookmark: result.bookmark,
    message: 'TikTok added to Saved.',
  })
}

async function addYouTubeShort(userId: string, videoId: string, source: string) {
  const [existing] = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.platform, 'youtube'),
        eq(bookmarks.id, videoId),
      ),
    )
    .limit(1)

  const now = new Date().toISOString()
  let bookmarkValues: typeof bookmarks.$inferInsert
  if (existing) {
    bookmarkValues = { ...existing, processedAt: now, source }
  } else {
    const meta = await fetchYouTubeMetadata(videoId)
    if (!meta) {
      return NextResponse.json({ error: 'YouTube video not available' }, { status: 404 })
    }
    const handle = (meta.author || '').replace(/^@/, '') || meta.authorName || 'youtube'
    bookmarkValues = {
      id: videoId,
      userId,
      platform: 'youtube',
      author: handle,
      authorName: meta.authorName || null,
      authorProfileImageUrl: null,
      text: meta.title || '',
      tweetUrl: youtubeShortUrl(videoId),
      processedAt: now,
      category: 'video',
      source,
    }
  }

  const result = runInTransaction(() => {
    const bookmarkInsert = db.insert(bookmarks).values(bookmarkValues).onConflictDoNothing().run()

    // Playback is the official iframe embed, so this deterministic media row
    // stores the poster and is reconciled on every retry.
    db.insert(bookmarkMedia)
      .values({
        id: `${videoId}_video_0`,
        userId,
        platform: 'youtube',
        bookmarkId: videoId,
        mediaType: 'video',
        originalUrl: youtubeShortUrl(videoId),
        previewUrl: youtubeThumbnail(videoId),
      })
      .onConflictDoUpdate({
        target: [bookmarkMedia.userId, bookmarkMedia.platform, bookmarkMedia.id],
        set: {
          bookmarkId: videoId,
          mediaType: 'video',
          originalUrl: youtubeShortUrl(videoId),
          previewUrl: youtubeThumbnail(videoId),
        },
      })
      .run()

    return {
      inserted: bookmarkInsert.changes > 0,
      bookmark: db
        .select()
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.platform, 'youtube'),
            eq(bookmarks.id, videoId),
          ),
        )
        .limit(1)
        .all()[0],
    }
  })

  if (!result.inserted) {
    return NextResponse.json(
      { success: false, isDuplicate: true, platform: 'youtube', bookmark: result.bookmark },
      { status: 200 },
    )
  }

  metrics.bookmarkAdded(source as 'manual' | 'url_prefix')

  recordActivity({
    action: 'save',
    platform: 'youtube',
    bookmarkId: videoId,
    author: bookmarkValues.author,
    authorName: bookmarkValues.authorName || null,
    text: bookmarkValues.text || null,
    thumbnailUrl: youtubeThumbnail(videoId),
    url: previewPath('youtube', bookmarkValues.author, videoId),
    userId,
    source: source as 'manual' | 'url_prefix' | 'pwa_share',
  })

  return NextResponse.json({
    success: true,
    isDuplicate: false,
    platform: 'youtube',
    bookmark: result.bookmark,
    message: 'YouTube Short added to Saved.',
  })
}
