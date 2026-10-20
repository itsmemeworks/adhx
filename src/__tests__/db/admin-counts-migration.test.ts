import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

const dirs: string[] = []

afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true })
})

function migrate(databasePath: string) {
  return spawnSync(
    process.execPath,
    [path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'src/lib/db/migrate.ts'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
        MIGRATIONS_PATH: path.join(process.cwd(), 'drizzle'),
        ADMIN_USERNAMES: '',
        ADMIN_USER_IDS: '',
      },
    },
  )
}

describe('admin counts migration', () => {
  it('adds last seen, phone platforms, reaction counts and the moment log, idempotently', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-admin-migration-'))
    dirs.push(dir)
    const databasePath = path.join(dir, 'admin.db')
    new Database(databasePath).close()
    for (let run = 0; run < 2; run++) {
      const result = migrate(databasePath)
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    }
    const db = new Database(databasePath)
    const cols = (table: string) =>
      (
        db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[]
      ).map((c) => c.name)
    expect(cols('users')).toContain('last_seen_at')
    expect(cols('access_keys')).toContain('platform')
    expect(cols('reaction_counts')).toEqual(['day', 'user_id', 'kind', 'count'])
    expect(cols('moment_log')).toEqual([
      'slug',
      'title',
      'formed_at',
      'tune_ins',
      'peak_watching',
      'reactions',
      'alerts',
      'alerts_opened',
    ])
    // Reaction counts belong to a live account.
    expect(() =>
      db
        .prepare(
          `INSERT INTO reaction_counts (day, user_id, kind, count) VALUES ('2026-10-20', 'ghost', 'fire', 1)`,
        )
        .run(),
    ).toThrow(/account reference does not exist/)
    db.close()
  })
})
