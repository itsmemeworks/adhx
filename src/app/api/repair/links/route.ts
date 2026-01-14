import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkLinks } from '@/lib/db/schema'
import { notInArray, sql, eq, and } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'

interface TwitterUrl {
  url: string
  expandedUrl: string
  displayUrl?: string
}

interface RawTweet {
  entities?: {
    urls?: TwitterUrl[]
  }
}

// POST /api/repair/links - Backfill bookmark_links from rawJson
export async function POST() {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all bookmarks that don't have links yet (filtered by userId)
    const bookmarksWithLinks = await db
      .select({ bookmarkId: bookmarkLinks.bookmarkId })
      .from(bookmarkLinks)
      .where(eq(bookmarkLinks.userId, userId))
      .groupBy(bookmarkLinks.bookmarkId)

    const bookmarkIdsWithLinks = bookmarksWithLinks.map((b) => b.bookmarkId)

    // Get bookmarks without links (filtered by userId)
    let bookmarksToProcess
    if (bookmarkIdsWithLinks.length > 0) {
      bookmarksToProcess = await db
        .select({ id: bookmarks.id, rawJson: bookmarks.rawJson })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), notInArray(bookmarks.id, bookmarkIdsWithLinks)))
    } else {
      bookmarksToProcess = await db
        .select({ id: bookmarks.id, rawJson: bookmarks.rawJson })
        .from(bookmarks)
        .where(eq(bookmarks.userId, userId))
    }

    let linksAdded = 0
    let bookmarksProcessed = 0

    for (const bookmark of bookmarksToProcess) {
      if (!bookmark.rawJson) continue

      try {
        const rawTweet: RawTweet = JSON.parse(bookmark.rawJson)
        const urls = rawTweet.entities?.urls || []

        for (const url of urls) {
          if (!url.url || !url.expandedUrl) continue

          // Extract domain
          let domain = ''
          try {
            const parsed = new URL(url.expandedUrl)
            domain = parsed.hostname.replace('www.', '')
          } catch {
            // Invalid URL
          }

          // Determine link type
          const linkType = determineLinkType(url.expandedUrl)

          // Insert link (include userId)
          await db.insert(bookmarkLinks).values({
            userId,
            bookmarkId: bookmark.id,
            originalUrl: url.url,
            expandedUrl: url.expandedUrl,
            domain,
            linkType,
          }).onConflictDoNothing()

          linksAdded++
        }

        bookmarksProcessed++
      } catch (e) {
        console.error(`Error processing bookmark ${bookmark.id}:`, e)
      }
    }

    return NextResponse.json({
      success: true,
      bookmarksProcessed,
      linksAdded,
      message: `Processed ${bookmarksProcessed} bookmarks, added ${linksAdded} links`,
    })
  } catch (error) {
    console.error('Repair links error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function determineLinkType(url: string): string {
  const lower = url.toLowerCase()

  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'tweet'
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'video'
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(lower)) return 'image'
  if (/\.(mp4|webm|mov)$/i.test(lower)) return 'media'

  return 'link'
}

// GET /api/repair/links - Check status
export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // All queries filtered by userId for multi-user support
  const totalBookmarks = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))

  const bookmarksWithLinksCount = await db
    .select({ count: sql<number>`count(distinct ${bookmarkLinks.bookmarkId})` })
    .from(bookmarkLinks)
    .where(eq(bookmarkLinks.userId, userId))

  const totalLinks = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookmarkLinks)
    .where(eq(bookmarkLinks.userId, userId))

  return NextResponse.json({
    totalBookmarks: totalBookmarks[0]?.count || 0,
    bookmarksWithLinks: bookmarksWithLinksCount[0]?.count || 0,
    totalLinks: totalLinks[0]?.count || 0,
  })
}
