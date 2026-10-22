import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'

let sqlite: Database.Database
let database: ReturnType<typeof drizzle<typeof schema>>
let calls: { query: string; params: unknown[] }[] = []
vi.mock('@/lib/db', () => ({
  get db() {
    return database
  },
  runInTransaction: <R>(fn: () => R): R => sqlite.transaction(fn)(),
}))

import { saversFor, privateKeysFor } from '@/lib/people/savers'
import { seenKeys, newKeysFor, lastLookedAt } from '@/lib/feed/views'
import { extractedWordsFor } from '@/lib/semantic/extracted'
import { goneKeys } from '@/lib/semantic/gone'
import { postKinds } from '@/lib/feed/kinds'
import { getUnderstandingStatus, stillLearning } from '@/lib/semantic/status'
import { loadSearchItems } from '@/lib/semantic/items'
import { blendPage, __resetBlendSnapshots } from '@/lib/feed/blend-db'
import { hasPostText } from '@/lib/semantic/keywords'
import { labelExtractedMatches } from '@/lib/semantic/search'
import { processingActivity } from '@/lib/processing/doing'
import { keepStatusFor } from '@/lib/processing/keep-status'
import { listMembers } from '@/lib/people/members'
import { postPlays, watchCountFor, watchYear } from '@/lib/people/watch-counts'
import { __resetVectorIndex, refreshIndex } from '@/lib/semantic/vector-index'
import { reactedPosts } from '@/lib/reactions/reacted'
import { unseenSendsTo } from '@/lib/sends/sends'

const directory = mkdtempSync(join(tmpdir(), 'adhx-query-plans-'))
const count = Number(process.env.ADHX_QUERY_ROWS || 2000)
const users = Number(process.env.ADHX_QUERY_USERS || 100)
const dimensions = Number(process.env.ADHX_QUERY_VECTOR_DIMS || 2)
const embedding = new Float32Array(dimensions)
embedding[0] = 1
if (
  !Number.isInteger(count) ||
  count < 2000 ||
  count > 200000 ||
  !Number.isInteger(users) ||
  users < 4 ||
  users > 1000 ||
  !Number.isInteger(dimensions) ||
  dimensions < 1 ||
  dimensions > 1024
)
  throw new Error(
    'Use 2,000–200,000 saves, 4–1,000 users and 1–1,024 vector dimensions for this synthetic fixture',
  )
const at = '2026-10-22T10:00:00.000Z'
const keys = Array.from({ length: 40 }, (_, i) => ({
  platform: i % 2 ? 'instagram' : 'twitter',
  id: `p${Math.floor(count / 4) - 1 - i}`,
}))
const strings = keys.map((k) => `${k.platform}:${k.id}`)
const measurements: unknown[] = []

