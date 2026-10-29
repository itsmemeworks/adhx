import Database from 'better-sqlite3'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { FULL_SCHEMA_SQL } from '../api/setup'

it('adds group link columns to an existing invites table, twice over, keeping old invites', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'adhx-group-invites-'))
  const file = path.join(root, 'library.db')
  const migrations = path.join(root, 'drizzle')
  mkdirSync(path.join(migrations, 'meta'), { recursive: true })
  writeFileSync(path.join(migrations, 'meta', '_journal.json'), JSON.stringify({ entries: [] }))
  try {
    const before = new Database(file)
    before.exec(FULL_SCHEMA_SQL)
    before.exec(`DROP INDEX invites_group_idx;
      DROP TABLE invites;
      CREATE TABLE invites (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
        created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at INTEGER NOT NULL,
        used_by TEXT, used_at TEXT, revoked_at TEXT, name_hint TEXT);
      INSERT INTO users(id,username,role) VALUES('ana','ana','admin');
      INSERT INTO invites(id,token_hash,created_by,created_at,expires_at)
        VALUES('inv_old','hash','ana','2026-10-01',9999999999999);`)
    before.close()
    const migrate = () => {
      const result = spawnSync(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', 'src/lib/db/migrate.ts'],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          timeout: 60_000,
          env: {
            ...process.env,
            DATABASE_PATH: file,
            MIGRATIONS_PATH: migrations,
            ADMIN_USERNAMES: '',
            ADMIN_USER_IDS: '',
          },
        },
      )
      expect(result.status, result.stdout + result.stderr).toBe(0)
    }
    migrate()
    migrate()
    const after = new Database(file)
    try {
      expect(after.prepare('SELECT id, max_uses, uses, group_id FROM invites').all()).toEqual([
        { id: 'inv_old', max_uses: null, uses: 0, group_id: null },
      ])
      expect(
        after.prepare(`SELECT name FROM sqlite_master WHERE name = 'invites_group_idx'`).get(),
      ).toEqual({ name: 'invites_group_idx' })
    } finally {
      after.close()
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}, 120_000)
