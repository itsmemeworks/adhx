import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkMedia } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'
import { captureException, metrics } from '@/lib/sentry'
import { fetchReelMetadata } from '@/lib/media/instafix'
import { fetchTikTokMetadata, resolveTikTokUrl, isTikTokShortLink } from '@/lib/media/tnktok'

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

const INSTAGRAM_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/i

const TIKTOK_PATTERN =
  /(?:https?:\/\/)?(?:www\.|vm\.|m\.)?tiktok\.com\/@([A-Za-z0-9._]{1,30})\/video\/(\d{6,25})/i

const TWITTER_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/(\w{1,15})\/status\/(\d+)/i

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { url, source = 'manual' } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Dispatch based on detected platform
    if (TWITTER_PATTERN.test(url)) {
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
      return NextResponse.json({ ...tweetData, platform: 'twitter' }, { status: tweetResponse.status })
    }

    const reelMatch = url.match(INSTAGRAM_PATTERN)
    if (reelMatch) {
      return await addInstagramReel(userId, reelMatch[1], source)
    }

    // TikTok: canonical (@user/video/id) or a short link (vm./vt.tiktok.com).
    // resolveTikTokUrl handles both — canonical is parsed inline, short links
    // are followed server-side to their canonical form.
    if (TIKTOK_PATTERN.test(url) || isTikTokShortLink(url)) {
      const resolved = await resolveTikTokUrl(url)
      if (resolved) {
        return await addTikTokVideo(userId, resolved.handle, resolved.videoId, source)
      }
    }

    return NextResponse.json(
      { error: 'Unsupported URL. Supported: x.com, twitter.com, instagram.com/reels, tiktok.com/@user/video.' },
      { status: 400 },
    )
  } catch (error) {
    console.error('Failed to add bookmark:', error)
    captureException(error, { endpoint: '/api/bookmarks/add' })
    const message = error instanceof Error ? error.message : 'Failed to add bookmark'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function addInstagramReel(userId: string, reelId: string, source: string) {
  // Check duplicate (composite key: userId + platform + id)
  const [existing] = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.platform, 'instagram'), eq(bookmarks.id, reelId)))
    .limit(1)

  if (existing) {
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
  const author = (meta.author || '').replace(/^@/, '') || 'instagram'
  const reelUrl = `https://www.instagram.com/reels/${reelId}/`

  await db.insert(bookmarks).values({
    id: reelId,
    userId,
    platform: 'instagram',
    author,
    authorName: meta.author || null,
    authorProfileImageUrl: null,
    text: meta.description || meta.title || '',
    tweetUrl: reelUrl,
    processedAt: now,
    category: 'video',
    source,
  })

  if (meta.videoUrl) {
    await db.insert(bookmarkMedia).values({
      id: `${reelId}_video_0`,
      userId,
      platform: 'instagram',
      bookmarkId: reelId,
      mediaType: 'video',
      originalUrl: meta.videoUrl,
      previewUrl: meta.imageUrl || null,
    }).onConflictDoNothing()
  }

  metrics.bookmarkAdded(source as 'manual' | 'url_prefix')

  const [newBookmark] = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.platform, 'instagram'), eq(bookmarks.id, reelId)))
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
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.platform, 'tiktok'), eq(bookmarks.id, videoId)))
    .limit(1)

  if (existing) {
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
    await db.insert(bookmarkMedia).values({
      id: `${videoId}_video_0`,
      userId,
      platform: 'tiktok',
      bookmarkId: videoId,
      mediaType: 'video',
      originalUrl: meta.videoUrl,
    }).onConflictDoNothing()
  }

  metrics.bookmarkAdded(source as 'manual' | 'url_prefix')

  const [newBookmark] = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.platform, 'tiktok'), eq(bookmarks.id, videoId)))
    .limit(1)

  return NextResponse.json({
    success: true,
    isDuplicate: false,
    platform: 'tiktok',
    bookmark: newBookmark,
    message: 'TikTok added to your collection.',
  })
}
