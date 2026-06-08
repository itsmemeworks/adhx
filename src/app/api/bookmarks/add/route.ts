import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkMedia } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { withAuth } from '@/lib/api/with-auth'
import { metrics } from '@/lib/sentry'
import { handleRouteError } from '@/lib/api/response'
import { fetchReelMetadata } from '@/lib/media/instafix'
import { fetchTikTokMetadata, resolveTikTokUrl, isTikTokShortLink } from '@/lib/media/tnktok'
import { fetchYouTubeMetadata, youtubeThumbnail, youtubeShortUrl } from '@/lib/media/youtube'
import { recordActivity, previewPath } from '@/lib/activity/record'
import { detectPlatformPost } from '@/lib/platform/url'

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
      const tweetResponse = await fetch(new URL('/api/tweets/add', request.url).toString(), {
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

    // YouTube (Shorts + regular videos) — the detector matches the host and
    // pulls the id from any of /shorts, /watch?v=, youtu.be, /embed.
    if (detected?.platform === 'youtube') {
      return await addYouTubeShort(userId, detected.id, source)
    }

    if (detected?.platform === 'instagram') {
      return await addInstagramReel(userId, detected.id, source)
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
          'Unsupported URL. Supported: x.com, twitter.com, instagram.com/reels, tiktok.com/@user/video.',
      },
      { status: 400 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add bookmark'
    return handleRouteError(error, { endpoint: '/api/bookmarks/add', userId, message })
  }
})

