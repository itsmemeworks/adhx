import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

function migrate(file: string) {
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/tsx/dist/cli.mjs'), 'src/lib/db/migrate.ts'],
    {
      env: { PATH: process.env.PATH, DATABASE_PATH: file, NODE_ENV: 'test' },
      encoding: 'utf8',
      timeout: 30000,
    },
  )
  expect(result.status, result.stdout + result.stderr).toBe(0)
}

describe('query-index upgrade', () => {
  it('preserves legacy FTS row ids and records, updates deletion cleanup, and can run twice', () => {
    const folder = mkdtempSync(join(tmpdir(), 'adhx-index-upgrade-')),
      file = join(folder, 'db.sqlite')
    let db: Database.Database | undefined
    try {
      migrate(file)
      db = new Database(file)
      db.exec(`INSERT INTO users(id,username) VALUES('a','alpha'),('b','beta');
    INSERT INTO bookmarks(user_id,platform,id,author,text,tweet_url,processed_at) VALUES
     ('a','twitter','same','author','words','https://example.com','2026-10-22'),
     ('b','twitter','same','author','words','https://example.com','2026-10-22'),
     ('a','instagram','same','author','other words','https://example.com','2026-10-22');
    INSERT INTO post_text_fts(rowid,platform,post_id,body) VALUES(41,'twitter','same','original words'),(42,'instagram','same','different words'),(43,'twitter','same','legacy duplicate');
    DROP TABLE post_text_keys;
    DELETE FROM migration_state WHERE key='keyword-rowid-lookup-v1';
    DROP INDEX bookmarks_user_feed_idx;
    CREATE INDEX bookmarks_user_processed_at_idx ON bookmarks(user_id,processed_at);
    CREATE INDEX idx_bookmarks_user_id ON bookmarks(user_id);
    DROP TRIGGER understanding_last_save_deleted;
    CREATE TRIGGER understanding_last_save_deleted AFTER DELETE ON bookmarks
    WHEN NOT EXISTS(SELECT 1 FROM bookmarks WHERE platform=OLD.platform AND id=OLD.id)
    BEGIN DELETE FROM post_text_fts WHERE platform=OLD.platform AND post_id=OLD.id; END;
   `)
      const saved = db.prepare('SELECT * FROM bookmarks ORDER BY user_id,platform,id').all()
      const words = db.prepare('SELECT rowid,* FROM post_text_fts ORDER BY rowid').all()
      db.close()
      db = undefined
      migrate(file)
      migrate(file)
      db = new Database(file)
      expect(db.prepare('SELECT * FROM bookmarks ORDER BY user_id,platform,id').all()).toEqual(
        saved,
      )
      expect(db.prepare('SELECT rowid,* FROM post_text_fts ORDER BY rowid').all()).toEqual(words)
      expect(db.prepare('SELECT * FROM post_text_keys ORDER BY row_id').all()).toEqual([
        { row_id: 41, platform: 'twitter', post_id: 'same' },
        { row_id: 42, platform: 'instagram', post_id: 'same' },
        { row_id: 43, platform: 'twitter', post_id: 'same' },
      ])
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all()
        .map((r) => (r as { name: string }).name)
      expect(indexes).toContain('bookmarks_user_feed_idx')
      expect(indexes).toContain('post_views_user_seen_idx')
      expect(indexes).toContain('post_views_post_seen_idx')
      expect(indexes).not.toContain('bookmarks_user_processed_at_idx')
      expect(indexes).not.toContain('idx_bookmarks_user_id')
      db.prepare("DELETE FROM bookmarks WHERE user_id='a' AND platform='twitter'").run()
      expect(db.prepare('SELECT count(*) AS n FROM post_text_keys WHERE row_id=41').get()).toEqual({
        n: 1,
      })
      db.prepare("DELETE FROM bookmarks WHERE user_id='b' AND platform='twitter'").run()
      expect(db.prepare('SELECT rowid FROM post_text_fts').all()).toEqual([{ rowid: 42 }])
      expect(db.prepare('SELECT row_id FROM post_text_keys').all()).toEqual([{ row_id: 42 }])
      expect(db.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
      expect(db.pragma('foreign_key_check')).toEqual([])
    } finally {
      db?.close()
      rmSync(folder, { recursive: true, force: true })
    }
  }, 30000)
})
