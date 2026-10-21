import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, type TestDbInstance } from '../api/setup'

/**
 * Is it kept yet (`GET /api/activity/processing/posts`), for the theater's
 * "Getting it ready" stage. Ana must never learn anything about Ben's private
 * save, and the percent survives without the in-memory progress.
 */

let testInstance: TestDbInstance
let viewer: string | null = null
let mediaDir = ''
const keepOn = vi.hoisted(() => ({ value: true }))

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction: <R>(fn: () => R): R => testInstance.sqlite.transaction(fn)(),
}))
vi.mock('@/lib/auth/session', () => ({ getCurrentUserId: vi.fn(async () => viewer) }))
vi.mock('@/lib/sentry', () => ({
  metrics: new Proxy({}, { get: () => vi.fn() }),
  captureException: vi.fn(),
}))
vi.mock('@/lib/semantic/supervisor', () => ({
  wakeJobs: vi.fn(),
  jobActivity: () => null,
  embedQuery: vi.fn(),
  startSemanticProcesses: () => {},
}))
vi.mock('@/lib/keep/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/keep/config')>()),
  keepEnabled: () => keepOn.value,
}))
vi.mock('@/lib/keep/worker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/keep/worker')>()),
  wakeKeep: vi.fn(),
}))

const ANA = 'u_ana'
const BEN = 'u_ben'
const JO = 'u_jo'
const BASE = 'http://localhost:3000'
const NOW = Date.now()
const ago = (ms: number) => new Date(NOW - ms).toISOString()

function save(userId: string, id: string, extra: Partial<schema.NewBookmark> = {}) {
  testInstance.db
    .insert(schema.bookmarks)
    .values(
      createTestBookmark(userId, id, { text: `post ${id}`, processedAt: ago(60_000), ...extra }),
    )
    .run()
}

function keep(
  id: string,
  status: string,
  extra: Partial<typeof schema.keepJobs.$inferInsert> = {},
) {
  testInstance.db
    .insert(schema.keepJobs)
    .values({ platform: 'twitter', postId: id, status, updatedAt: ago(30_000), ...extra })
    .run()
}

function conversion(id: string, status: string) {
  testInstance.sqlite
    .prepare(
      `INSERT INTO media_conversions(platform,post_id,slot,source_path,source_bytes,source_created_at,source_hash,has_audio,status,updated_at)
       VALUES('twitter',?,'video-1','x.bin',6,?,'h',0,?,?)`,
    )
    .run(id, ago(1000), status, ago(1000))
}

type Status = {
  platform: string
  id: string
  state: string
  step: number | null
  percent: number | null
  keptAt: string | null
}

async function status(keys: string[], asUser: string | null = ANA) {
  viewer = asUser
  const { GET } = await import('@/app/api/activity/processing/posts/route')
  const res = await GET(
    new NextRequest(`${BASE}/api/activity/processing/posts?posts=${keys.join(',')}`),
  )
  const body = res.status === 200 ? await res.json() : null
  return {
    status: res.status,
    res,
    byId: Object.fromEntries(((body?.posts ?? []) as Status[]).map((p) => [p.id, p])),
    body,
  }
}

beforeEach(async () => {
  testInstance = createTestDb()
  viewer = null
  keepOn.value = true
  mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-keep-status-'))
  vi.stubEnv('MEDIA_DIR', mediaDir)
  vi.stubEnv('PROCESSING_MODE', '')
  vi.stubEnv('KEEP_MIN_FREE_GB', '0')
  testInstance.db
    .insert(schema.users)
    .values([
      { id: ANA, username: 'ana', displayName: 'Ana' },
      { id: BEN, username: 'ben', displayName: 'Ben' },
      { id: JO, username: 'jo', displayName: 'Jo' },
    ])
    .run()
  save(ANA, 'running')
  keep('running', 'running', { progress: 60 })
  save(ANA, 'pending')
  keep('pending', 'pending')
  save(ANA, 'fresh') // saved a minute ago, the worker hasn't seen it yet
  save(ANA, 'converting')
  keep('converting', 'converting')
  save(ANA, 'conv-row')
  keep('conv-row', 'done')
  conversion('conv-row', 'running')
  save(ANA, 'kept')
  keep('kept', 'done', { updatedAt: ago(20_000) })
  save(ANA, 'retrying')
  keep('retrying', 'failed', { attempts: 1, nextAttemptAt: ago(-600_000) })
  save(ANA, 'gaveup')
  keep('gaveup', 'unavailable')
  save(ANA, 'old', { processedAt: ago(5 * 86_400_000) }) // no job, long ago
  save(BEN, 'secret', { isPrivate: true })
  keep('secret', 'running', { progress: 40 })
  save(JO, 'shared')
  keep('shared', 'running', { progress: 25 })
  const { clearKeepProgress } = await import('@/lib/keep/progress')
  for (const id of ['running', 'shared', 'secret']) clearKeepProgress('twitter', id)
})

