import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ForeignKeysPragmaError,
  PartialSqlMigrationError,
  runSqlMigrations,
  type SqlMigration,
} from '@/lib/db/sql-migrations'

const openDatabases: Database.Database[] = []
const temporaryDirectories: string[] = []

function migration(tag: string): SqlMigration {
  return {
    tag,
    sql: fs.readFileSync(path.join(process.cwd(), 'drizzle', `${tag}.sql`), 'utf8'),
  }
}

const prePlatformMigrations = [
  migration('0000_spotty_greymalkin'),
  migration('0001_windy_triathlon'),
  migration('0002_rapid_dexter_bennett'),
]
const platformMigration = migration('0003_add_platform_column')

function createPrePlatformDatabase(filename = ':memory:'): Database.Database {
  const db = new Database(filename)
  openDatabases.push(db)
  runSqlMigrations(db, prePlatformMigrations, { now: () => 100 })

  db.prepare(
    `INSERT INTO bookmark_links
       (user_id, bookmark_id, original_url, expanded_url, domain)
     VALUES (?, ?, ?, ?, ?)`,
  ).run('user-1', 'tweet-1', 'https://t.co/a', 'https://example.com/a', 'example.com')
  db.prepare(
    `INSERT INTO bookmark_media
       (id, user_id, bookmark_id, media_type, original_url, download_status)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('media-1', 'user-1', 'tweet-1', 'photo', 'https://example.com/photo.jpg', 'pending')
  db.prepare('INSERT INTO bookmark_tags (user_id, bookmark_id, tag) VALUES (?, ?, ?)').run(
    'user-1',
    'tweet-1',
    'keep',
  )
  db.prepare(
    `INSERT INTO bookmarks
       (id, user_id, author, text, tweet_url, processed_at, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'tweet-1',
    'user-1',
    'author',
    'Keep this bookmark',
    'https://x.com/author/status/tweet-1',
    '2026-08-01T00:00:00.000Z',
    'sync',
  )
  db.prepare(
    `INSERT INTO collection_tweets
       (user_id, collection_id, bookmark_id, added_at, notes)
     VALUES (?, ?, ?, ?, ?)`,
  ).run('user-1', 'collection-1', 'tweet-1', '2026-08-02T00:00:00.000Z', 'keep')
  db.prepare('INSERT INTO read_status (user_id, bookmark_id, read_at) VALUES (?, ?, ?)').run(
    'user-1',
    'tweet-1',
    '2026-08-03T00:00:00.000Z',
  )

  return db
}

function executeLegacyPlatformMigration(db: Database.Database): void {
  for (const statement of platformMigration.sql
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter(Boolean)) {
    db.exec(statement)
  }
}

function closeDatabase(db: Database.Database): void {
  const index = openDatabases.indexOf(db)
  if (index >= 0) openDatabases.splice(index, 1)
  db.close()
}

function platformDataSnapshot(db: Database.Database): Record<string, unknown[]> {
  return Object.fromEntries(
    [
      'bookmark_links',
      'bookmark_media',
      'bookmark_tags',
      'bookmarks',
      'collection_tweets',
      'read_status',
    ].map((table) => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()]),
  )
}

