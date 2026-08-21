import { db } from '@/lib/db'
import { collectionEvents, tagShares } from '@/lib/db/schema'
import { and, eq, gt } from 'drizzle-orm'

/**
 * The Discovery leaderboard event log (docs/specs/discovery-leaderboards.md §3–§4).
 *
 * Records `view`/`clone` events against a public collection — keyed by
 * `(ownerUserId, tag)`, not `(platform, bookmarkId)`, so this is its own log
 * rather than nullable columns bolted onto `activity` (see the comment on
 * `collectionEvents` in `src/lib/db/schema.ts`). Same two hard rules as
 * `src/lib/activity/record.ts`:
 *  1. Callers pass identifiers only — no display data is ever accepted here,
 *     so there's nothing for a client to inject.
 *  2. `viewerId` is stored for dedupe/moderation but never read back by any
 *     public endpoint. Every read goes through `src/lib/discovery/rank.ts`.
 */

export type CollectionEventAction = 'view' | 'clone'

const SIGNED_IN_DEDUPE_WINDOW_MS = 30 * 60 * 1000 // 30 minutes
const ANON_DEDUPE_WINDOW_MS = 60_000 // 60 seconds

/** Whether `(ownerUserId, tag)` is currently a publicly shared collection. */
function isPublicCollection(ownerUserId: string, tag: string): boolean {
  const share = db
    .select({ isPublic: tagShares.isPublic })
    .from(tagShares)
    .where(and(eq(tagShares.userId, ownerUserId), eq(tagShares.tag, tag)))
    .limit(1)
    .all()[0]
  return !!share?.isPublic
}

/**
 * Append a `view`/`clone` event to the Discovery log. Fire-and-forget: never
 * throws, so a stats-write failure can't break a page view or a clone.
 * Synchronous (better-sqlite3), so callers don't need to await.
 *
 * Rules enforced here so call sites stay dumb — see spec §4:
 *  - Self-events never count (`viewerId === ownerUserId`).
 *  - Only public collections accrue events; private ones are a no-op (their
 *    historical events are also excluded at read time by the public-only
 *    join in `rank.ts`).
 *  - Write-side dedupe: signed-in viewers per `(viewerId, owner, tag, action)`
 *    within 30 minutes; anonymous viewers per `(owner, tag, action)` within
 *    60 seconds (the route's own IP rate limiter is the anonymous backstop).
 */
export function recordCollectionEvent(opts: {
  action: CollectionEventAction
  ownerUserId: string
  tag: string
  viewerId?: string | null
}): void {
  try {
    const { action, ownerUserId, tag } = opts
    const viewerId = opts.viewerId || null
    if (!ownerUserId || !tag) return

    // Self-events never count — otherwise every curator refresh/clone-check
    // of their own collection inflates their own rank.
    if (viewerId && viewerId === ownerUserId) return

    if (!isPublicCollection(ownerUserId, tag)) return

    if (viewerId) {
      const cutoff = new Date(Date.now() - SIGNED_IN_DEDUPE_WINDOW_MS).toISOString()
      const recent = db
        .select({ id: collectionEvents.id })
        .from(collectionEvents)
        .where(
          and(
            eq(collectionEvents.action, action),
            eq(collectionEvents.ownerUserId, ownerUserId),
            eq(collectionEvents.tag, tag),
            eq(collectionEvents.viewerId, viewerId),
            gt(collectionEvents.createdAt, cutoff),
          ),
        )
        .limit(1)
        .all()
      if (recent.length > 0) return
    } else {
      const cutoff = new Date(Date.now() - ANON_DEDUPE_WINDOW_MS).toISOString()
      const recent = db
        .select({ id: collectionEvents.id })
        .from(collectionEvents)
        .where(
          and(
            eq(collectionEvents.action, action),
            eq(collectionEvents.ownerUserId, ownerUserId),
            eq(collectionEvents.tag, tag),
            gt(collectionEvents.createdAt, cutoff),
          ),
        )
        .limit(1)
        .all()
      if (recent.length > 0) return
    }

    db.insert(collectionEvents)
      .values({
        action,
        ownerUserId,
        tag,
        viewerId,
        createdAt: new Date().toISOString(),
      })
      .run()
  } catch {
    // Best-effort: a stats write must never break a page view or a clone.
  }
}