beforeAll(() => {
  const file = join(directory, 'fixture.db')
  const migration = spawnSync(
    process.execPath,
    [resolve('node_modules/tsx/dist/cli.mjs'), 'src/lib/db/migrate.ts'],
    {
      env: { ...process.env, DATABASE_PATH: file },
      encoding: 'utf8',
      timeout: 30_000,
    },
  )
  expect(migration.status, migration.stderr + migration.stdout).toBe(0)
  sqlite = new Database(file)
  database = drizzle(sqlite, {
    schema,
    logger: {
      logQuery(query, params) {
        calls.push({ query, params })
      },
    },
  })
  const person = sqlite.prepare('INSERT INTO users(id,username) VALUES(?,?)')
  const save = sqlite.prepare(
    "INSERT INTO bookmarks(user_id,platform,id,author,text,tweet_url,processed_at,source,is_private) VALUES(?,?,?,'author','synthetic post','https://example.com/post',?,'manual',?)",
  )
  const media = sqlite.prepare(
    "INSERT INTO bookmark_media(id,user_id,platform,bookmark_id,media_type,original_url) VALUES(?,?,?,?,'video','https://example.com/video.mp4')",
  )
  const view = sqlite.prepare(
    'INSERT INTO post_views(user_id,platform,post_id,seen_at) VALUES(?,?,?,?)',
  )
  const tag = sqlite.prepare(
    "INSERT INTO bookmark_tags(user_id,platform,bookmark_id,tag) VALUES(?,?,?,'topic')",
  )
  const watch = sqlite.prepare(
    'INSERT INTO post_watch_counts(user_id,platform,post_id,year,plays,seconds,first_at,last_at) VALUES(?,?,?,2026,3,120,?,?)',
  )
  const vector = sqlite.prepare(
    "INSERT INTO post_embeddings(platform,post_id,kind,model,content_hash,status,vector,dims,created_at) VALUES(?,?,'text',?,'synthetic','ok',?,?,?)",
  )
  const words = sqlite.prepare(
    "INSERT INTO post_extracted_text(platform,post_id,kind,model,content_hash,status,text,created_at) VALUES(?,?,'screen','synthetic','synthetic','ok','synthetic words',?)",
  )
  const reaction = sqlite.prepare(
    'INSERT INTO post_reactions(id,user_id,platform,post_id,text,created_at) VALUES(?,?,?,?,?,?)',
  )
  const fts = sqlite.prepare('INSERT INTO post_text_fts(platform,post_id,body) VALUES(?,?,?)')
  const lookup = sqlite.prepare('INSERT INTO post_text_keys(row_id,platform,post_id) VALUES(?,?,?)')
  const send = sqlite.prepare(
    'INSERT INTO post_sends(from_user_id,to_user_id,platform,post_id,created_at) VALUES(?,?,?,?,?)',
  )
  sqlite.transaction(() => {
    for (let u = 0; u < users; u++) person.run(`u${u}`, `person${u}`)
    for (let i = 0; i < count; i++) {
      const user = `u${i % users}`,
        platform = i % 2 ? 'instagram' : 'twitter',
        id = `p${Math.floor(i / 4)}`
      save.run(user, platform, id, at, i % 17 === 0 ? 1 : 0)
      media.run(`m${i}`, user, platform, id)
      view.run(`u${(i + 7) % users}`, platform, id, at)
      watch.run(user, platform, id, at, at)
      if (i % 5 === 0) tag.run(user, platform, id)
      send.run(user, `u${(i + 13) % users}`, platform, id, at)
      if (i % 4 < 2) {
        vector.run(
          platform,
          id,
          SEMANTIC_MODEL_VERSION,
          Buffer.from(embedding.buffer),
          dimensions,
          at,
        )
        words.run(platform, id, at)
        reaction.run(`r${i}`, user, platform, id, 'synthetic reaction '.repeat(30), at)
        const inserted = fts.run(platform, id, 'synthetic post')
        lookup.run(inserted.lastInsertRowid, platform, id)
      }
    }
  })()
  // This is the distribution seen by the real query planner, not an empty
  // schema where a tiny-table scan is often its legitimate cheapest choice.
  if (!process.env.ADHX_QUERY_NO_STATS) sqlite.pragma('optimize=0x10002')
}, 60_000)

afterAll(() => {
  if (process.env.ADHX_QUERY_REPORT)
    writeFileSync(
      process.env.ADHX_QUERY_REPORT,
      JSON.stringify(
        {
          saves: count,
          users,
          dimensions,
          sqlite: sqlite.prepare('select sqlite_version() as version').get(),
          measurements,
        },
        null,
        2,
      ),
    )
  sqlite?.close()
  rmSync(directory, { recursive: true, force: true })
})

