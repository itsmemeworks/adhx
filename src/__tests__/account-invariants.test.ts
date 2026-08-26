import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyAdminRoleBootstrap,
  installAccountWriteGuards,
  LegacyAdminBootstrapError,
} from '@/lib/db/account-invariants'
import { FULL_SCHEMA_SQL } from './api/setup'

describe('account-reference write guards', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(FULL_SCHEMA_SQL)
  })

  afterEach(() => sqlite.close())

  it('preserves historical rows but rejects persistence for a deleted account', () => {
    sqlite
      .prepare(
        `INSERT INTO activity
          (action, platform, bookmark_id, author, url, user_id, created_at)
         VALUES ('preview', 'twitter', 'old', 'author', '/author/status/old', 'deleted', ?)`,
      )
      .run(new Date().toISOString())

    installAccountWriteGuards(sqlite)

    expect(sqlite.prepare(`SELECT user_id FROM activity WHERE bookmark_id = 'old'`).get()).toEqual({
      user_id: 'deleted',
    })
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO bookmarks
            (id, user_id, platform, author, text, tweet_url, processed_at)
           VALUES ('late', 'deleted', 'twitter', 'author', 'text', 'url', ?)`,
        )
        .run(new Date().toISOString()),
    ).toThrow(/account reference does not exist/)
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO activity
            (action, platform, bookmark_id, author, url, user_id, created_at)
           VALUES ('save', 'twitter', 'late', 'author', '/author/status/late', 'deleted', ?)`,
        )
        .run(new Date().toISOString()),
    ).toThrow(/account reference does not exist/)

    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO activity
            (action, platform, bookmark_id, author, url, user_id, created_at)
           VALUES ('preview', 'twitter', 'anon', 'author', '/author/status/anon', NULL, ?)`,
        )
        .run(new Date().toISOString()),
    ).not.toThrow()
    expect(() =>
      sqlite.prepare(`UPDATE activity SET hidden = 1 WHERE bookmark_id = 'old'`).run(),
    ).not.toThrow()
    expect(() =>
      sqlite
        .prepare(`UPDATE activity SET user_id = 'still-deleted' WHERE bookmark_id = 'old'`)
        .run(),
    ).toThrow(/account reference does not exist/)
  })

  it('installs every guard idempotently', () => {
    installAccountWriteGuards(sqlite)
    installAccountWriteGuards(sqlite)

    const row = sqlite
      .prepare(
        `SELECT count(*) AS count FROM sqlite_master
         WHERE type = 'trigger' AND name LIKE 'guard_%_account_%'`,
      )
      .get() as { count: number }
    expect(row.count).toBe(36)
  })

  it('enforces the persisted trigger from a separate database connection', () => {
    const directory = mkdtempSync(join(tmpdir(), 'adhx-account-guard-'))
    const databasePath = join(directory, 'guard.db')
    const primary = new Database(databasePath)
    let competingWriter: Database.Database | null = null

    try {
      primary.exec(FULL_SCHEMA_SQL)
      primary.prepare(`INSERT INTO users (id, username) VALUES ('account', 'account')`).run()
      installAccountWriteGuards(primary)
      primary.prepare(`DELETE FROM users WHERE id = 'account'`).run()

      competingWriter = new Database(databasePath)
      expect(() =>
        competingWriter!
          .prepare(
            `INSERT INTO bookmarks
              (id, user_id, platform, author, text, tweet_url, processed_at)
             VALUES ('late', 'account', 'twitter', 'author', 'text', 'url', ?)`,
          )
          .run(new Date().toISOString()),
      ).toThrow(/account reference does not exist/)
    } finally {
      competingWriter?.close()
      primary.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('admin role bootstrap', () => {
  let sqlite: Database.Database

  beforeEach(() => {
    sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'user'
      );
      CREATE TABLE migration_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  })

  afterEach(() => sqlite.close())

  function addUser(id: string, username: string): void {
    sqlite.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(id, username)
  }

  function role(id: string): string | undefined {
    return (
      sqlite.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined
    )?.role
  }

  it('leaves a fresh install unchanged without configured grants', () => {
    expect(applyAdminRoleBootstrap(sqlite, {})).toEqual({
      legacyPromoted: 0,
      idPromoted: 0,
    })
  })

  it('promotes every fully matched legacy username and settles once', () => {
    addUser('u1', 'Alice')
    addUser('u2', 'bob')

    expect(
      applyAdminRoleBootstrap(sqlite, {
        adminUsernames: ' alice,BOB,alice ',
      }),
    ).toEqual({ legacyPromoted: 2, idPromoted: 0 })
    expect(role('u1')).toBe('admin')
    expect(role('u2')).toBe('admin')
    expect(
      sqlite
        .prepare(`SELECT value FROM migration_state WHERE key = 'admin_roles_bootstrapped_v1'`)
        .get(),
    ).toEqual({ value: '1' })
  })

  it('rejects zero matches without settling or promoting a later claimant', () => {
    expect(() => applyAdminRoleBootstrap(sqlite, { adminUsernames: 'unclaimed' })).toThrow(
      LegacyAdminBootstrapError,
    )
    expect(
      sqlite
        .prepare(`SELECT value FROM migration_state WHERE key = 'admin_roles_bootstrapped_v1'`)
        .get(),
    ).toBeUndefined()

    expect(() =>
      applyAdminRoleBootstrap(sqlite, { adminUsernames: 'another-missing-name' }),
    ).toThrow(LegacyAdminBootstrapError)
    addUser('later', 'unclaimed')
    expect(() => applyAdminRoleBootstrap(sqlite, { adminUsernames: 'unclaimed' })).toThrow(
      /previously rejected/,
    )
    expect(role('later')).toBe('user')
  })

  it('rejects partial matches atomically and blocks the unresolved name', () => {
    addUser('u1', 'alice')

    expect(() => applyAdminRoleBootstrap(sqlite, { adminUsernames: 'alice,bob' })).toThrow(/bob/)
    expect(role('u1')).toBe('user')

    addUser('u2', 'bob')
    expect(() => applyAdminRoleBootstrap(sqlite, { adminUsernames: 'alice,bob' })).toThrow(
      /previously rejected/,
    )
    expect(role('u1')).toBe('user')
    expect(role('u2')).toBe('user')
  })

  it('recovers from a rejected legacy config through immutable IDs', () => {
    addUser('u1', 'alice')
    expect(() => applyAdminRoleBootstrap(sqlite, { adminUsernames: 'alice,missing' })).toThrow(
      LegacyAdminBootstrapError,
    )

    expect(
      applyAdminRoleBootstrap(sqlite, {
        adminUserIds: 'u1,does-not-exist',
      }),
    ).toEqual({ legacyPromoted: 0, idPromoted: 1 })
    expect(role('u1')).toBe('admin')
  })
})
