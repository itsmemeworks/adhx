import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { NextRequest } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, type TestDbInstance } from '../api/setup'

/**
 * "What your ADHX is doing" (`/api/activity/processing`): each post on its
 * way, step by step, for one viewer. Ana must never see, count or retry Ben's
 * private save; only people who saved a post may retry it.
 */

let testInstance: TestDbInstance
let viewer: string | null = null
let mediaDir = ''

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
/** Keeping runs here, but the worker itself never starts. */
vi.mock('@/lib/keep/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/keep/config')>()),
  keepEnabled: () => true,
}))
vi.mock('@/lib/keep/worker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/keep/worker')>()),
  wakeKeep: vi.fn(),
}))

const ANA = 'u_ana'
const BEN = 'u_ben'
const BASE = 'http://localhost:3000'
const NOW = Date.now()
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const later = (ms: number) => new Date(NOW + ms).toISOString()

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
    .values({ platform: 'twitter', postId: id, status, updatedAt: ago(60_000), ...extra })
    .run()
}

function queue(
  id: string,
  kind: string,
  extra: Partial<typeof schema.understandingQueue.$inferInsert> = {},
) {
  testInstance.db
    .insert(schema.understandingQueue)
    .values({
      platform: 'twitter',
      postId: id,
      kind,
      priority: 10,
      attempts: 0,
      enqueuedAt: ago(1000),
      nextAttemptAt: ago(1000),
      ...extra,
    })
    .run()
}

type Item = {
  id: string
  status: string
  step: number
  stepLabel: string
  reason: string | null
  retry: boolean
  keepLinkOnly: boolean
  retryInfo: { attempt: number; of: number } | null
  savers: { username: string; isYou: boolean }[]
}

async function doing(scope = 'all', asUser: string | null = viewer) {
  viewer = asUser
  const { GET } = await import('@/app/api/activity/processing/route')
  const res = await GET(new NextRequest(`${BASE}/api/activity/processing?scope=${scope}`))
  const body = res.status === 200 ? await res.json() : null
  return { status: res.status, items: (body?.items ?? []) as Item[], summary: body?.summary }
}