const cases: [string, () => unknown | Promise<unknown>, boolean][] = [
  ['savers', () => saversFor(keys, 'u0'), true],
  ['private save flags', () => privateKeysFor(keys, 'u0'), true],
  ['watched flags', () => seenKeys('u0', strings), true],
  ['new flags', () => newKeysFor('u0', strings), true],
  ['extracted words', () => extractedWordsFor(strings), true],
  ['unavailable flags', () => goneKeys(strings), true],
  ['media kinds', () => postKinds(strings), true],
  ['learning flags', () => stillLearning(strings), true],
  ['understanding progress', () => getUnderstandingStatus('u0'), true],
  [
    'search and queue hydration',
    () =>
      loadSearchItems(
        keys.map((k) => ({
          platform: k.platform,
          postId: k.id,
          key: `${k.platform}:${k.id}`,
          score: 1,
          matched: [],
          strength: 'good' as const,
        })),
        'u0',
      ),
    true,
  ],
  ['keyword existence', () => hasPostText(keys[0].platform, keys[0].id), true],
  [
    'keyword result labels',
    () =>
      labelExtractedMatches(
        strings.map((key) => ({ key, matched: ['keywords' as const] })),
        'words',
      ),
    true,
  ],
  [
    'legacy keyword existence (comparison only)',
    () =>
      database.all(
        sql`SELECT 1 FROM post_text_fts WHERE platform=${keys[0].platform} AND post_id=${keys[0].id} LIMIT 1`,
      ),
    false,
  ],
  ['processing activity', () => processingActivity('u0', 'all', Date.parse(at) + 3600000), false],
  ['own play counts', () => watchCountFor('u0', keys[0].platform, keys[0].id), true],
  ['post play totals', () => postPlays('u0', keys[0].platform, keys[0].id), true],
  ['yearly watch totals', () => watchYear('u0', 2026), false],
  [
    'cold vector index',
    () => {
      __resetVectorIndex()
      return refreshIndex(true)
    },
    false,
  ],
  ['incremental vector index', () => refreshIndex(true), false],
  [
    'playback preparation status',
    () => keepStatusFor('u0', keys.slice(0, 20), { now: Date.parse(at) + 3600000 }),
    true,
  ],
  ['people directory', () => listMembers('u0'), false],
  ['reactions page', () => reactedPosts('u0', 0, 20), false],
  ['last sitting', () => lastLookedAt('u0', Date.parse(at) + 3600000), false],
  ['incoming sends', () => unseenSendsTo('u0'), false],
  [
    'first feed page',
    () => {
      __resetBlendSnapshots()
      return blendPage('u0', 'lineup', { limit: 20, now: Date.parse(at) + 3600000 })
    },
    false,
  ],
]

describe('web and phone production query plans', () => {
  for (const [name, run, pointLookup] of cases)
    it(
      name,
      async () => {
        const times: number[] = []
        let captured: typeof calls = []
        for (let i = 0; i < 3; i++) {
          calls = []
          const start = performance.now()
          await run()
          times.push(performance.now() - start)
          captured = calls
        }
        const queries = captured
          .filter((c) => /^(select|with)\b/i.test(c.query.trim()))
          .map((c) => {
            const stmt = sqlite.prepare(c.query)
            const sqlStart = performance.now()
            stmt.all(...c.params)
            const sqlMs = performance.now() - sqlStart
            return {
              sql: c.query,
              sqlMs,
              plan: sqlite
                .prepare(`EXPLAIN QUERY PLAN ${c.query}`)
                .all(...c.params)
                .map((r) => (r as { detail: string }).detail),
            }
          })
        measurements.push({
          name,
          medianMs: times.sort((a, b) => a - b)[1],
          queryCount: queries.length,
          queries,
        })
        if (pointLookup && !process.env.ADHX_QUERY_ALLOW_SCANS) {
          // Global aggregations above are intentionally separate. A lookup of a
          // small explicit key set must not walk other users' history or vectors.
          const unbounded = queries
            .flatMap((q) => q.plan)
            .filter((p) =>
              /^SCAN (bookmarks|post_embeddings|post_extracted_text|understanding_queue)( |$)/.test(
                p,
              ),
            )
          expect(unbounded, `${name} should use its composite keys`).toEqual([])
        }
        if (name === 'search and queue hydration') expect(queries.length).toBeLessThanOrEqual(12)
        if (name === 'processing activity') {
          const plans = queries.flatMap((q) => q.plan).join('\n')
          expect(plans).toContain('post_embeddings_failed_recent_idx')
          expect(plans).toContain('post_extracted_failed_recent_idx')
          expect(plans).not.toMatch(/SCAN post_(embeddings|extracted_text)( |\n)/)
        }
        if (name === 'cold vector index' || name === 'incremental vector index') {
          for (const query of queries) {
            expect(query.plan.join('\n')).toContain('post_embeddings_model_created_idx')
            expect(query.plan.join('\n')).not.toMatch(/SCAN post_embeddings( |\n)/)
          }
          if (name === 'incremental vector index') expect(queries).toHaveLength(1)
        }
        if (name === 'last sitting') {
          expect(
            queries.some((q) => q.plan.some((p) => p.includes('post_views_user_seen_idx'))),
          ).toBe(true)
          expect(
            queries.flatMap((q) => q.plan).some((p) => p.includes('USE TEMP B-TREE FOR ORDER BY')),
          ).toBe(false)
        }
        if (name === 'incoming sends')
          expect(queries.some((q) => q.plan.some((p) => p.includes('post_sends_inbox_idx')))).toBe(
            true,
          )
        expect(queries.length).toBeGreaterThan(0)
      },
      60_000,
    )
})
