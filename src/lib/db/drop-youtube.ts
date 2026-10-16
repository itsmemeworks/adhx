/**
 * Delete every saved YouTube Short and everything derived from it.
 *
 * ADHX dropped YouTube in 2026-10: Shorts only play through YouTube's iframe,
 * so their frames can't be sampled and they can't be understood like posts
 * from the other platforms. The owner chose to delete saved Shorts rather
 * than hide them. This is irreversible once it runs against a real database.
 *
 * Extracted from migrate.ts so it can be tested against a database that
 * actually holds YouTube rows (same reasoning as rename-read-status.ts).
 */

/** The slice of better-sqlite3 this needs — keeps the module free of the driver. */
export interface MigrationDb {
  prepare(sql: string): {
    get(...params: unknown[]): unknown
    run(...params: unknown[]): { changes: number }
  }
  transaction<T>(fn: () => T): () => T
}

/**
 * Every table keyed by a post's `platform`. Children before `bookmarks`, the
 * same order as `DELETE /api/bookmarks/[id]`. `activity`, `moderated_posts`
 * and `analytics_events` are event/moderation logs about the same posts.
 */
const PLATFORM_TABLES = [
  'bookmark_tags',
  'bookmark_media',
  'bookmark_links',
  'archived_posts',
  'bookmarks',
  'activity',
  'moderated_posts',
  'analytics_events',
  'post_embeddings',
  'understanding_queue',
  'post_text_fts',
] as const

export type YouTubeDeletion = Partial<
  Record<(typeof PLATFORM_TABLES)[number] | 'auto_channels', number>
>

/**
 * Idempotent: a second run deletes nothing. Tables that don't exist yet (an
 * older or partial database) are skipped. Runs in one transaction, so a
 * failure leaves every row in place. Returns the rows deleted per table,
 * omitting tables with none.
 *
 * `auto_channels` stores member posts as a JSON array of `platform:id`; a
 * user's channels that held a Short are dropped so they're recomputed from
 * what's left.
 */
export function deleteYouTubePosts(db: MigrationDb): YouTubeDeletion {
  const tableExists = (name: string): boolean =>
    !!db.prepare("SELECT name FROM sqlite_master WHERE name = ? AND type = 'table'").get(name)

  return db.transaction(() => {
    const deleted: YouTubeDeletion = {}
    for (const table of PLATFORM_TABLES) {
      if (!tableExists(table)) continue
      const { changes } = db.prepare(`DELETE FROM ${table} WHERE platform = 'youtube'`).run()
      if (changes > 0) deleted[table] = changes
    }
    if (tableExists('auto_channels')) {
      const { changes } = db
        .prepare(`DELETE FROM auto_channels WHERE post_keys LIKE '%"youtube:%'`)
        .run()
      if (changes > 0) deleted.auto_channels = changes
    }
    return deleted
  })()
}
