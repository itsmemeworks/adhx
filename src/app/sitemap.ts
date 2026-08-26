import { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { tagShares, bookmarks, users, activity, userBans } from '@/lib/db/schema'
import { and, eq, desc, isNull, sql } from 'drizzle-orm'
import { previewPath } from '@/lib/activity/record'
import type { PlatformId } from '@/lib/platform/url'
import { FILTER_SLUGS } from '@/lib/trending/filter'
import { RANK_WINDOWS, windowToPath } from '@/lib/discovery/rank'
import {
  isValidTwitterHandle,
  passesThinContentGate,
  completedWeekSlugs,
} from '@/lib/sitemap/queries'
import { PUBLIC_BASE_URL } from '@/lib/routes/base-url'
import { readBannedUserIds, readModeratedPostKeys } from '@/lib/admin/moderation'

/**
 * Single sitemap served at /sitemap.xml (where robots.txt points).
 *
 * Rendered at request time, NOT build time: it reads the runtime SQLite DB,
 * which is only migrated at container startup, so a build-time render would hit
 * a table-less DB. force-dynamic also means new saves/previews show up without
 * waiting on a deploy.
 *
 * (A previous version sharded this via generateSitemaps(), but that serves only
 * /sitemap/<id>.xml with no /sitemap.xml index — breaking the robots-declared
 * URL. At this scale a single sitemap is well under the 50k-URL / 50MB limits;
 * the URL_CAP backstop guards against unbounded growth.)
 *
 * ANONYMITY: activity actor IDs are used only in a private anti-join against
 * `user_bans`; they are never selected into or exposed through sitemap data.
 *
 * Widened inventory (on top of hubs + public tags + saved/previewed content):
 *  - Author hubs (`/{username}`) for every X handle behind a sitemap-eligible post.
 *  - Trending archive (`/trending/archive` + one URL per completed ISO week).
 *  - Discovery leaderboard (`/leaderboard` + the 3 non-default window paths).
 * Activity-derived (never-saved) preview URLs pass through a thin-content gate
 * (`passesThinContentGate`) so a flood of low-effort previewed-but-unsaved posts
 * can't dilute site-wide quality signals — see `src/lib/sitemap/queries.ts`.
 */
export const dynamic = 'force-dynamic'

const baseUrl = PUBLIC_BASE_URL

/** The four content platforms whose saved/previewed posts map to preview URLs. */
const PLATFORMS: PlatformId[] = ['twitter', 'instagram', 'tiktok', 'youtube']

/** Backstop so a runaway table can't produce an oversized sitemap (limit 50k). */
const URL_CAP = 45_000

/** Per-source row cap (newest-first) so one busy table can't crowd out the rest. */
const SOURCE_CAP = 10_000

/** Track the most-recently-seen ISO timestamp per twitter author, for the hub's lastModified. */
function trackAuthor(
  map: Map<string, string>,
  handle: string,
  createdAt: string | null | undefined,
) {
  if (!createdAt) {
    if (!map.has(handle)) map.set(handle, '')
    return
  }
  const existing = map.get(handle)
  if (!existing || createdAt > existing) map.set(handle, createdAt)
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  // Hubs: homepage, the cross-network /trending hub, the per-lens hubs, and
  // the trending archive hub. All are static routes that render fine with an
  // empty DB (e.g. zero completed weeks), so they're unconditional — not
  // gated behind a query's success like the per-week archive URLs below.
  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/trending`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    {
      url: `${baseUrl}/trending/archive`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ]
  for (const slug of FILTER_SLUGS) {
    entries.push({
      url: `${baseUrl}/trending/${slug}`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.8,
    })
  }

  // /leaderboard — the Discovery leaderboard hub (week, the default window)
  // plus the three non-default window paths. Renders fine with an empty
  // board, so unconditional like the other static hubs above.
  entries.push({
    url: `${baseUrl}/leaderboard`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.6,
  })
  entries.push({
    url: `${baseUrl}/privacy`,
    lastModified: now,
    changeFrequency: 'yearly',
    priority: 0.3,
  })
  for (const w of RANK_WINDOWS) {
    if (w.id === 'week') continue // already the bare /leaderboard above
    entries.push({
      url: `${baseUrl}${windowToPath(w.id)}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    })
  }

  // All database-derived URLs depend on moderation. If either moderation
  // table is unreadable, emit only the unconditional static hubs rather than
  // guessing that no posts/users are moderated.
  const moderatedRead = readModeratedPostKeys()
  const bannedRead = readBannedUserIds()
  if (!moderatedRead.ok || !bannedRead.ok) {
    console.error('Sitemap: moderation store unavailable; omitting database-derived URLs')
    return entries
  }
  const moderated = moderatedRead.value
  const banned = bannedRead.value

  // Public tag-collection pages (`/t/{user}/{tag}`) plus the bare curator
  // profile (`/t/{user}`) for every distinct username behind at least one
  // public tag. Private tags are excluded.
  try {
    const publicShares = db
      .select({ tag: tagShares.tag, username: users.username, userId: users.id })
      .from(tagShares)
      .innerJoin(users, eq(tagShares.userId, users.id))
      .where(eq(tagShares.isPublic, true))
      .all()
    const curators = new Set<string>()
    for (const share of publicShares) {
      if (banned.has(share.userId)) continue
      if (!share.username) continue
      entries.push({
        url: `${baseUrl}/t/${share.username}/${share.tag}`,
        changeFrequency: 'daily',
        priority: 0.7,
      })
      curators.add(share.username)
    }
    for (const username of curators) {
      entries.push({
        url: `${baseUrl}/t/${username}`,
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    }
  } catch (error) {
    console.error('Sitemap: failed to query public tags:', error)
  }

  // Content previews across all platforms: every distinct saved post, plus
  // preview-only posts (surfaced via the pulse but never saved), de-duped by
  // their on-ADHX preview path. Twitter authors behind an eligible post are
  // collected into `twitterAuthors` for the author-hub section below.
  const seen = new Set<string>()
  const twitterAuthors = new Map<string, string>() // handle -> most-recent ISO timestamp seen
  for (const platform of PLATFORMS) {
    try {
      // Saved content: distinct (platform, id) across all users — one preview
      // URL per post, regardless of how many users saved it. Saved content is
      // real user curation, so it's always sitemap-eligible (no thin-content
      // gate) — newest-first + capped so one huge table can't crowd out others.
      const saved = db
        .selectDistinct({
          id: bookmarks.id,
          author: bookmarks.author,
          createdAt: bookmarks.createdAt,
        })
        .from(bookmarks)
        .leftJoin(userBans, eq(userBans.userId, bookmarks.userId))
        .where(and(eq(bookmarks.platform, platform), isNull(userBans.userId)))
        .orderBy(desc(bookmarks.processedAt))
        .limit(SOURCE_CAP)
        .all()
      for (const b of saved) {
        if (!b.id || !b.author) continue
        if (moderated.has(`${platform}:${b.id}`)) continue
        const path = previewPath(platform, b.author, b.id)
        if (seen.has(path)) continue
        seen.add(path)
        entries.push({
          url: `${baseUrl}${path}`,
          lastModified: b.createdAt ? new Date(b.createdAt) : undefined,
          changeFrequency: 'weekly',
          priority: 0.5,
        })
        if (platform === 'twitter' && isValidTwitterHandle(b.author)) {
          trackAuthor(twitterAuthors, b.author, b.createdAt)
        }
      }

      // Preview-only items, de-duped against the saved set by preview path,
      // then run through the thin-content gate: a post that was only ever
      // glanced at (no media, no article, a couple of throwaway words) isn't
      // worth an index entry. Rows are visited newest-first, so the gate
      // decision uses the most recent event's snapshot of the post — an
      // acceptable approximation over aggregating every historical event.
      const previewed = db
        .select({
          bookmarkId: activity.bookmarkId,
          author: activity.author,
          createdAt: activity.createdAt,
          text: activity.text,
          thumbnailUrl: activity.thumbnailUrl,
          contentType: activity.contentType,
        })
        .from(activity)
        .leftJoin(userBans, eq(userBans.userId, activity.userId))
        .where(
          and(eq(activity.hidden, 0), eq(activity.platform, platform), isNull(userBans.userId)),
        )
        .orderBy(desc(activity.createdAt))
        .limit(SOURCE_CAP)
        .all()
      for (const a of previewed) {
        if (!a.bookmarkId || !a.author) continue
        if (moderated.has(`${platform}:${a.bookmarkId}`)) continue
        const path = previewPath(platform, a.author, a.bookmarkId)
        if (seen.has(path)) continue
        // Mark visited regardless of gate outcome so an older duplicate event
        // for the same post can't re-evaluate (and potentially flip-flop) it.
        seen.add(path)
        const passes = passesThinContentGate({
          hasMedia: !!a.thumbnailUrl,
          isArticle: a.contentType === 'article',
          textLength: (a.text || '').length,
          // Guaranteed false here — a saved post would already be in `seen`
          // from the loop above and never reach this point.
          saved: false,
        })
        if (!passes) continue
        entries.push({
          url: `${baseUrl}${path}`,
          lastModified: a.createdAt ? new Date(a.createdAt) : undefined,
          changeFrequency: 'weekly',
          priority: 0.4,
        })
        if (platform === 'twitter' && isValidTwitterHandle(a.author)) {
          trackAuthor(twitterAuthors, a.author, a.createdAt)
        }
      }
    } catch (error) {
      console.error(`Sitemap: failed to query ${platform} content:`, error)
    }
  }

  // Author hubs: one per distinct, regex-valid X handle behind a
  // sitemap-eligible post (saved, or previewed-and-passing-the-gate above).
  try {
    for (const [handle, lastMod] of twitterAuthors) {
      entries.push({
        url: `${baseUrl}/${handle}`,
        lastModified: lastMod ? new Date(lastMod) : undefined,
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    }
  } catch (error) {
    console.error('Sitemap: failed to build author hub URLs:', error)
  }

  // Trending archive weeks: one URL per COMPLETED ISO week present in the
  // activity log (the current in-progress week isn't archived yet — it's
  // still live at /trending). Archived weeks are historical and immutable, so
  // they get no lastModified and a 'yearly' changeFrequency. (The archive hub
  // itself is pushed unconditionally above, alongside the other static hubs.)
  try {
    const days = db
      .selectDistinct({ day: sql<string>`date(${activity.createdAt})` })
      .from(activity)
      .leftJoin(userBans, eq(userBans.userId, activity.userId))
      .where(and(eq(activity.hidden, 0), isNull(userBans.userId)))
      .all()
    const weeks = completedWeekSlugs(
      days.map((d) => d.day).filter((d): d is string => !!d),
      now,
    )
    for (const week of weeks) {
      entries.push({
        url: `${baseUrl}/trending/archive/${week}`,
        changeFrequency: 'yearly',
        priority: 0.6,
      })
    }
  } catch (error) {
    console.error('Sitemap: failed to query trending archive weeks:', error)
  }

  if (entries.length > URL_CAP) {
    console.warn(`Sitemap: ${entries.length - URL_CAP} URLs over the ${URL_CAP} cap — dropping.`)
    return entries.slice(0, URL_CAP)
  }

  return entries
}