afterEach(() => {
  testInstance.close()
  vi.unstubAllEnvs()
  fs.rmSync(mediaDir, { recursive: true, force: true })
})

const keys = (...ids: string[]) => ids.map((id) => `twitter:${id}`)

describe('GET /api/activity/processing/posts', () => {
  it('says which posts are on their way, at which step and how far', async () => {
    const {
      status: code,
      byId,
      res,
    } = await status(
      keys(
        'running',
        'pending',
        'fresh',
        'converting',
        'conv-row',
        'kept',
        'retrying',
        'gaveup',
        'old',
      ),
    )
    expect(code).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(byId.running).toMatchObject({ state: 'keeping', step: 2, percent: 60 })
    expect(byId.pending).toMatchObject({ state: 'waiting', step: 2, percent: null })
    expect(byId.fresh).toMatchObject({ state: 'waiting', step: 2 })
    expect(byId.converting).toMatchObject({ state: 'converting', step: 3 })
    expect(byId['conv-row']).toMatchObject({ state: 'converting', step: 3 })
    expect(byId.kept).toMatchObject({ state: 'kept', step: null, keptAt: ago(20_000) })
    // A retry later, a download that gave up and an old save play what they can now.
    for (const id of ['retrying', 'gaveup', 'old']) expect(byId[id].state).toBe('none')
  })

  it('prefers the live percent, and drops it while converting', async () => {
    const progress = await import('@/lib/keep/progress')
    progress.reportKeepProgress('twitter', 'running', 73.6)
    expect((await status(keys('running'))).byId.running.percent).toBe(74)
    progress.reportKeepConverting('twitter', 'running')
    expect((await status(keys('running'))).byId.running).toMatchObject({
      state: 'converting',
      step: 3,
      percent: null,
    })
    progress.clearKeepProgress('twitter', 'running')
  })

  it('never answers for another member’s private save', async () => {
    const { byId, body } = await status(keys('secret', 'shared'))
    expect(byId.secret).toBeUndefined()
    expect(byId.shared).toMatchObject({ state: 'keeping', percent: 25 })
    expect(JSON.stringify(body)).not.toContain('secret')
    // Ben sees his own.
    expect((await status(keys('secret'), BEN)).byId.secret).toMatchObject({ percent: 40 })
  })

  it('names up to four of your people for "Shared with your people", never you', async () => {
    const { body } = await status(keys('running'))
    const names = (body.people as { username: string }[]).map((p) => p.username)
    expect(names.sort()).toEqual(['ben', 'jo'])
    expect(JSON.stringify(body.people)).not.toContain(BEN)
  })

  it('with keeping off nothing waits', async () => {
    keepOn.value = false
    const { byId } = await status(keys('running', 'pending', 'fresh', 'converting', 'kept'))
    for (const id of ['running', 'pending', 'fresh', 'converting'])
      expect(byId[id].state).toBe('none')
    expect(byId.kept.state).toBe('kept')
  })

  it('a full disk pauses waiting downloads (no "in a moment")', async () => {
    vi.stubEnv('KEEP_MIN_FREE_GB', '1000000')
    const { byId } = await status(keys('pending', 'fresh', 'running'))
    expect(byId.pending.state).toBe('none')
    expect(byId.fresh.state).toBe('none')
    expect(byId.running.state).toBe('keeping')
  })

  it('needs a member and at most 20 posts; ignores malformed keys', async () => {
    expect((await status(keys('running'), null)).status).toBe(401)
    const many = Array.from({ length: 21 }, (_, i) => `twitter:p${i}`)
    expect((await status(many)).status).toBe(400)
    const { byId, status: code } = await status(['nope', 'twitter:', ':x', 'twitter:running'])
    expect(code).toBe(200)
    expect(Object.keys(byId)).toEqual(['running'])
  })

  it('/doing shows the stored percent too', async () => {
    viewer = ANA
    const { GET } = await import('@/app/api/activity/processing/route')
    const body = await (
      await GET(new NextRequest(`${BASE}/api/activity/processing?scope=all`))
    ).json()
    const running = (body.items as { id: string; percent: number | null }[]).find(
      (i) => i.id === 'running',
    )
    expect(running?.percent).toBe(60)
  })
})
