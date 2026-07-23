import { NextResponse } from 'next/server'
import { db, runInTransaction } from '@/lib/db'
import {
  tagShares,
  bookmarkTags,
  bookmarks,
  bookmarkMedia,
  bookmarkLinks,
  oauthTokens,
} from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { withAuth } from '@/lib/api/with-auth'

const MAX_CLONE_SIZE = 100

/** Composite key matching the (platform, bookmarkId) tuple used across bookmark-derived tables. */
function pairKey(platform: string, bookmarkId: string): string {
  return `${platform}:${bookmarkId}`
}

/**
 * POST /api/share/tag/by-name/[username]/[tag]/clone
 * Clone a shared tag collection to the current user's account
 */
export const POST = withAuth(
  async (
    _request,
    currentUserId,
    { params }: { params: Promise<{ username: string; tag: string }> },
  ) => {
    try {
      const { username, tag: tagName } = await params

      // Find user by username
      const [user] = await db
        .select({ userId: oauthTokens.userId })
        .from(oauthTokens)
        .where(eq(oauthTokens.username, username))
        .limit(1)

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      // Find tag share
      const [share] = await db
        .select()
        .from(tagShares)
        .where(and(eq(tagShares.userId, user.userId), eq(tagShares.tag, tagName)))
        .limit(1)

      if (!share) {
        return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
      }

      if (!share.isPublic) {
        return NextResponse.json({ error: 'This tag is private' }, { status: 403 })
      }

      // Prevent self-cloning
      if (share.userId === currentUserId) {
        return NextResponse.json({ error: 'Cannot clone your own tag' }, { status: 400 })
      }

      const sourceUserId = share.userId

      // Get all (platform, bookmarkId) pairs tagged by the source user. A bare bookmarkId
      // isn't unique across platforms (composite key is userId+platform+bookmarkId+tag), so
      // every lookup below must match on the pair, not just the id.
      const sourceTaggedBookmarks = await db
        .select({ bookmarkId: bookmarkTags.bookmarkId, platform: bookmarkTags.platform })
        .from(bookmarkTags)
        .where(and(eq(bookmarkTags.userId, sourceUserId), eq(bookmarkTags.tag, tagName)))

      if (sourceTaggedBookmarks.length === 0) {
        return NextResponse.json({
          success: true,
          clonedCount: 0,
          message: 'No bookmarks to clone',
        })
      }

      if (sourceTaggedBookmarks.length > MAX_CLONE_SIZE) {
        return NextResponse.json(
          { error: `Cannot clone more than ${MAX_CLONE_SIZE} bookmarks at once` },
          { status: 400 },
        )
      }

      const taggedPairKeys = new Set(
        sourceTaggedBookmarks.map((t) => pairKey(t.platform, t.bookmarkId)),
      )
      // Dedup (platform, bookmarkId) pairs for the tag-insert step below.
      const pairsToTagMap = new Map<string, { platform: string; bookmarkId: string }>()
      for (const t of sourceTaggedBookmarks) {
        pairsToTagMap.set(pairKey(t.platform, t.bookmarkId), {
          platform: t.platform,
          bookmarkId: t.bookmarkId,
        })
      }
      const pairsToTag = [...pairsToTagMap.values()]
      const sourceBookmarkIds = [...new Set(sourceTaggedBookmarks.map((t) => t.bookmarkId))]

      // Get source bookmarks (filtered down to the tagged pairs — inArray on id alone can
      // over-match across platforms since ids aren't globally unique)
      const sourceBookmarksRaw = await db
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, sourceUserId), inArray(bookmarks.id, sourceBookmarkIds)))
      const sourceBookmarks = sourceBookmarksRaw.filter((b) =>
        taggedPairKeys.has(pairKey(b.platform, b.id)),
      )

      // Get source media
      const sourceMediaRaw = await db
        .select()
        .from(bookmarkMedia)
        .where(
          and(
            eq(bookmarkMedia.userId, sourceUserId),
            inArray(bookmarkMedia.bookmarkId, sourceBookmarkIds),
          ),
        )
      const sourceMedia = sourceMediaRaw.filter((m) =>
        taggedPairKeys.has(pairKey(m.platform, m.bookmarkId)),
      )

      // Get source links
      const sourceLinksRaw = await db
        .select()
        .from(bookmarkLinks)
        .where(
          and(
            eq(bookmarkLinks.userId, sourceUserId),
            inArray(bookmarkLinks.bookmarkId, sourceBookmarkIds),
          ),
        )
      const sourceLinks = sourceLinksRaw.filter((l) =>
        taggedPairKeys.has(pairKey(l.platform, l.bookmarkId)),
      )

      // Check which (platform, bookmarkId) pairs the user already has
      const existingBookmarksRaw = await db
        .select({ id: bookmarks.id, platform: bookmarks.platform })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, currentUserId), inArray(bookmarks.id, sourceBookmarkIds)))
      const existingPairKeys = new Set(existingBookmarksRaw.map((b) => pairKey(b.platform, b.id)))

      // Clone bookmarks that don't exist
      const newBookmarks = sourceBookmarks.filter(
        (b) => !existingPairKeys.has(pairKey(b.platform, b.id)),
      )
      const newBookmarkPairKeys = new Set(newBookmarks.map((b) => pairKey(b.platform, b.id)))

      // Media/links for new bookmarks only
      const newMedia = sourceMedia.filter((m) =>
        newBookmarkPairKeys.has(pairKey(m.platform, m.bookmarkId)),
      )
      const newLinks = sourceLinks.filter((l) =>
        newBookmarkPairKeys.has(pairKey(l.platform, l.bookmarkId)),
      )

      // All writes happen atomically — if any insert fails, none of them persist.
      runInTransaction(() => {
        if (newBookmarks.length > 0) {
          db.insert(bookmarks)
            .values(
              newBookmarks.map((b) => ({
                ...b,
                userId: currentUserId,
                source: 'clone' as const,
              })),
            )
            .run()
        }

        if (newMedia.length > 0) {
          db.insert(bookmarkMedia)
            .values(
              newMedia.map((m) => ({
                ...m,
                userId: currentUserId,
              })),
            )
            .run()
        }

        if (newLinks.length > 0) {
          db.insert(bookmarkLinks)
            .values(
              newLinks.map((l) => ({
                userId: currentUserId,
                platform: l.platform,
                bookmarkId: l.bookmarkId,
                originalUrl: l.originalUrl,
                expandedUrl: l.expandedUrl,
                linkType: l.linkType,
                domain: l.domain,
                contentJson: l.contentJson,
                previewTitle: l.previewTitle,
                previewDescription: l.previewDescription,
                previewImageUrl: l.previewImageUrl,
              })),
            )
            .run()
        }

        // Add tag to all cloned bookmarks (both new and already-owned)
        db.insert(bookmarkTags)
          .values(
            pairsToTag.map((pair) => ({
              userId: currentUserId,
              platform: pair.platform,
              bookmarkId: pair.bookmarkId,
              tag: tagName,
            })),
          )
          .onConflictDoNothing()
          .run()
      })

      return NextResponse.json({
        success: true,
        clonedCount: newBookmarks.length,
        taggedCount: pairsToTag.length,
      })
    } catch (error) {
      console.error('Error cloning tag:', error)
      return NextResponse.json({ error: 'Failed to clone tag' }, { status: 500 })
    }
  },
)
