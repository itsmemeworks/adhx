import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { FULL_SCHEMA_SQL } from '../api/setup'

const temporaryDirectories: string[] = []

function runMigration(databasePath: string, migrationsPath: string): void {
  const result = spawnSync(
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
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
  }
})

describe('collection aggregate startup migration', () => {
  it('backfills before pruning and remains idempotent on restart', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-collection-aggregate-'))
    temporaryDirectories.push(directory)
    const databasePath = path.join(directory, 'legacy.db')
    const migrationsPath = path.join(directory, 'drizzle')
    fs.mkdirSync(path.join(migrationsPath, 'meta'), { recursive: true })
    fs.writeFileSync(
      path.join(migrationsPath, 'meta', '_journal.json'),
      JSON.stringify({ entries: [] }),
    )

    let sqlite = new Database(databasePath)
    sqlite.exec(FULL_SCHEMA_SQL)
    sqlite.exec('DROP TABLE collection_aggregates')
    sqlite.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run('owner-1', 'alice')
    const insert = sqlite.prepare(
      `INSERT INTO collection_events
         (action, owner_user_id, tag, viewer_id, created_at, hidden)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    insert.run('view', 'owner-1', 'history', 'private-viewer-1', '2025-01-01T00:00:00.000Z', 0)
    insert.run('clone', 'owner-1', 'history', 'private-viewer-2', '2025-02-01T00:00:00.000Z', 0)
    insert.run('view', 'owner-1', 'history', null, new Date().toISOString(), 0)
    sqlite.close()

    runMigration(databasePath, migrationsPath)

    sqlite = new Database(databasePath)
    const firstAggregate = sqlite
      .prepare(
        `SELECT owner_user_id, tag, view_count, clone_count, last_event_at, hidden
         FROM collection_aggregates`,
      )
      .get()
    expect(firstAggregate).toEqual({
      owner_user_id: 'owner-1',
      tag: 'history',
      view_count: 2,
      clone_count: 1,
      last_event_at: expect.any(String),
      hidden: 0,
    })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM collection_events').get()).toEqual({
      count: 1,
    })
    expect(
      sqlite
        .prepare(
          `SELECT value FROM migration_state
           WHERE key = 'collection_aggregates_backfilled_v1'`,
        )
        .get(),
    ).toEqual({ value: '1' })
    sqlite.close()

    runMigration(databasePath, migrationsPath)

    sqlite = new Database(databasePath)
    expect(
      sqlite
        .prepare(
          `SELECT owner_user_id, tag, view_count, clone_count, last_event_at, hidden
           FROM collection_aggregates`,
        )
        .get(),
    ).toEqual(firstAggregate)
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM collection_events').get()).toEqual({
      count: 1,
    })
    sqlite.close()
  })
})
