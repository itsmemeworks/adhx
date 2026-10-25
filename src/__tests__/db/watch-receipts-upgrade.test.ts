import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { FULL_SCHEMA_SQL } from '../api/setup'

it('upgrades an existing watch library twice, preserves counts and guards receipt ownership', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'adhx-watch-upgrade-'))
  const file = path.join(root, 'library.db')
  const migrations = path.join(root, 'drizzle')
  mkdirSync(path.join(migrations, 'meta'), { recursive: true })
  writeFileSync(path.join(migrations, 'meta', '_journal.json'), JSON.stringify({ entries: [] }))
  try {
    const before = new Database(file)
    before.exec(FULL_SCHEMA_SQL)
    before.exec(`DROP TABLE watch_batch_receipts;
      INSERT INTO users(id,username) VALUES('member','member');
      INSERT INTO post_watch_counts VALUES('member','youtube','clip',2026,3,2,40,'2026-10-01','2026-10-02');`)
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
    const first = new Database(file)
    first
      .prepare('INSERT INTO watch_batch_receipts VALUES (?,?,?)')
      .run('member', 'receipt', 'hash')
    first.close()
    migrate()
    const after = new Database(file)
    try {
      expect(after.prepare('SELECT plays,finishes,seconds FROM post_watch_counts').get()).toEqual({
        plays: 3,
        finishes: 2,
        seconds: 40,
      })
      expect(after.prepare('SELECT * FROM watch_batch_receipts').all()).toEqual([
        { user_id: 'member', batch_id: 'receipt', payload_hash: 'hash' },
      ])
      expect(() =>
        after
          .prepare('INSERT INTO watch_batch_receipts VALUES (?,?,?)')
          .run('missing', 'receipt', 'hash'),
      ).toThrow('account reference does not exist')
      const plan = after
        .prepare(
          'EXPLAIN QUERY PLAN SELECT payload_hash FROM watch_batch_receipts WHERE user_id=? AND batch_id=?',
        )
        .all('member', 'receipt') as { detail: string }[]
      expect(
        plan.some((p) => p.detail.includes('SEARCH watch_batch_receipts USING PRIMARY KEY')),
      ).toBe(true)
    } finally {
      after.close()
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
