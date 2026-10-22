import { and, eq, inArray, sql } from 'drizzle-orm'
import { privateByDefault } from '@/lib/bookmarks/privacy'
import { db, runInTransaction } from '@/lib/db'
import {
  bookmarkLinks,
  bookmarkMedia,
  bookmarkTags,
  bookmarks,
  userPreferences,
} from '@/lib/db/schema'
import { visibleSave } from '@/lib/people/savers'
import { noteSaved, PRIORITY } from '@/lib/semantic'
import { addedAtForIndex } from '@/lib/sync/added-at'
import { getUsernameForUserId } from '@/lib/users/lookup'
import { MAX_TAGS_PER_POST, sanitizeTag } from '@/lib/utils/tag'
import { groupChannelKeys } from './group'
import { recordAnalytic } from '@/lib/analytics/record'
import { removeSave } from '@/lib/bookmarks/remove'

/**
 * "Keep this channel" on a From everyone channel (board j6-2): every visible
 * post in it goes into one of your channels named after it ("Food you'll
 * cook one day" → `food-youll-cook`), with the Made for you keep's rules —
 * posts already at `MAX_TAGS_PER_POST` tags are skipped. Posts you haven't
 * saved are saved for you first, as a normal (not private) save copied from
 * a member's visible save, with `source = 'channel_keep'`. The channel isn't
 * made public.
 */

export interface KeptChannel {
  tag: string
  url: string
}

/** The tag a kept group channel becomes: its name, apostrophes dropped, else its slug. */
export function groupKeepTag(name: string, slug: string): string {
  return sanitizeTag(name.replace(/['’‘`]/g, '')) || sanitizeTag(slug) || 'kept'
}

function keptUrl(username: string, tag: string): string {
  return `/t/${encodeURIComponent(username)}/${encodeURIComponent(tag)}`
}

type KeptGroup = { tag: string; keys: string[]; createdAt: string }
const keepKey = (slug: string) => `channels.keptGroup.${slug}`

/** Record only the tags this keep actually inserted, never a same-name user channel. */
function readKeep(userId: string, slug: string): KeptGroup | null {
  const row = db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, keepKey(slug))))
    .get()
  if (!row) return null
  const value = JSON.parse(row.value ?? 'null') as KeptGroup
  if (
    !value ||
    typeof value.createdAt !== 'string' ||
    typeof value.tag !== 'string' ||
    !Array.isArray(value.keys) ||
    !value.keys.every((k) => typeof k === 'string')
  ) {
    throw new Error('Invalid kept channel record')
  }
  return value
}

/** A recorded keep, independent of later generated names or matching personal tags. */
export async function keptGroupChannel(
  userId: string,
  channel: { name: string; slug: string },
): Promise<KeptChannel | null> {
  const kept = readKeep(userId, channel.slug)
  if (!kept) return null
  const username = await getUsernameForUserId(userId)
  return username ? { tag: kept.tag, url: keptUrl(username, kept.tag) } : null
}

function split(key: string): { platform: string; id: string } {
  const at = key.indexOf(':')
  return { platform: key.slice(0, at), id: key.slice(at + 1) }
}

/**
 * Keep a group channel: `{ tag, url, added }` (`added` = posts newly put in
 * the channel), or null when there's no such channel.
 */
