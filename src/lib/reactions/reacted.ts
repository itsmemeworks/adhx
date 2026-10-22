import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { readModeratedPostKeys } from '@/lib/admin/moderation'
import { keysToHits } from '@/lib/channels/channels'
import { memberAvatar, seenBy } from '@/lib/people/savers'
import { loadSearchItems, type SearchItem } from '@/lib/semantic/items'
import type { PostReaction } from './post-reactions'

/**
 * The reactions feed ("play all posts that have had reactions"): every post
 * the viewer can see (`seenBy`) with at least one reaction they can see,
 * newest reaction first. Web `/play?reacted=1` (`GET /api/posts/reacted`) and
 * phones (`GET /api/app/reacted`) read it here.
 *
 * Same rules as a post's own reactions (`post-reactions.ts`): members only,
 * named; banned reactors are never counted or shown; admin-hidden posts and
 * posts gone from their network are left out. Moderation is read fail-closed:
 * when it can't be read, this throws and nothing is shown.
 */

export const REACTED_MAX_LIMIT = 50

/** What the feed says about a post's reactions: how many, and the newest. */
export interface ReactionSummary {
  count: number
  last: Omit<PostReaction, 'id'>
}

export interface ReactedPage {
  /** Posts newest reaction first, as built for the viewer. */
  items: (SearchItem & { reactions: ReactionSummary })[]
  /** Posts with reactions the viewer can see, in all. */
  total: number
  nextOffset: number | null
}

type Row = {
  platform: string
  post_id: string
  user_id: string
  emoji: string | null
  text: string | null
  created_at: string
  username: string
  display_name: string | null
  avatar_url: string | null
  avatar_source: string | null
  n: number
  total: number
}

export async function reactedPosts(
  viewerId: string,
  offset: number,
  limit: number,
): Promise<ReactedPage> {
  if (!viewerId) return { items: [], total: 0, nextOffset: null }
  const moderation = readModeratedPostKeys()
  if (!moderation.ok) throw moderation.error
  const rows = db.all<Row>(sql`
    WITH visible AS (
      SELECT r.rowid AS rid, r.platform, r.post_id, r.created_at
      FROM post_reactions r
      JOIN users u ON u.id = r.user_id
      WHERE NOT EXISTS (SELECT 1 FROM user_bans x WHERE x.user_id = r.user_id)
        AND NOT EXISTS (
          SELECT 1 FROM moderated_posts m
          WHERE m.platform = r.platform AND m.bookmark_id = r.post_id AND m.hidden = 1
        )
        AND NOT EXISTS (
          SELECT 1 FROM post_embeddings e
          WHERE e.platform = r.platform AND e.post_id = r.post_id
            AND e.status = 'none' AND e.error IS NOT NULL
        )
        AND EXISTS (
          SELECT 1 FROM bookmarks b
          WHERE b.platform = r.platform AND b.id = r.post_id AND ${seenBy(viewerId, 'b')}
        )
    ),
    ranked AS (
      SELECT v.*,
        ROW_NUMBER() OVER (PARTITION BY platform, post_id ORDER BY created_at DESC, rid DESC) AS rn,
        COUNT(*) OVER (PARTITION BY platform, post_id) AS n
      FROM visible v
    ), page AS (
      SELECT ranked.*, COUNT(*) OVER () AS total
      FROM ranked
      WHERE rn = 1
      ORDER BY created_at DESC, rid DESC
      LIMIT ${limit} OFFSET ${offset}
    )
    SELECT page.*, r.user_id, r.emoji, r.text,
      u.username, u.display_name, u.avatar_url, p.value AS avatar_source
    FROM page
    JOIN post_reactions r ON r.rowid = page.rid
    JOIN users u ON u.id = r.user_id
    LEFT JOIN user_preferences p ON p.user_id = r.user_id AND p.key = 'avatarSource'
    ORDER BY page.created_at DESC, page.rid DESC
  `)
  if (rows.length === 0) {
    // Past the end: still say how many there are.
    const total = offset > 0 ? (await reactedPosts(viewerId, 0, 1)).total : 0
    return { items: [], total, nextOffset: null }
  }
  const total = Number(rows[0].total)
  const byKey = new Map(rows.map((r) => [`${r.platform}:${r.post_id}`, r]))
  const loaded = await loadSearchItems(keysToHits([...byKey.keys()]), viewerId)
  const items = loaded.flatMap((item) => {
    const r = byKey.get(`${item.post.platform}:${item.post.id}`)
    if (!r) return []
    return [
      {
        ...item,
        reactions: {
          count: Number(r.n),
          last: {
            emoji: r.emoji ?? null,
            text: r.emoji ? null : (r.text ?? null),
            at: r.created_at,
            saver: {
              username: r.username,
              name: r.display_name ?? null,
              avatarUrl: memberAvatar(r.avatar_url, r.avatar_source),
              isYou: r.user_id === viewerId,
            },
          },
        },
      },
    ]
  })
  const next = offset + rows.length
  return { items, total, nextOffset: next < total ? next : null }
}

/** `offset` and `limit` (1–50, default 20) from a request's query. */
export function pageParams(params: URLSearchParams): { offset: number; limit: number } {
  const int = (value: string | null, fallback: number, min: number, max: number) => {
    const n = Number.parseInt(value ?? '', 10)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
  }
  return {
    offset: int(params.get('offset'), 0, 0, 100_000),
    limit: int(params.get('limit'), 20, 1, REACTED_MAX_LIMIT),
  }
}
