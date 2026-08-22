import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { renameReadStatusToArchivedPosts } from '@/lib/db/rename-read-status'

/**
 * A data migration that only ever runs in production is one nobody has run.
 * The migration script creates every table fresh in tests, so nothing there
 * exercises this path — these tests build a database in the OLD shape, with
 * rows in it, and check what the rename actually does to real data.
 */

/** A database as it existed before the rename: read_status + its indexes. */
function oldShapeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE read_status (
      user_id text NOT NULL,
      platform text NOT NULL DEFAULT 'twitter',
      bookmark_id text NOT NULL,
      read_at text NOT NULL,
      PRIMARY KEY (user_id, platform, bookmark_id)
    );
    CREATE INDEX read_status_user_id_idx ON read_status(user_id);
    CREATE INDEX idx_read_status_read_at ON read_status(read_at DESC);
  `)
  return db
}

const tables = (db: Database.Database): string[] =>
  (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
      name: string
    }[]
  ).map((r) => r.name)

describe('renameReadStatusToArchivedPosts', () => {
  it('renames the table and the column', () => {
    const db = oldShapeDb()
    expect(renameReadStatusToArchivedPosts(db)).toBe(true)

    expect(tables(db)).toContain('archived_posts')
    expect(tables(db)).not.toContain('read_status')
    const cols = (db.prepare('PRAGMA table_info(archived_posts)').all() as { name: string }[]).map(
      (c) => c.name,
    )
    expect(cols).toContain('archived_at')
    expect(cols).not.toContain('read_at')
    db.close()
  })

  it('carries the rows across untouched — this is real archive history', () => {
    const db = oldShapeDb()
    db.prepare('INSERT INTO read_status VALUES (?, ?, ?, ?)').run(
      'u1',
      'twitter',
      'tweet-1',
      '2026-08-01T00:00:00Z',
    )
    db.prepare('INSERT INTO read_status VALUES (?, ?, ?, ?)').run(
      'u1',
      'tiktok',
      'tok-1',
      '2026-08-02T00:00:00Z',
    )
    db.prepare('INSERT INTO read_status VALUES (?, ?, ?, ?)').run(
      'u2',
      'twitter',
      'tweet-1',
      '2026-08-03T00:00:00Z',
    )

    renameReadStatusToArchivedPosts(db)

    const rows = db
      .prepare(
        'SELECT user_id, platform, bookmark_id, archived_at FROM archived_posts ORDER BY archived_at',
      )
      .all()
    expect(rows).toEqual([
      {
        user_id: 'u1',
        platform: 'twitter',
        bookmark_id: 'tweet-1',
        archived_at: '2026-08-01T00:00:00Z',
      },
      {
        user_id: 'u1',
        platform: 'tiktok',
        bookmark_id: 'tok-1',
        archived_at: '2026-08-02T00:00:00Z',
      },
      {
        user_id: 'u2',
        platform: 'twitter',
        bookmark_id: 'tweet-1',
        archived_at: '2026-08-03T00:00:00Z',
      },
    ])
    db.close()
  })

  it('keeps the composite primary key enforcing one row per user+platform+post', () => {
    const db = oldShapeDb()
    db.prepare('INSERT INTO read_status VALUES (?, ?, ?, ?)').run('u1', 'twitter', 't1', 'x')
    renameReadStatusToArchivedPosts(db)

    // Same triple must still collide; the same id on ANOTHER platform must not.
    expect(() =>
      db.prepare('INSERT INTO archived_posts VALUES (?, ?, ?, ?)').run('u1', 'twitter', 't1', 'y'),
    ).toThrow()
    expect(() =>
      db.prepare('INSERT INTO archived_posts VALUES (?, ?, ?, ?)').run('u1', 'tiktok', 't1', 'y'),
    ).not.toThrow()
    db.close()
  })

  it('drops the stale index names so the migration can own the new ones', () => {
    const db = oldShapeDb()
    renameReadStatusToArchivedPosts(db)
    const indexes = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[]
    ).map((r) => r.name)
    // SQLite carries indexes through a table rename but keeps their old names,
    // which would leave read_status-named indexes on an archived_posts table.
    expect(indexes).not.toContain('read_status_user_id_idx')
    expect(indexes).not.toContain('idx_read_status_read_at')
    db.close()
  })

  it('is idempotent — a second boot does nothing', () => {
    const db = oldShapeDb()
    db.prepare('INSERT INTO read_status VALUES (?, ?, ?, ?)').run('u1', 'twitter', 't1', 'x')

    expect(renameReadStatusToArchivedPosts(db)).toBe(true)
    expect(renameReadStatusToArchivedPosts(db)).toBe(false)
    expect(renameReadStatusToArchivedPosts(db)).toBe(false)
    expect(db.prepare('SELECT COUNT(*) AS n FROM archived_posts').get()).toEqual({ n: 1 })
    db.close()
  })

  it('does nothing on a fresh database that only ever had the new table', () => {
    const db = new Database(':memory:')
    db.exec(
      'CREATE TABLE archived_posts (user_id text, platform text, bookmark_id text, archived_at text)',
    )
    expect(renameReadStatusToArchivedPosts(db)).toBe(false)
    expect(tables(db)).toEqual(['archived_posts'])
    db.close()
  })

  it('leaves a half-migrated database alone rather than clobbering the new table', () => {
    // Both present (an interrupted or hand-run migration): the new table is
    // the one with the data the app is reading, so it must not be overwritten.
    const db = oldShapeDb()
    db.exec(
      'CREATE TABLE archived_posts (user_id text, platform text, bookmark_id text, archived_at text)',
    )
    db.prepare('INSERT INTO archived_posts VALUES (?, ?, ?, ?)').run('u1', 'twitter', 'keep', 'z')

    expect(renameReadStatusToArchivedPosts(db)).toBe(false)
    expect(db.prepare('SELECT bookmark_id FROM archived_posts').all()).toEqual([
      { bookmark_id: 'keep' },
    ])
    db.close()
  })
})
