import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { FULL_SCHEMA_SQL } from '../api/setup'

const temporaryDirectories: string[] = []

function createMigrationFixture(): {
  databasePath: string
  migrationsPath: string
  sqlite: Database.Database
} {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-phase-four-migration-'))
  temporaryDirectories.push(directory)
  const databasePath = path.join(directory, 'legacy.db')
  const migrationsPath = path.join(directory, 'drizzle')
  fs.mkdirSync(path.join(migrationsPath, 'meta'), { recursive: true })
  fs.writeFileSync(
    path.join(migrationsPath, 'meta', '_journal.json'),
    JSON.stringify({ entries: [] }),
  )

  const sqlite = new Database(databasePath)
  sqlite.exec(FULL_SCHEMA_SQL)
  return { databasePath, migrationsPath, sqlite }
}

function runMigration(databasePath: string, migrationsPath: string): SpawnSyncReturns<string> {
  return spawnSync(
    process.execPath,
    [path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/lib/db/migrate.ts'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
        MIGRATIONS_PATH: migrationsPath,
        ADMIN_USERNAMES: '',
        ADMIN_USER_IDS: '',
      },
    },
  )
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
  }
})

describe('Phase 4 startup migration', () => {
  it('boots an empty database with the OAuth generation boundary installed', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-empty-migration-'))
    temporaryDirectories.push(directory)
    const databasePath = path.join(directory, 'empty.db')
    new Database(databasePath).close()

    const result = runMigration(databasePath, path.join(process.cwd(), 'drizzle'))
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)

    const migrated = new Database(databasePath)
    expect(
      migrated
        .prepare(
          `SELECT name, "notnull"
           FROM pragma_table_info('users')
           WHERE name = 'x_link_version'`,
        )
        .get(),
    ).toEqual({ name: 'x_link_version', notnull: 1 })
    expect(
      migrated
        .prepare(
          `SELECT name, "notnull"
           FROM pragma_table_info('oauth_state')
           WHERE name = 'x_link_version'`,
        )
        .get(),
    ).toEqual({ name: 'x_link_version', notnull: 1 })
    migrated.close()
  })

  it('adds OAuth state generation and backfills the account generation idempotently', () => {
    const { databasePath, migrationsPath, sqlite } = createMigrationFixture()
    sqlite.exec('ALTER TABLE oauth_state DROP COLUMN x_link_version')
    sqlite
      .prepare('INSERT INTO users (id, username, x_link_version) VALUES (?, ?, ?)')
      .run('oauth-user', 'oauthuser', 7)
    sqlite
      .prepare(
        `INSERT INTO oauth_state (state, code_verifier, user_id, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run('legacy-state', 'legacy-verifier', 'oauth-user', '2026-08-26T12:00:00.000Z')
    sqlite.close()

    const first = runMigration(databasePath, migrationsPath)
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0)
    const second = runMigration(databasePath, migrationsPath)
    expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0)

    const migrated = new Database(databasePath)
    const columns = migrated.prepare('PRAGMA table_info(oauth_state)').all() as Array<{
      name: string
      notnull: number
    }>
    expect(columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'x_link_version', notnull: 1 })]),
    )
    expect(
      migrated
        .prepare('SELECT user_id, x_link_version FROM oauth_state WHERE state = ?')
        .get('legacy-state'),
    ).toEqual({ user_id: 'oauth-user', x_link_version: 7 })
    migrated.close()
  })

  it('adds the account X-link generation idempotently for legacy users tables', () => {
    const { databasePath, migrationsPath, sqlite } = createMigrationFixture()
    sqlite.exec('ALTER TABLE users DROP COLUMN x_link_version')
    sqlite
      .prepare('INSERT INTO users (id, username) VALUES (?, ?)')
      .run('legacy-user', 'legacyuser')
    sqlite.close()

    const first = runMigration(databasePath, migrationsPath)
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0)
    const second = runMigration(databasePath, migrationsPath)
    expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0)

    const migrated = new Database(databasePath)
    const columns = migrated.prepare('PRAGMA table_info(users)').all() as Array<{
      name: string
      notnull: number
    }>
    expect(columns).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'x_link_version', notnull: 1 })]),
    )
    expect(
      migrated.prepare('SELECT x_link_version FROM users WHERE id = ?').get('legacy-user'),
    ).toEqual({ x_link_version: 0 })
    migrated.close()
  })

  it('adds durable OAuth refresh lease columns idempotently', () => {
    const { databasePath, migrationsPath, sqlite } = createMigrationFixture()
    sqlite.exec(`
      ALTER TABLE oauth_tokens DROP COLUMN refresh_lease_id;
      ALTER TABLE oauth_tokens DROP COLUMN refresh_lease_started_at;
    `)
    sqlite.close()

    const first = runMigration(databasePath, migrationsPath)
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0)
    const second = runMigration(databasePath, migrationsPath)
    expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0)

    const migrated = new Database(databasePath)
    const columns = migrated.prepare('PRAGMA table_info(oauth_tokens)').all() as Array<{
      name: string
    }>
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['refresh_lease_id', 'refresh_lease_started_at']),
    )
    migrated.close()
  })

  it('adds and backfills heartbeat_at for a legacy sync_logs table idempotently', () => {
    const { databasePath, migrationsPath, sqlite } = createMigrationFixture()
    sqlite.exec('ALTER TABLE sync_logs DROP COLUMN heartbeat_at')
    sqlite
      .prepare(
        `INSERT INTO sync_logs (id, user_id, started_at, completed_at, status)
         VALUES (?, ?, ?, ?, 'completed')`,
      )
      .run('legacy-sync', 'user-1', '2026-08-26T12:00:00.000Z', '2026-08-26T12:01:00.000Z')
    sqlite.close()

    const first = runMigration(databasePath, migrationsPath)
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0)
    const second = runMigration(databasePath, migrationsPath)
    expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0)

    const migrated = new Database(databasePath)
    const columns = migrated.prepare('PRAGMA table_info(sync_logs)').all() as Array<{
      name: string
    }>
    expect(columns.some((column) => column.name === 'heartbeat_at')).toBe(true)
    expect(
      migrated.prepare('SELECT heartbeat_at FROM sync_logs WHERE id = ?').get('legacy-sync'),
    ).toEqual({ heartbeat_at: '2026-08-26T12:00:00.000Z' })
    migrated.close()
  })

  it('reaps stale running syncs without failing a fresh heartbeat', () => {
    const { databasePath, migrationsPath, sqlite } = createMigrationFixture()
    const now = Date.now()
    sqlite
      .prepare(
        `INSERT INTO sync_logs (id, user_id, started_at, heartbeat_at, status)
         VALUES (?, ?, ?, ?, 'running'), (?, ?, ?, ?, 'running')`,
      )
      .run(
        'stale-sync',
        'user-stale',
        new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        new Date(now - 31 * 60 * 1000).toISOString(),
        'fresh-sync',
        'user-fresh',
        new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        new Date(now - 60 * 1000).toISOString(),
      )
    sqlite.close()

    const result = runMigration(databasePath, migrationsPath)
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)

    const migrated = new Database(databasePath)
    expect(
      migrated
        .prepare('SELECT status, error_message FROM sync_logs WHERE id = ?')
        .get('stale-sync'),
    ).toEqual({
      status: 'failed',
      error_message: 'Sync interrupted before completion',
    })
    expect(
      migrated
        .prepare('SELECT status, completed_at, heartbeat_at FROM sync_logs WHERE id = ?')
        .get('fresh-sync'),
    ).toEqual({
      status: 'running',
      completed_at: null,
      heartbeat_at: new Date(now - 60 * 1000).toISOString(),
    })
    migrated.close()
  })

  it('collapses duplicate fresh legacy leases before installing uniqueness', () => {
    const { databasePath, migrationsPath, sqlite } = createMigrationFixture()
    const now = Date.now()
    const olderHeartbeat = new Date(now - 2 * 60 * 1000).toISOString()
    const newerHeartbeat = new Date(now - 60 * 1000).toISOString()
    sqlite.exec('DROP INDEX sync_logs_one_running_per_user_idx')
    sqlite
      .prepare('INSERT INTO users (id, username) VALUES (?, ?)')
      .run('user-duplicate', 'duplicate-user')
    sqlite
      .prepare(
        `INSERT INTO sync_logs (id, user_id, started_at, heartbeat_at, status)
         VALUES (?, ?, ?, ?, 'running'), (?, ?, ?, ?, 'running')`,
      )
      .run(
        'fresh-older',
        'user-duplicate',
        new Date(now - 10 * 60 * 1000).toISOString(),
        olderHeartbeat,
        'fresh-newer',
        'user-duplicate',
        new Date(now - 9 * 60 * 1000).toISOString(),
        newerHeartbeat,
      )
    sqlite.close()

    const result = runMigration(databasePath, migrationsPath)
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)

    const migrated = new Database(databasePath)
    expect(
      migrated
        .prepare(
          `SELECT id, status, error_message, completed_at
           FROM sync_logs
           WHERE user_id = ?
           ORDER BY id`,
        )
        .all('user-duplicate'),
    ).toEqual([
      {
        id: 'fresh-newer',
        status: 'running',
        error_message: null,
        completed_at: null,
      },
      {
        id: 'fresh-older',
        status: 'failed',
        error_message: 'Legacy duplicate running sync superseded during startup',
        completed_at: expect.any(String),
      },
    ])
    expect(() =>
      migrated
        .prepare(
          `INSERT INTO sync_logs (id, user_id, started_at, heartbeat_at, status)
           VALUES (?, ?, ?, ?, 'running')`,
        )
        .run(
          'fresh-third',
          'user-duplicate',
          new Date(now).toISOString(),
          new Date(now).toISOString(),
        ),
    ).toThrow(/UNIQUE/)
    migrated.close()
  })

  it('cleans legacy races before installing sync and link uniqueness', () => {
    const { databasePath, migrationsPath, sqlite } = createMigrationFixture()
    sqlite.exec(`
      DROP INDEX sync_logs_one_running_per_user_idx;
      DROP INDEX bookmark_links_identity_idx;
    `)
    sqlite
      .prepare('INSERT INTO users (id, username) VALUES (?, ?), (?, ?)')
      .run('user-1', 'alice', 'user-2', 'bob')
    sqlite
      .prepare(
        `INSERT INTO sync_logs (id, user_id, started_at, status)
         VALUES (?, ?, ?, 'running')`,
      )
      .run('sync-1', 'user-1', '2026-08-26T12:00:00.000Z')
    const insertLink = sqlite.prepare(
      `INSERT INTO bookmark_links
         (user_id, platform, bookmark_id, original_url, expanded_url, link_type, domain,
          content_json, preview_title, preview_description, preview_image_url)
       VALUES (?, 'twitter', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const survivor = insertLink.run(
      'user-1',
      'tweet-1',
      'https://t.co/a',
      'https://example.com/a',
      null,
      'example.com',
      '{"x":1}',
      'Short',
      null,
      null,
    )
    insertLink.run(
      'user-1',
      'tweet-1',
      null,
      'https://example.com/a',
      null,
      null,
      '{"title":"rich","body":"complete"}',
      'Rich preview title',
      'Detailed preview description',
      null,
    )
    insertLink.run(
      'user-1',
      'tweet-1',
      null,
      'https://example.com/a',
      'article',
      null,
      null,
      null,
      null,
      'https://example.com/cover.jpg',
    )
    sqlite.close()

    const result = runMigration(databasePath, migrationsPath)
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)

    const migrated = new Database(databasePath)
    expect(
      migrated.prepare('SELECT status, error_message FROM sync_logs WHERE id = ?').get('sync-1'),
    ).toEqual({
      status: 'failed',
      error_message: 'Sync interrupted before completion',
    })
    expect(
      migrated
        .prepare(
          `SELECT id, original_url, link_type, domain, content_json, preview_title,
                  preview_description, preview_image_url
           FROM bookmark_links
           WHERE user_id = ? AND platform = ? AND bookmark_id = ? AND expanded_url = ?`,
        )
        .all('user-1', 'twitter', 'tweet-1', 'https://example.com/a'),
    ).toEqual([
      {
        id: Number(survivor.lastInsertRowid),
        original_url: 'https://t.co/a',
        link_type: 'article',
        domain: 'example.com',
        content_json: '{"title":"rich","body":"complete"}',
        preview_title: 'Rich preview title',
        preview_description: 'Detailed preview description',
        preview_image_url: 'https://example.com/cover.jpg',
      },
    ])
    expect(() =>
      migrated
        .prepare(
          `INSERT INTO sync_logs (id, user_id, started_at, status)
           VALUES (?, ?, ?, 'running'), (?, ?, ?, 'running')`,
        )
        .run(
          'sync-2',
          'user-2',
          '2026-08-26T13:00:00.000Z',
          'sync-3',
          'user-2',
          '2026-08-26T13:00:01.000Z',
        ),
    ).toThrow(/UNIQUE/)
    expect(() =>
      migrated
        .prepare(
          `INSERT INTO bookmark_links
             (user_id, platform, bookmark_id, expanded_url)
           VALUES (?, ?, ?, ?)`,
        )
        .run('user-1', 'twitter', 'tweet-1', 'https://example.com/a'),
    ).toThrow(/UNIQUE/)
    migrated.close()
  })

  it('installs trusted analytics lookup indexes idempotently', () => {
    const { databasePath, migrationsPath, sqlite } = createMigrationFixture()
    sqlite.exec(`
      DROP INDEX bookmarks_platform_id_idx;
      DROP INDEX activity_platform_bookmark_hidden_idx;
    `)
    sqlite.close()

    const first = runMigration(databasePath, migrationsPath)
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0)
    const second = runMigration(databasePath, migrationsPath)
    expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0)

    const migrated = new Database(databasePath)
    const indexes = migrated
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'index'
           AND name IN ('bookmarks_platform_id_idx', 'activity_platform_bookmark_hidden_idx')
         ORDER BY name`,
      )
      .all()
    expect(indexes).toEqual([
      { name: 'activity_platform_bookmark_hidden_idx' },
      { name: 'bookmarks_platform_id_idx' },
    ])

    const bookmarkPlan = migrated
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT platform, category
         FROM bookmarks
         WHERE platform = ? AND id = ?
         LIMIT 1`,
      )
      .all('twitter', 'post-1') as Array<{ detail: string }>
    expect(bookmarkPlan.map(({ detail }) => detail).join('\n')).toContain(
      'bookmarks_platform_id_idx',
    )

    const activityPlan = migrated
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT content_type
         FROM activity
         WHERE platform = ? AND bookmark_id = ? AND hidden = 0
         LIMIT 1`,
      )
      .all('twitter', 'post-1') as Array<{ detail: string }>
    expect(activityPlan.map(({ detail }) => detail).join('\n')).toContain(
      'activity_platform_bookmark_hidden_idx',
    )
    migrated.close()
  })

  it('terminates startup when moderation tables are unreadable', () => {
    const { databasePath, migrationsPath, sqlite } = createMigrationFixture()
    sqlite.exec(`
      DROP TABLE moderated_posts;
      CREATE TABLE moderated_posts (invalid_column TEXT);
    `)
    sqlite.close()

    const result = runMigration(databasePath, migrationsPath)
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'FAILED ensuring admin moderation tables',
    )
  })
})
