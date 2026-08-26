import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { FULL_SCHEMA_SQL } from '../api/setup'

const temporaryDirectories: string[] = []

function createMigrationFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-x-identity-migration-'))
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

function runMigration(databasePath: string, migrationsPath: string) {
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

describe('X identity uniqueness migration', () => {
  it('keeps the newest legacy X link, clears ambiguous tokens, and installs the index idempotently', () => {
    const { databasePath, migrationsPath, sqlite } = createMigrationFixture()
    sqlite.exec('DROP INDEX user_identities_one_x_per_user_idx')
    sqlite
      .prepare(
        `INSERT INTO users (id, username, email)
         VALUES
           ('account', 'reader', 'r@example.com'),
           ('tie-account', 'tie-reader', 'tie@example.com')`,
      )
      .run()
    sqlite
      .prepare(
        `INSERT INTO user_identities (provider, provider_id, user_id, created_at)
         VALUES
           ('email', 'r@example.com', 'account', '2026-08-26T10:00:00.000Z'),
           ('x', 'x-old', 'account', '2026-08-26T10:00:00.000Z'),
           ('x', 'x-new', 'account', '2026-08-26T11:00:00.000Z'),
           ('x', 'x-tie-old', 'tie-account', '2026-08-26T12:00:00.000Z'),
           ('x', 'x-tie-new', 'tie-account', '2026-08-26T12:00:00.000Z')`,
      )
      .run()
    sqlite
      .prepare(
        `INSERT INTO oauth_tokens
           (user_id, username, access_token, refresh_token, expires_at)
         VALUES ('account', 'new-handle', 'access-new', 'refresh-new', 9999999999)`,
      )
      .run()
    sqlite.close()

    const first = runMigration(databasePath, migrationsPath)
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0)
    const second = runMigration(databasePath, migrationsPath)
    expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0)

    const migrated = new Database(databasePath)
    expect(
      migrated
        .prepare(
          `SELECT provider_id, created_at
           FROM user_identities
           WHERE provider = 'x' AND user_id = 'account'`,
        )
        .all(),
    ).toEqual([{ provider_id: 'x-new', created_at: '2026-08-26T11:00:00.000Z' }])
    expect(
      migrated
        .prepare(
          `SELECT provider_id
           FROM user_identities
           WHERE provider = 'x' AND user_id = 'tie-account'`,
        )
        .all(),
    ).toEqual([{ provider_id: 'x-tie-new' }])
    // oauth_tokens has no X provider id, so legacy callback completion order
    // cannot prove these credentials belong to the retained identity.
    expect(
      migrated.prepare(`SELECT username FROM oauth_tokens WHERE user_id = 'account'`).get(),
    ).toBeUndefined()
    expect(
      migrated.prepare(`SELECT provider_id FROM user_identities WHERE provider = 'email'`).all(),
    ).toEqual([{ provider_id: 'r@example.com' }])
    expect(() =>
      migrated
        .prepare(
          `INSERT INTO user_identities (provider, provider_id, user_id)
           VALUES ('x', 'x-third', 'account')`,
        )
        .run(),
    ).toThrow(/UNIQUE/)
    migrated.close()
  })

  it('fails startup when the uniqueness enforcement cannot be installed', () => {
    const { databasePath, migrationsPath, sqlite } = createMigrationFixture()
    sqlite.exec(`
      DROP TABLE user_identities;
      CREATE TABLE user_identities (
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY (provider, provider_id)
      );
    `)
    sqlite.close()

    const result = runMigration(databasePath, migrationsPath)
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'FAILED enforcing one X identity per user',
    )
  })
})
