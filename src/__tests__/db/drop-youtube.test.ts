import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { deleteYouTubePosts } from '@/lib/db/drop-youtube'
import { createTestDb } from '../api/setup'

/**
 * Deleting saved Shorts is irreversible in production, so it runs here against
 * the full schema with real rows: every YouTube row goes, and every row from
 * the other platforms survives untouched.
 */

const NOW = '2026-10-16T00:00:00Z'

/** One saved post with a row in every table keyed by platform. */
function seedPost(db: Database.Database, platform: string, id: string) {
  db.prepare(
    `INSERT INTO bookmarks (id, user_id, platform, author, text, tweet_url, processed_at)
     VALUES (?, 'u1', ?, 'someone', 'hello', 'https://example.com', ?)`,
  ).run(id, platform, NOW)
  db.prepare(
    `INSERT INTO bookmark_tags (user_id, platform, bookmark_id, tag) VALUES ('u1', ?, ?, 'faves')`,
  ).run(platform, id)
  db.prepare(
    `INSERT INTO bookmark_media (id, user_id, platform, bookmark_id, media_type, original_url)
     VALUES (?, 'u1', ?, ?, 'video', 'https://example.com/v')`,
  ).run(`${id}_video_0`, platform, id)
  db.prepare(
    `INSERT INTO bookmark_links (user_id, platform, bookmark_id, expanded_url)
     VALUES ('u1', ?, ?, 'https://example.com/link')`,
  ).run(platform, id)
  db.prepare(
    `INSERT INTO archived_posts (user_id, platform, bookmark_id, archived_at) VALUES ('u1', ?, ?, ?)`,
  ).run(platform, id, NOW)
  db.prepare(
    `INSERT INTO activity (action, platform, bookmark_id, author, url, created_at)
     VALUES ('save', ?, ?, 'someone', '/x', ?)`,
  ).run(platform, id, NOW)
  db.prepare(
    `INSERT INTO moderated_posts (platform, bookmark_id, created_at, created_by) VALUES (?, ?, ?, 'admin')`,
  ).run(platform, id, NOW)
  db.prepare(
    `INSERT INTO analytics_events (name, platform, bookmark_id, created_at) VALUES ('post.open', ?, ?, ?)`,
  ).run(platform, id, NOW)
  db.prepare(
    `INSERT INTO post_embeddings (platform, post_id, kind, model, content_hash, created_at)
     VALUES (?, ?, 'text', 'm', 'h', ?)`,
  ).run(platform, id, NOW)
  db.prepare(
    `INSERT INTO understanding_queue (platform, post_id, kind, enqueued_at, next_attempt_at)
     VALUES (?, ?, 'video', ?, ?)`,
  ).run(platform, id, NOW, NOW)
  db.prepare(`INSERT INTO post_text_fts (platform, post_id, body) VALUES (?, ?, 'hello')`).run(
    platform,
    id,
  )
}

function seedChannel(db: Database.Database, slug: string, keys: string[]) {
  db.prepare(
    `INSERT INTO auto_channels
       (user_id, slug, name, post_keys, size, position, model, saves_at_compute, computed_at)
     VALUES ('u1', ?, ?, ?, ?, 0, 'm', 2, ?)`,
  ).run(slug, slug, JSON.stringify(keys), keys.length, NOW)
}

const TABLES: [table: string, platformColumn: string][] = [
  ['bookmarks', 'platform'],
  ['bookmark_tags', 'platform'],
  ['bookmark_media', 'platform'],
  ['bookmark_links', 'platform'],
  ['archived_posts', 'platform'],
  ['activity', 'platform'],
  ['moderated_posts', 'platform'],
  ['analytics_events', 'platform'],
  ['post_embeddings', 'platform'],
  ['understanding_queue', 'platform'],
  ['post_text_fts', 'platform'],
]

function countByPlatform(db: Database.Database, table: string, platform: string): number {
  return (
    db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE platform = ?`).get(platform) as {
      n: number
    }
  ).n
}

describe('deleteYouTubePosts', () => {
  it('deletes every YouTube row and keeps every other platform', () => {
    const { sqlite, close } = createTestDb()
    seedPost(sqlite, 'youtube', 'dQw4w9WgXcQ')
    seedPost(sqlite, 'twitter', '1234567890')
    seedPost(sqlite, 'tiktok', '7619017281691045134')

    const deleted = deleteYouTubePosts(sqlite)

    for (const [table] of TABLES) {
      expect(countByPlatform(sqlite, table, 'youtube'), table).toBe(0)
      expect(countByPlatform(sqlite, table, 'twitter'), table).toBe(1)
      expect(countByPlatform(sqlite, table, 'tiktok'), table).toBe(1)
      expect(deleted[table as keyof typeof deleted], table).toBe(1)
    }
    close()
  })

  it('drops only the auto channels that held a Short, so they are recomputed', () => {
    const { sqlite, close } = createTestDb()
    seedChannel(sqlite, 'mixed', ['twitter:1', 'youtube:dQw4w9WgXcQ'])
    seedChannel(sqlite, 'clean', ['twitter:2', 'tiktok:3'])

    const deleted = deleteYouTubePosts(sqlite)

    const slugs = (
      sqlite.prepare('SELECT slug FROM auto_channels').all() as { slug: string }[]
    ).map((r) => r.slug)
    expect(slugs).toEqual(['clean'])
    expect(deleted.auto_channels).toBe(1)
    close()
  })

  it('is a no-op on a second run and on a database with no Shorts', () => {
    const { sqlite, close } = createTestDb()
    seedPost(sqlite, 'youtube', 'dQw4w9WgXcQ')
    seedPost(sqlite, 'twitter', '1234567890')

    deleteYouTubePosts(sqlite)
    expect(deleteYouTubePosts(sqlite)).toEqual({})
    expect(countByPlatform(sqlite, 'bookmarks', 'twitter')).toBe(1)
    close()
  })

  it('skips tables an older database does not have yet', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE bookmarks (user_id TEXT, platform TEXT, id TEXT);
      INSERT INTO bookmarks VALUES ('u1', 'youtube', 'a'), ('u1', 'instagram', 'b');
    `)

    expect(deleteYouTubePosts(db)).toEqual({ bookmarks: 1 })
    expect(countByPlatform(db, 'bookmarks', 'instagram')).toBe(1)
    db.close()
  })

  it('rolls back every delete when one fails', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE bookmark_tags (user_id TEXT, platform TEXT, bookmark_id TEXT);
      CREATE TABLE bookmarks (user_id TEXT, platform TEXT, id TEXT);
      INSERT INTO bookmark_tags VALUES ('u1', 'youtube', 'a');
      INSERT INTO bookmarks VALUES ('u1', 'youtube', 'a');
      CREATE TRIGGER no_delete BEFORE DELETE ON bookmarks BEGIN SELECT RAISE(ABORT, 'nope'); END;
    `)

    expect(() => deleteYouTubePosts(db)).toThrow('nope')
    expect(countByPlatform(db, 'bookmark_tags', 'youtube')).toBe(1)
    db.close()
  })
})