async function addInstagramReel(userId: string, reelId: string, source: string) {
  // Check duplicate (composite key: userId + platform + id)
  const [existing] = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.platform, 'instagram'),
        eq(bookmarks.id, reelId),
      ),
    )
    .limit(1)

  if (existing) {
    // Already saved — but the user still *acted* on it (re-added), so surface it
    // in the Latest pulse. Without this, re-adding a saved item is invisible to
    // Trending/Latest (the "missed loop"). recordActivity de-dupes within 60s.
    recordActivity({
      action: 'save',
      platform: 'instagram',
      bookmarkId: reelId,
      author: existing.author,
      authorName: existing.authorName,
      text: existing.text || null,
      thumbnailUrl: `/api/media/instagram/thumbnail?id=${encodeURIComponent(reelId)}`,
      url: previewPath('instagram', existing.author, reelId),
      userId,
    })
    return NextResponse.json(
      { success: false, isDuplicate: true, platform: 'instagram', bookmark: existing },
      { status: 200 },
    )
  }

  const meta = await fetchReelMetadata(reelId)
  if (!meta) {
    return NextResponse.json({ error: 'Reel not available' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const handle = (meta.author || '').replace(/^@/, '') || 'instagram'
  const reelUrl = `https://www.instagram.com/reel/${reelId}/`

  await db.insert(bookmarks).values({
    id: reelId,
    userId,
    platform: 'instagram',
    author: handle,
    authorName: meta.authorName || meta.author || null,
    authorProfileImageUrl: null,
    text: meta.caption || meta.description || '',
    tweetUrl: reelUrl,
    processedAt: now,
    category: 'video',
    source,
  })

  // Store a 'video' media row: the Reel plays inline via the IG video proxy
  // (resolved from the reel id through the mirror registry), with `meta.imageUrl`
  // as the poster — served fresh via the thumbnail proxy (the stored CDN URL is
  // signed/expiring). Falls back to the poster if the mirror is unavailable. The
  // id keeps the historical `_photo_0` suffix so it dedupes (onConflictDoNothing)
  // against rows the photo→video backfill (migrate.ts) already flipped.
  if (meta.imageUrl) {
    await db
      .insert(bookmarkMedia)
      .values({
        id: `${reelId}_photo_0`,
        userId,
        platform: 'instagram',
        bookmarkId: reelId,
        mediaType: 'video',
        originalUrl: meta.imageUrl,
        previewUrl: meta.imageUrl,
      })
      .onConflictDoNothing()
  }

  metrics.bookmarkAdded(source as 'manual' | 'url_prefix')

  recordActivity({
    action: 'save',
    platform: 'instagram',
    bookmarkId: reelId,
    author: handle,
    authorName: meta.authorName || meta.author || null,
    text: meta.caption || meta.description || null,
    thumbnailUrl: meta.imageUrl
      ? `/api/media/instagram/thumbnail?id=${encodeURIComponent(reelId)}`
      : null,
    url: previewPath('instagram', handle, reelId),
    userId,
  })

  const [newBookmark] = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.platform, 'instagram'),
        eq(bookmarks.id, reelId),
      ),
    )
    .limit(1)

  return NextResponse.json({
    success: true,
    isDuplicate: false,
    platform: 'instagram',
    bookmark: newBookmark,
    message: 'Reel added to your collection.',
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

  if (existing) {
    // Already saved — still record the re-add so it surfaces in Latest/Trending
    // (see addInstagramReel for the rationale). De-duped within 60s.
    recordActivity({
      action: 'save',
      platform: 'tiktok',
      bookmarkId: videoId,
      author: existing.author,
      authorName: existing.authorName,
      text: existing.text || null,
      thumbnailUrl: null, // tnktok exposes no poster; card falls back to the glyph
      url: previewPath('tiktok', existing.author, videoId),
      userId,
    })
    return NextResponse.json(
      { success: false, isDuplicate: true, platform: 'tiktok', bookmark: existing },
      { status: 200 },
    )
  }

  const meta = await fetchTikTokMetadata(handle, videoId)
  if (!meta) {
    return NextResponse.json({ error: 'TikTok not available' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const tiktokUrl = `https://www.tiktok.com/@${handle}/video/${videoId}`

  await db.insert(bookmarks).values({
    id: videoId,
    userId,
    platform: 'tiktok',
    author: handle,
    authorName: meta.authorName || null,
    authorProfileImageUrl: null,
    text: meta.description || meta.title || '',
    tweetUrl: tiktokUrl,
    processedAt: now,
    category: 'video',
    source,
  })

  if (meta.videoUrl) {
    await db
      .insert(bookmarkMedia)
      .values({
        id: `${videoId}_video_0`,
        userId,
        platform: 'tiktok',
        bookmarkId: videoId,
        mediaType: 'video',
        originalUrl: meta.videoUrl,
      })
      .onConflictDoNothing()
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
  })

  const [newBookmark] = await db
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

  return NextResponse.json({
    success: true,
    isDuplicate: false,
    platform: 'tiktok',
    bookmark: newBookmark,
    message: 'TikTok added to your collection.',
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

  if (existing) {
    // Already saved — still record the re-add so it surfaces in Latest/Trending
    // (see addInstagramReel for the rationale). De-duped within 60s.
    recordActivity({
      action: 'save',
      platform: 'youtube',
      bookmarkId: videoId,
      author: existing.author,
      authorName: existing.authorName,
      text: existing.text || null,
      thumbnailUrl: youtubeThumbnail(videoId),
      url: previewPath('youtube', existing.author, videoId),
      userId,
    })
    return NextResponse.json(
      { success: false, isDuplicate: true, platform: 'youtube', bookmark: existing },
      { status: 200 },
    )
  }

  const meta = await fetchYouTubeMetadata(videoId)
  if (!meta) {
    return NextResponse.json({ error: 'YouTube video not available' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const handle = (meta.author || '').replace(/^@/, '') || meta.authorName || 'youtube'

  await db.insert(bookmarks).values({
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
  })

  // Store the poster as a 'video' media row. Playback is the official iframe
  // embed (resolved in MediaCard from platform+id), so there's no MP4 to store.
  await db
    .insert(bookmarkMedia)
    .values({
      id: `${videoId}_video_0`,
      userId,
      platform: 'youtube',
      bookmarkId: videoId,
      mediaType: 'video',
      originalUrl: youtubeShortUrl(videoId),
      previewUrl: youtubeThumbnail(videoId),
    })
    .onConflictDoNothing()

  metrics.bookmarkAdded(source as 'manual' | 'url_prefix')

  recordActivity({
    action: 'save',
    platform: 'youtube',
    bookmarkId: videoId,
    author: handle,
    authorName: meta.authorName || null,
    text: meta.title || null,
    thumbnailUrl: youtubeThumbnail(videoId),
    url: previewPath('youtube', handle, videoId),
    userId,
  })

  const [newBookmark] = await db
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

  return NextResponse.json({
    success: true,
    isDuplicate: false,
    platform: 'youtube',
    bookmark: newBookmark,
    message: 'YouTube Short added to your collection.',
  })
}