async function action(kind: 'retry' | 'link-only', body: unknown, asUser: string) {
  viewer = asUser
  const route =
    kind === 'retry'
      ? await import('@/app/api/activity/processing/retry/route')
      : await import('@/app/api/activity/processing/link-only/route')
  const res = await route.POST(
    new NextRequest(`${BASE}/api/activity/processing/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: await res.json() }
}

const byId = (items: Item[]) => Object.fromEntries(items.map((i) => [i.id, i]))

beforeEach(() => {
  testInstance = createTestDb()
  viewer = null
  mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-doing-'))
  vi.stubEnv('MEDIA_DIR', mediaDir)
  vi.stubEnv('PROCESSING_MODE', '')
  testInstance.db
    .insert(schema.users)
    .values([
      { id: ANA, username: 'ana', displayName: 'Ana' },
      { id: BEN, username: 'ben', displayName: 'Ben' },
    ])
    .run()
  // Ana's download is running.
  save(ANA, 'downloading')
  keep('downloading', 'running')
  // Ben's private save: nobody else may learn it exists.
  save(BEN, 'secret', { isPrivate: true })
  keep('secret', 'unavailable', { lastError: 'This video is private' })
  queue('secret', 'text')
  // Shared by both; Ben's download gave up (private on X), so it needs someone.
  save(BEN, 'stuck')
  keep('stuck', 'unavailable', { lastError: 'ERROR: Private video. Sign in', attempts: 6 })
  // Ben's: failed once, retrying later.
  save(BEN, 'retrying')
  keep('retrying', 'failed', {
    lastError: 'Read timed out',
    attempts: 1,
    nextAttemptAt: later(60_000),
  })
  // Ana's: kept, being listened to.
  save(ANA, 'listening')
  keep('listening', 'done')
  queue('listening', 'speech')
  queue('listening', 'text')
  // Ana's: kept and learned a few minutes ago.
  save(ANA, 'finished')
  keep('finished', 'done', { updatedAt: ago(120_000) })
  // Ana's: learning failed once, waiting to try again.
  save(ANA, 'learnwait')
  keep('learnwait', 'done')
  queue('learnwait', 'image', { attempts: 1, nextAttemptAt: later(30_000), lastError: 'boom' })
  // Old and done: not listed.
  save(ANA, 'old', { processedAt: ago(5 * 86_400_000) })
  keep('old', 'done', { updatedAt: ago(5 * 86_400_000) })
})

afterEach(() => {
  testInstance.close()
  vi.unstubAllEnvs()
  fs.rmSync(mediaDir, { recursive: true, force: true })
})

describe('GET /api/activity/processing', () => {
  it('needs sign-in', async () => {
    expect((await doing('all', null)).status).toBe(401)
  })

  it('never shows or counts another member’s private save', async () => {
    const { items, summary } = await doing('all', ANA)
    const ids = items.map((i) => i.id).sort()
    expect(ids).toEqual(['downloading', 'finished', 'learnwait', 'listening', 'retrying', 'stuck'])
    expect(JSON.stringify(items)).not.toContain('secret')
    expect(summary.needsYou).toBe(1)
    // Ben sees his own private one, named as his.
    const ben = byId((await doing('all', BEN)).items)
    expect(ben.secret.savers).toEqual([expect.objectContaining({ username: 'ben', isYou: true })])
  })

  it('says where each post is and why', async () => {
    const items = byId((await doing('all', ANA)).items)
    expect(items.downloading).toMatchObject({
      status: 'working',
      step: 2,
      stepLabel: 'Keeping a copy',
    })
    expect(items.stuck).toMatchObject({
      status: 'needs_you',
      step: 2,
      reason: 'It’s private on X.',
    })
    expect(items.retrying).toMatchObject({
      status: 'waiting',
      reason: 'X is slow to answer.',
      retryInfo: expect.objectContaining({ attempt: 2, of: 6 }),
    })
    expect(items.listening).toMatchObject({ status: 'working', step: 4 })
    expect(items.learnwait).toMatchObject({ status: 'waiting', step: 6 })
    expect(items.finished).toMatchObject({ status: 'ready', step: 7, stepLabel: 'Ready' })
    // Named savers, newest first; signed-in members only.
    expect(items.stuck.savers.map((s) => s.username)).toEqual(['ben'])
  })

  it('offers Retry and Keep the link only to people who saved it', async () => {
    const ana = byId((await doing('all', ANA)).items)
    expect(ana.stuck).toMatchObject({ retry: false, keepLinkOnly: false })
    const ben = byId((await doing('all', BEN)).items)
    expect(ben.stuck).toMatchObject({ retry: true, keepLinkOnly: true })
    expect(ben.retrying.retry).toBe(true)
  })

  it('scope=mine and scope=needs', async () => {
    const mine = (await doing('mine', ANA)).items.map((i) => i.id).sort()
    expect(mine).toEqual(['downloading', 'finished', 'learnwait', 'listening'])
    const needs = (await doing('needs', BEN)).items.map((i) => i.id).sort()
    expect(needs).toEqual(['secret', 'stuck'])
  })

  it('reports free space and the processing mode', async () => {
    const { summary } = await doing('all', ANA)
    expect(summary.freeBytes).toBeGreaterThan(0)
    expect(summary.processing).toBe('local')
    expect(summary.remoteConnected).toBeNull()
  })

  it('says whether the Mac helper is connected in remote mode', async () => {
    vi.stubEnv('PROCESSING_MODE', 'remote')
    const { noteWorkerSeen } = await import('@/lib/processing/presence')
    noteWorkerSeen(NOW - 10 * 60_000)
    expect((await doing('all', ANA)).summary.remoteConnected).toBe(false)
    const items = byId((await doing('all', ANA)).items)
    expect(items.listening).toMatchObject({
      status: 'waiting',
      reason: 'Waiting for the Mac helper to connect.',
    })
    noteWorkerSeen()
    expect((await doing('all', ANA)).summary.remoteConnected).toBe(true)
  })
})

describe('retry and keep the link only', () => {
  it('only someone who saved it can retry, and a private save looks like any other refusal', async () => {
    expect((await action('retry', { platform: 'twitter', id: 'stuck' }, ANA)).status).toBe(403)
    const secret = await action('retry', { platform: 'twitter', id: 'secret' }, ANA)
    const nothing = await action('retry', { platform: 'twitter', id: 'nope' }, ANA)
    expect(secret).toEqual(nothing)
    expect((await action('retry', { platform: 'twitter' }, BEN)).status).toBe(400)
  })

  it('retry puts a download that gave up back in line', async () => {
    const res = await action('retry', { platform: 'twitter', id: 'stuck' }, BEN)
    expect(res.status).toBe(200)
    expect(res.body.retried).toBeGreaterThan(0)
    const job = testInstance.db
      .select()
      .from(schema.keepJobs)
      .where(and(eq(schema.keepJobs.platform, 'twitter'), eq(schema.keepJobs.postId, 'stuck')))
      .get()!
    expect(job).toMatchObject({ status: 'pending', attempts: 0, lastError: null })
  })

  it('retry re-queues learning that gave up', async () => {
    testInstance.db
      .insert(schema.postEmbeddings)
      .values({
        platform: 'twitter',
        postId: 'finished',
        kind: 'image',
        model: 'm',
        contentHash: 'h',
        status: 'failed',
        createdAt: ago(1000),
      } as never)
      .run()
    expect(byId((await doing('all', ANA)).items).finished.status).toBe('needs_you')
    await action('retry', { platform: 'twitter', id: 'finished' }, ANA)
    const rows = testInstance.db.all<{ kind: string }>(
      sql`SELECT kind FROM understanding_queue WHERE post_id = 'finished'`,
    )
    expect(rows.map((r) => r.kind)).toEqual(['image'])
  })

  it('keep the link only stops asking', async () => {
    expect((await action('link-only', { platform: 'twitter', id: 'stuck' }, ANA)).status).toBe(403)
    expect((await action('link-only', { platform: 'twitter', id: 'stuck' }, BEN)).status).toBe(200)
    expect((await doing('needs', BEN)).items.map((i) => i.id)).toEqual(['secret'])
    // Not stuck any more: nothing to accept.
    expect((await action('link-only', { platform: 'twitter', id: 'stuck' }, BEN)).status).toBe(409)
  })
})

describe('GET /api/app/doing', () => {
  it('answers the phone in the same shape', async () => {
    const { createAccessKey } = await import('@/lib/auth/access-keys')
    const { key } = createAccessKey(ANA, 'iPhone', 'phone')!
    const { GET } = await import('@/app/api/app/doing/route')
    const res = await GET(
      new Request(`${BASE}/api/app/doing?scope=mine`, {
        headers: { authorization: `Bearer ${key}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items.map((i: Item) => i.id).sort()).toEqual([
      'downloading',
      'finished',
      'learnwait',
      'listening',
    ])
    expect(body.summary).toHaveProperty('onTheirWay')
    const noKey = await GET(new Request(`${BASE}/api/app/doing`))
    expect(noKey.status).toBe(401)
  })
})

