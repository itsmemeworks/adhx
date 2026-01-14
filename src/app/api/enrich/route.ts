import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkLinks } from '@/lib/db/schema'
import { eq, isNull, and, sql } from 'drizzle-orm'
import { fetchTweetData, extractEnrichmentData } from '@/lib/media/fxembed'

// POST /api/enrich - Enrich bookmarks with FxTwitter data (author avatars, article previews)
// Query params:
//   ?mode=articles - Re-enrich articles that are missing content
//   (default) - Enrich bookmarks missing author profile image
export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('mode')
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        let bookmarksToEnrich: { id: string; author: string }[]

        if (mode === 'articles') {
          // Find articles with missing content - either no link entry or no contentJson
          const articlesWithMissingContent = await db
            .select({
              id: bookmarks.id,
              author: bookmarks.author,
            })
            .from(bookmarks)
            .leftJoin(bookmarkLinks, and(
              eq(bookmarkLinks.bookmarkId, bookmarks.id),
              eq(bookmarkLinks.linkType, 'article')
            ))
            .where(
              and(
                eq(bookmarks.category, 'article'),
                sql`(${bookmarkLinks.contentJson} IS NULL OR ${bookmarkLinks.id} IS NULL)`
              )
            )
          bookmarksToEnrich = articlesWithMissingContent
        } else {
          // Default: Find ALL bookmarks missing author profile image (no limit - process everything)
          bookmarksToEnrich = await db
            .select({
              id: bookmarks.id,
              author: bookmarks.author,
            })
            .from(bookmarks)
            .where(isNull(bookmarks.authorProfileImageUrl))
        }

        send('start', {
          total: bookmarksToEnrich.length,
          message: `Enriching ${bookmarksToEnrich.length} bookmarks...`,
        })

        let enriched = 0
        let failed = 0

        for (const bookmark of bookmarksToEnrich) {
          try {
            // Fetch data from FxTwitter API
            const fxData = await fetchTweetData(bookmark.author, bookmark.id)
            const enrichment = fxData ? extractEnrichmentData(fxData) : null

            if (enrichment) {
              // Update bookmark with author profile image
              await db
                .update(bookmarks)
                .set({
                  authorProfileImageUrl: enrichment.authorProfileImageUrl,
                  authorName: enrichment.authorName || undefined,
                })
                .where(eq(bookmarks.id, bookmark.id))

              // Get preview data - prefer article over external
              const previewData = enrichment.article || enrichment.external

              // If there's preview data (article or external), update the bookmark_links
              if (previewData) {
                // For articles, prepare content JSON with full article content including entityMap
                const articleContentJson = enrichment.article?.content
                  ? JSON.stringify(enrichment.article.content)
                  : null

                // Find existing article link specifically for article enrichment
                const existingArticleLinks = await db
                  .select()
                  .from(bookmarkLinks)
                  .where(and(
                    eq(bookmarkLinks.bookmarkId, bookmark.id),
                    eq(bookmarkLinks.linkType, 'article')
                  ))
                  .limit(1)

                // Also check for any other existing links
                const existingLinks = existingArticleLinks.length > 0 ? existingArticleLinks : await db
                  .select()
                  .from(bookmarkLinks)
                  .where(eq(bookmarkLinks.bookmarkId, bookmark.id))
                  .limit(1)

                if (existingLinks.length > 0) {
                  // Update existing link with preview data
                  await db
                    .update(bookmarkLinks)
                    .set({
                      previewTitle: previewData.title,
                      previewDescription: previewData.description,
                      previewImageUrl: previewData.imageUrl,
                      // For articles, also fix the expanded URL, link type, and store content
                      ...(enrichment.article && previewData.url ? {
                        expandedUrl: previewData.url,
                        linkType: 'article',
                      } : {}),
                      ...(articleContentJson ? { contentJson: articleContentJson } : {}),
                    })
                    .where(eq(bookmarkLinks.id, existingLinks[0].id))
                } else if (enrichment.article && previewData.url) {
                  // For X articles without existing links, create a new link entry
                  await db.insert(bookmarkLinks).values({
                    bookmarkId: bookmark.id,
                    expandedUrl: previewData.url,
                    domain: 'x.com',
                    linkType: 'article',
                    previewTitle: previewData.title,
                    previewDescription: previewData.description,
                    previewImageUrl: previewData.imageUrl,
                    contentJson: articleContentJson,
                  })
                }
              }

              enriched++
            } else {
              // Mark as processed even if we couldn't fetch data (set empty string)
              await db
                .update(bookmarks)
                .set({ authorProfileImageUrl: '' })
                .where(eq(bookmarks.id, bookmark.id))
              failed++
            }

            send('progress', {
              current: enriched + failed,
              total: bookmarksToEnrich.length,
              enriched,
              failed,
            })

            // Rate limit: wait 100ms between requests
            await new Promise((resolve) => setTimeout(resolve, 100))
          } catch (error) {
            console.error(`Failed to enrich bookmark ${bookmark.id}:`, error)
            failed++
          }
        }

        // Check how many bookmarks still need enrichment
        const [remaining] = await db
          .select({ count: sql<number>`count(*)` })
          .from(bookmarks)
          .where(isNull(bookmarks.authorProfileImageUrl))

        send('complete', {
          enriched,
          failed,
          remaining: remaining?.count || 0,
        })
      } catch (error) {
        console.error('Enrichment error:', error)
        send('error', {
          message: error instanceof Error ? error.message : 'Failed to enrich bookmarks',
        })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// GET /api/enrich - Get enrichment status
export async function GET() {
  try {
    const [total] = await db.select({ count: sql<number>`count(*)` }).from(bookmarks)
    const [enriched] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookmarks)
      .where(sql`${bookmarks.authorProfileImageUrl} IS NOT NULL AND ${bookmarks.authorProfileImageUrl} != ''`)
    const [needsEnrichment] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookmarks)
      .where(isNull(bookmarks.authorProfileImageUrl))

    return NextResponse.json({
      total: total?.count || 0,
      enriched: enriched?.count || 0,
      needsEnrichment: needsEnrichment?.count || 0,
    })
  } catch (error) {
    console.error('Error getting enrichment status:', error)
    return NextResponse.json({ error: 'Failed to get enrichment status' }, { status: 500 })
  }
}