export async function keepGroupChannel(
  userId: string,
  slug: string,
): Promise<(KeptChannel & { added: number }) | null> {
  const channel = await groupChannelKeys(slug)
  if (!channel) return null
  const username = await getUsernameForUserId(userId)
  if (!username) return null
  const previous = await keptGroupChannel(userId, { ...channel, slug })
  if (previous) return { ...previous, added: 0 }
  const tag = groupKeepTag(channel.name, slug)
  const keys = channel.keys
  const ids = [...new Set(keys.map((k) => split(k).id))]
  const wanted = new Set(keys)

  const owned = new Set(
    (ids.length
      ? db
          .select({ platform: bookmarks.platform, id: bookmarks.id })
          .from(bookmarks)
          .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, ids)))
          .all()
      : []
    ).map((r) => `${r.platform}:${r.id}`),
  )
  const tagsByKey = new Map<string, Set<string>>()
  for (const r of ids.length
    ? db
        .select({
          platform: bookmarkTags.platform,
          id: bookmarkTags.bookmarkId,
          tag: bookmarkTags.tag,
        })
        .from(bookmarkTags)
        .where(and(eq(bookmarkTags.userId, userId), inArray(bookmarkTags.bookmarkId, ids)))
        .all()
    : []) {
    const key = `${r.platform}:${r.id}`
    tagsByKey.set(key, (tagsByKey.get(key) ?? new Set()).add(r.tag))
  }

  // For each post you don't have: the newest visible save of it, to copy.
  const missing = keys.filter((k) => !owned.has(k))
  const sources = new Map<string, typeof bookmarks.$inferSelect>()
  if (missing.length) {
    const missingIds = [...new Set(missing.map((k) => split(k).id))]
    const rows = db
      .select()
      .from(bookmarks)
      .where(and(inArray(bookmarks.id, missingIds), visibleSave()))
      .orderBy(sql`${bookmarks.processedAt} DESC`)
      .all()
    for (const r of rows) {
      const key = `${r.platform}:${r.id}`
      if (wanted.has(key) && !owned.has(key) && !sources.has(key)) sources.set(key, r)
    }
  }

  const startedAt = Date.now()
  const createdAt = new Date(startedAt).toISOString()
  // New copies follow the keeper's "Just for me by default", like a clone.
  const isPrivate = privateByDefault(userId)
  let added = 0
  const saved: { platform: string; postId: string }[] = []
  runInTransaction(() => {
    // Another request may have completed while resolving the channel/user.
    if (readKeep(userId, slug)) return
    const inserted: string[] = []
    let i = 0
    for (const [key, src] of sources) {
      db.insert(bookmarks)
        .values({
          ...src,
          userId,
          source: 'channel_keep',
          isPrivate,
          // A note is its writer's own words, never copied to someone else's save.
          note: null,
          processedAt: addedAtForIndex(startedAt, i++),
        })
        .onConflictDoNothing()
        .run()
      const media = db
        .select()
        .from(bookmarkMedia)
        .where(
          and(
            eq(bookmarkMedia.userId, src.userId),
            eq(bookmarkMedia.platform, src.platform),
            eq(bookmarkMedia.bookmarkId, src.id),
          ),
        )
        .all()
      if (media.length) {
        db.insert(bookmarkMedia)
          .values(media.map((m) => ({ ...m, userId })))
          .onConflictDoNothing()
          .run()
      }
      const links = db
        .select()
        .from(bookmarkLinks)
        .where(
          and(
            eq(bookmarkLinks.userId, src.userId),
            eq(bookmarkLinks.platform, src.platform),
            eq(bookmarkLinks.bookmarkId, src.id),
          ),
        )
        .all()
      if (links.length) {
        db.insert(bookmarkLinks)
          .values(links.map(({ id: _id, ...l }) => ({ ...l, userId })))
          .onConflictDoNothing()
          .run()
      }
      owned.add(key)
      saved.push({ platform: src.platform, postId: src.id })
    }
    for (const key of keys) {
      const tags = tagsByKey.get(key) ?? new Set<string>()
      if (!owned.has(key) || tags.has(tag) || tags.size >= MAX_TAGS_PER_POST) continue
      const { platform, id } = split(key)
      const result = db
        .insert(bookmarkTags)
        .values({ userId, platform, bookmarkId: id, tag, createdAt })
        .onConflictDoNothing()
        .run()
      if (result.changes) {
        inserted.push(key)
        added++
      }
    }
    db.insert(userPreferences)
      .values({
        userId,
        key: keepKey(slug),
        value: JSON.stringify({ tag, keys: inserted, createdAt }),
        updatedAt: createdAt,
      })
      .run()
  })
  if (saved.length) noteSaved(saved, PRIORITY.sync)
  recordAnalytic({ name: 'channel.keep', surface: 'group', bookmarkId: slug, userId })
  return { tag, url: keptUrl(username, tag), added }
}

/**
 * "Leave" a kept group channel (the player's keep toggle): the channel of
 * yours named after it goes, and so do the saves keeping it added for you
 * (`source = 'channel_keep'`) that aren't in another channel of yours.
 * Posts you saved yourself stay saved. `{ removed }` (saves taken away), or
 * null when there's no such channel.
 */
export async function leaveGroupChannel(
  userId: string,
  slug: string,
): Promise<{ removed: number } | null> {
  // No provenance on older keeps: preserve that data rather than guessing
  // from a generated name. Re-keeping adopts none of its pre-existing tags.
  const kept = readKeep(userId, slug)
  if (!kept) return null
  let removed = 0
  runInTransaction(() => {
    db.delete(userPreferences)
      .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, keepKey(slug))))
      .run()
    for (const key of kept.keys) {
      const { platform, id } = split(key)
      const changed = db
        .delete(bookmarkTags)
        .where(
          and(
            eq(bookmarkTags.userId, userId),
            eq(bookmarkTags.platform, platform),
            eq(bookmarkTags.bookmarkId, id),
            eq(bookmarkTags.tag, kept.tag),
            eq(bookmarkTags.createdAt, kept.createdAt),
          ),
        )
        .run()
      // A tag removed or moved since keeping is no longer ours to undo.
      if (!changed.changes) continue

      const [save] = db
        .select({ source: bookmarks.source })
        .from(bookmarks)
        .where(
          and(eq(bookmarks.userId, userId), eq(bookmarks.platform, platform), eq(bookmarks.id, id)),
        )
        .limit(1)
        .all()
      if (save?.source !== 'channel_keep') continue
      const [other] = db
        .select({ tag: bookmarkTags.tag })
        .from(bookmarkTags)
        .where(
          and(
            eq(bookmarkTags.userId, userId),
            eq(bookmarkTags.platform, platform),
            eq(bookmarkTags.bookmarkId, id),
          ),
        )
        .limit(1)
        .all()
      if (other) continue
      removeSave(userId, platform, id)
      removed++
    }
  })
  recordAnalytic({ name: 'channel.leave', surface: 'group', bookmarkId: slug, userId })
  return { removed }
}