it('counts the full cold queue and keeps an older failure actionable beyond the display limit', async () => {
  testInstance.db.delete(schema.bookmarks).run()
  testInstance.db.delete(schema.keepJobs).run()
  testInstance.db.delete(schema.understandingQueue).run()
  for (let n = 0; n < 450; n++) {
    save(ANA, `cold-${n}`, { processedAt: ago(n * 1000) })
    keep(
      `cold-${n}`,
      n === 449 ? 'unavailable' : 'pending',
      n === 449 ? { lastError: 'private' } : {},
    )
  }
  const all = await doing('all', ANA)
  expect(all.items).toHaveLength(60)
  expect(all.summary).toMatchObject({ onTheirWay: 450, keeping: 449, needsYou: 1 })
  expect(all.items[0].id).toBe('cold-449')
  const needs = await doing('needs', ANA)
  expect(needs.items.map((i) => i.id)).toEqual(['cold-449'])
  expect(needs.summary.onTheirWay).toBe(450)
})

it('does not let recent ready items hide older work, or count another account’s private backlog', async () => {
  for (let n = 0; n < 450; n++) {
    save(BEN, `private-${n}`, { isPrivate: true })
    keep(`private-${n}`, 'pending')
    save(ANA, `ready-${n}`)
    keep(`ready-${n}`, 'done')
  }
  save(ANA, 'older-work', { processedAt: ago(5 * 86_400_000) })
  keep('older-work', 'done', { updatedAt: ago(5 * 86_400_000) })
  queue('older-work', 'video')
  const all = await doing('all', ANA)
  expect(all.items.some((i) => i.id === 'older-work')).toBe(true)
  expect(all.items.some((i) => i.id.startsWith('private-'))).toBe(false)
  expect(all.summary.onTheirWay).toBe(6)
})

it('answers summary polls without hydrating post media or faces', async () => {
  viewer = ANA
  const phone = await import('@/lib/app/phone-app')
  const hydrate = vi.spyOn(phone, 'appPost')
  try {
    const { GET } = await import('@/app/api/activity/processing/route')
    const response = await GET(new NextRequest(`${BASE}/api/activity/processing?summary=1`))
    const body = await response.json()
    expect(body.summary.onTheirWay).toBe(5)
    expect(body).not.toHaveProperty('items')
    expect(hydrate).not.toHaveBeenCalled()
  } finally {
    hydrate.mockRestore()
  }
})

describe('why a download failed, in plain words', () => {
  it('says a sign-in-only post needs a signed-in account, not that it’s private', async () => {
    const { keepReason } = await import('@/lib/processing/doing')
    expect(
      keepReason(
        '[TikTok] 7699168500253854998: This post may not be comfortable for some audiences. Log in for access. Use --cookies-from-browser or --cookies for the authentication.',
        'tiktok',
      ),
    ).toBe('TikTok only shows this one to signed-in accounts.')
    expect(keepReason('[youtube] x: Sign in to confirm your age', 'youtube')).toBe(
      'YouTube only shows this one to signed-in accounts.',
    )
    expect(keepReason('[TikTok] x: This post is private', 'tiktok')).toBe('It’s private on TikTok.')
  })
})