function databaseSnapshot(db: Database.Database): {
  schema: unknown[]
  rows: Record<string, unknown[]>
} {
  const schema = db
    .prepare(
      `SELECT type, name, tbl_name, sql
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all()
  const tables = (
    db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>
  ).map((row) => row.name)
  const rows = Object.fromEntries(
    tables.map((table) => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()]),
  )

  return { schema, rows }
}

function columnNames(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(
    (column) => column.name,
  )
}

function foreignKeys(db: Database.Database): number {
  return Number(db.pragma('foreign_keys', { simple: true }))
}

afterEach(() => {
  while (openDatabases.length > 0) openDatabases.pop()?.close()
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop()!, { force: true, recursive: true })
  }
})

describe('runSqlMigrations', () => {
  it.each([
    ['bookmark_media rebuild', 8],
    ['bookmark_tags rebuild', 13],
    ['collection_tweets rebuild', 28],
  ])('rolls back 0003 after the %s fails', (_label, failureIndex) => {
    const db = createPrePlatformDatabase()
    db.pragma('foreign_keys = ON')
    const before = databaseSnapshot(db)

    expect(() =>
      runSqlMigrations(db, [platformMigration], {
        beforeStatement({ tag, statementIndex }) {
          if (tag === platformMigration.tag && statementIndex === failureIndex) {
            throw new Error(`injected failure at statement ${statementIndex}`)
          }
        },
      }),
    ).toThrow(`Failed to apply SQL migration ${platformMigration.tag}`)

    expect(databaseSnapshot(db)).toEqual(before)
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '__new_%'")
        .all(),
    ).toEqual([])
    expect(
      db.prepare('SELECT hash FROM __drizzle_migrations WHERE hash = ?').get(platformMigration.tag),
    ).toBeUndefined()
    expect(foreignKeys(db)).toBe(1)
  })

  it('rolls schema and data back when the journal insert fails', () => {
    const db = createPrePlatformDatabase()
    db.pragma('foreign_keys = ON')
    db.exec(`
      CREATE TRIGGER fail_platform_journal
      BEFORE INSERT ON __drizzle_migrations
      WHEN NEW.hash = '${platformMigration.tag}'
      BEGIN
        SELECT RAISE(ABORT, 'injected journal failure');
      END;
    `)
    const before = databaseSnapshot(db)

    expect(() => runSqlMigrations(db, [platformMigration])).toThrow(
      `Failed to apply SQL migration ${platformMigration.tag}`,
    )

    expect(databaseSnapshot(db)).toEqual(before)
    expect(foreignKeys(db)).toBe(1)
  })

  it('commits 0003 data and its journal row atomically, then skips reruns', () => {
    const db = createPrePlatformDatabase()
    db.pragma('foreign_keys = OFF')

    expect(runSqlMigrations(db, [platformMigration], { now: () => 1234 })).toEqual([
      { tag: platformMigration.tag, status: 'applied' },
    ])

    for (const table of [
      'bookmark_links',
      'bookmark_media',
      'bookmark_tags',
      'bookmarks',
      'collection_tweets',
      'read_status',
    ]) {
      expect(columnNames(db, table)).toContain('platform')
      expect(db.prepare(`SELECT platform FROM "${table}"`).all()).toEqual([{ platform: 'twitter' }])
    }
    expect(
      db
        .prepare('SELECT hash, created_at FROM __drizzle_migrations WHERE hash = ?')
        .get(platformMigration.tag),
    ).toEqual({
      hash: platformMigration.tag,
      created_at: 1234,
    })
    expect(foreignKeys(db)).toBe(0)

    expect(
      runSqlMigrations(db, [platformMigration], {
        beforeStatement() {
          throw new Error('a skipped migration must not execute statements')
        },
      }),
    ).toEqual([{ tag: platformMigration.tag, status: 'skipped' }])
    expect(
      db
        .prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations WHERE hash = ?')
        .get(platformMigration.tag),
    ).toEqual({ count: 1 })
  })

  it('adopts a fully completed legacy 0003 without replaying statements', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-sql-migration-'))
    temporaryDirectories.push(directory)
    const filename = path.join(directory, 'legacy.db')
    let db = createPrePlatformDatabase(filename)

    executeLegacyPlatformMigration(db)
    expect(foreignKeys(db)).toBe(1)
    closeDatabase(db)

    db = new Database(filename)
    openDatabases.push(db)
    db.pragma('foreign_keys = ON')
    const beforeData = platformDataSnapshot(db)
    let statementsVisited = 0

    expect(
      runSqlMigrations(db, [platformMigration], {
        now: () => 5678,
        beforeStatement() {
          statementsVisited += 1
        },
      }),
    ).toEqual([{ tag: platformMigration.tag, status: 'adopted' }])

    expect(statementsVisited).toBe(0)
    expect(platformDataSnapshot(db)).toEqual(beforeData)
    expect(
      db
        .prepare('SELECT hash, created_at FROM __drizzle_migrations WHERE hash = ?')
        .all(platformMigration.tag),
    ).toEqual([{ hash: platformMigration.tag, created_at: 5678 }])
    expect(foreignKeys(db)).toBe(1)

    expect(
      runSqlMigrations(db, [platformMigration], {
        beforeStatement() {
          throw new Error('an adopted migration must skip on the next run')
        },
      }),
    ).toEqual([{ tag: platformMigration.tag, status: 'skipped' }])
    expect(
      db
        .prepare('SELECT COUNT(*) AS count FROM __drizzle_migrations WHERE hash = ?')
        .get(platformMigration.tag),
    ).toEqual({ count: 1 })
  })

  it('rejects a near-complete legacy 0003 with a missing required index', () => {
    const db = createPrePlatformDatabase()
    executeLegacyPlatformMigration(db)
    db.exec('DROP INDEX read_status_user_id_idx')
    const before = databaseSnapshot(db)

    expect(() => runSqlMigrations(db, [platformMigration])).toThrowError(PartialSqlMigrationError)
    expect(() => runSqlMigrations(db, [platformMigration])).toThrow(
      'index read_status_user_id_idx is missing',
    )
    expect(databaseSnapshot(db)).toEqual(before)
    expect(
      db.prepare('SELECT hash FROM __drizzle_migrations WHERE hash = ?').get(platformMigration.tag),
    ).toBeUndefined()
  })

  it('rejects a completed-looking legacy 0003 with the wrong primary-key order', () => {
    const db = createPrePlatformDatabase()
    executeLegacyPlatformMigration(db)
    db.exec(`
      DROP INDEX read_status_user_id_idx;
      ALTER TABLE read_status RENAME TO read_status_wrong_pk;
      CREATE TABLE read_status (
        user_id text NOT NULL,
        platform text DEFAULT 'twitter' NOT NULL,
        bookmark_id text NOT NULL,
        read_at text NOT NULL,
        PRIMARY KEY(user_id, bookmark_id, platform)
      );
      INSERT INTO read_status (user_id, platform, bookmark_id, read_at)
      SELECT user_id, platform, bookmark_id, read_at FROM read_status_wrong_pk;
      DROP TABLE read_status_wrong_pk;
      CREATE INDEX read_status_user_id_idx ON read_status(user_id);
    `)
    const before = databaseSnapshot(db)

    expect(() => runSqlMigrations(db, [platformMigration])).toThrow(
      'read_status primary key is (user_id, bookmark_id, platform), expected (user_id, platform, bookmark_id)',
    )
    expect(databaseSnapshot(db)).toEqual(before)
    expect(
      db.prepare('SELECT hash FROM __drizzle_migrations WHERE hash = ?').get(platformMigration.tag),
    ).toBeUndefined()
  })

  it('safely replays after the first legacy index drop', () => {
    const db = createPrePlatformDatabase()
    db.exec('DROP INDEX bookmark_links_user_bookmark_idx')

    expect(runSqlMigrations(db, [platformMigration], { now: () => 6789 })).toEqual([
      { tag: platformMigration.tag, status: 'applied' },
    ])
    expect(columnNames(db, 'bookmark_links')).toContain('platform')
    expect(
      db
        .prepare('SELECT hash, created_at FROM __drizzle_migrations WHERE hash = ?')
        .get(platformMigration.tag),
    ).toEqual({ hash: platformMigration.tag, created_at: 6789 })
    expect(
      db
        .prepare('PRAGMA index_info("bookmark_links_user_bookmark_idx")')
        .all()
        .map((row: unknown) => (row as { name: string }).name),
    ).toEqual(['user_id', 'platform', 'bookmark_id'])
  })

  it('detects a database partially migrated by the legacy statement runner', () => {
    const db = createPrePlatformDatabase()
    const legacyStatements = platformMigration.sql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean)

    for (const statement of legacyStatements.slice(0, 7)) db.exec(statement)
    db.pragma('foreign_keys = ON')
    const before = databaseSnapshot(db)

    expect(() => runSqlMigrations(db, [platformMigration])).toThrowError(PartialSqlMigrationError)
    expect(() => runSqlMigrations(db, [platformMigration])).toThrow('Automatic replay is unsafe')
    expect(databaseSnapshot(db)).toEqual(before)
    expect(
      db.prepare('SELECT hash FROM __drizzle_migrations WHERE hash = ?').get(platformMigration.tag),
    ).toBeUndefined()
    expect(foreignKeys(db)).toBe(1)
  })

  it.each([
    [
      'reversed directives',
      'PRAGMA foreign_keys=ON;--> statement-breakpoint\nPRAGMA foreign_keys=OFF;',
    ],
    ['missing ON', 'PRAGMA foreign_keys=OFF;--> statement-breakpoint\nCREATE TABLE nope (id);'],
    [
      'directive mixed with SQL',
      'PRAGMA foreign_keys=OFF; CREATE TABLE nope (id);--> statement-breakpoint\nPRAGMA foreign_keys=ON;',
    ],
    [
      'directives do not bracket the SQL',
      'CREATE TABLE nope (id);--> statement-breakpoint\nPRAGMA foreign_keys=OFF;--> statement-breakpoint\nPRAGMA foreign_keys=ON;',
    ],
  ])('rejects unsupported foreign_keys pragmas: %s', (_label, sql) => {
    const db = new Database(':memory:')
    openDatabases.push(db)
    db.pragma('foreign_keys = ON')

    expect(() => runSqlMigrations(db, [{ tag: 'bad_pragma', sql }])).toThrowError(
      ForeignKeysPragmaError,
    )
    expect(
      db.prepare('SELECT hash FROM __drizzle_migrations WHERE hash = ?').get('bad_pragma'),
    ).toBeUndefined()
    expect(foreignKeys(db)).toBe(1)
  })
})
