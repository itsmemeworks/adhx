import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import { NextRequest } from 'next/server'
import { createTestDb, USER_A, USER_B, type TestDbInstance } from './setup'
import { users } from '@/lib/db/schema'

let mockUserId: string | null = USER_A
let testInstance: TestDbInstance
// Keeping is always off under the test runner; the helper tests turn it on.
let mockKeep = false

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
  renewSessionCookie: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/keep/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/keep/config')>()),
  keepEnabled: () => mockKeep,
}))

vi.mock('@/lib/sentry', () => ({
  metricCount: vi.fn(),
  captureException: vi.fn(),
  metrics: new Proxy({}, { get: () => vi.fn() }),
}))

import { GET as getBoard } from '@/app/api/admin/boards/[board]/route'
import { POST as postSystem } from '@/app/api/admin/system/route'
import { POST as workerPost } from '@/app/api/processing/jobs/route'
import { adminAudit } from '@/lib/db/schema'
import { __resetExtrasCache, extra } from '@/lib/settings/extras'
import { keepBackfill, keepConcurrency, keepMinFreeBytes } from '@/lib/keep/config'
import { indexingLevel } from '@/lib/processing/config'
import { speechEnabled } from '@/lib/semantic/config'
import { autoSyncEveryMinutes } from '@/lib/sync/auto'
import { signupAllowlist } from '@/lib/auth/allowlist'
import { setInviteMode } from '@/lib/auth/invites'
import { jevAvailable } from '@/lib/semantic/jev'
import { __resetServiceCalls, failureKind, noteServiceCall } from '@/lib/ops/service-calls'
import {
  hourlyCounts,
  judgeQueue,
  systemBoard,
  systemProblems,
  type QueueHealth,
  type SystemBoard,
} from '@/lib/admin/boards/system'
import { __resetWorkerPresence } from '@/lib/processing/presence'
import { setNewWorkPaused } from '@/lib/processing/pause'
import { SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'

const TOKEN = 't'.repeat(43)
const NOW = Date.parse('2026-10-29T12:00:00.000Z')

function boardRequest() {
  return getBoard(new NextRequest('http://localhost/api/admin/boards/system'), {
    params: Promise.resolve({ board: 'system' }),
  })
}

function worker(body: unknown, token: string | null = TOKEN) {
  return workerPost(
    new Request('https://adhx.example.com/api/processing/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  )
}

const claim = { action: 'claim', workerId: 'pete-mac', model: SEMANTIC_MODEL_VERSION, protocol: 2 }

function conversion(status: string, updatedAt: string, expiresAt: number | null = null) {
  testInstance.sqlite
    .prepare(
      `INSERT INTO media_conversions (platform, post_id, slot, source_path, source_bytes,
        source_created_at, source_hash, has_audio, status, next_attempt_at, expires_at, updated_at,
        worker_id)
       VALUES ('twitter', ?, 'video-1', 'a.mp4', 10, ?, 'h', 1, ?, 0, ?, ?, ?)`,
    )
    .run(
      `${Math.floor(Math.random() * 1e9)}`,
      updatedAt,
      status,
      expiresAt,
      updatedAt,
      expiresAt ? 'old-mac' : null,
    )
}

function check(board: SystemBoard, id: string) {
  const found = board.checks.find((c) => c.id === id)
  if (!found) throw new Error(`no ${id} check`)
  return found
}

beforeEach(async () => {
  testInstance = createTestDb()
  mockUserId = USER_A
  mockKeep = false
  __resetWorkerPresence()
  __resetExtrasCache()
  __resetServiceCalls()
  vi.stubEnv('SESSION_SECRET', 's'.repeat(48))
  for (const name of ['TYPESAFE_API_KEY', 'RESEND_API_KEY', 'SMTP_URL', 'TWITTER_CLIENT_ID'])
    vi.stubEnv(name, '')
  await testInstance.db.insert(users).values([
    { id: USER_A, username: 'pete', role: 'admin', displayName: 'Pete' },
    { id: USER_B, username: 'ana', displayName: 'Ana' },
  ])
})

afterEach(() => {
  testInstance.close()
  vi.unstubAllEnvs()
})

describe('admin System board', () => {
  it('is admins only and never cached', async () => {
    const ok = await boardRequest()
    expect(ok.status).toBe(200)
    expect(ok.headers.get('Cache-Control')).toBe('private, no-store')
    mockUserId = USER_B
    expect((await boardRequest()).status).toBe(403)
  })

  it('reads a local server: no helper, features switched off read as off, not broken', async () => {
    const board = await systemBoard(NOW)
    expect(board.helper.mode).toBe('local')
    expect(board.checks.some((c) => c.id === 'helper')).toBe(false)
    // Under the test runner keeping and understanding are off.
    expect(check(board, 'queue-downloads').state).toBe('off')
    expect(check(board, 'queue-understanding').state).toBe('off')
    expect(board.queues.map((q) => q.id)).toEqual(['downloads', 'understanding'])
    expect(board.settings.map((g) => g.group)).toContain('Understanding')
  })

  it('shows every secret only as Set or Not set', async () => {
    const secrets = {
      PROCESSING_WORKER_TOKEN: TOKEN,
      RESEND_API_KEY: 're_secret_value_123',
      SMTP_URL: 'smtps://user:hunter2@mail.example.com',
      SESSION_SECRET: 'session-secret-value',
      TYPESAFE_API_KEY: 'jev-secret-value',
      TWITTER_CLIENT_SECRET: 'x-secret-value',
      SENTRY_DSN: 'https://key@sentry.example.com/1',
    }
    for (const [k, v] of Object.entries(secrets)) vi.stubEnv(k, v)
    vi.stubEnv('PROCESSING_MODE', 'remote')
    const text = JSON.stringify(await systemBoard(NOW))
    for (const v of Object.values(secrets)) expect(text).not.toContain(v)
    expect(text).not.toContain('hunter2')
    const rows = (await systemBoard(NOW)).settings.flatMap((g) => g.rows)
    expect(rows.find((r) => r.name === 'PROCESSING_WORKER_TOKEN')?.value).toBe('Set')
    expect(rows.find((r) => r.name === 'SMTP_URL')?.value).toBe('Set')
  })

  describe('the Mac helper', () => {
    beforeEach(() => {
      vi.stubEnv('PROCESSING_MODE', 'remote')
      vi.stubEnv('PROCESSING_WORKER_TOKEN', TOKEN)
      vi.stubEnv('MEDIA_DIR', os.tmpdir())
      mockKeep = true
    })

    it('says why a helper is turned away', async () => {
      expect((await worker(claim, 'w'.repeat(43))).status).toBe(401)
      expect((await worker(claim, 'w'.repeat(43))).status).toBe(401)
      let board = await systemBoard()
      expect(board.helper.connected).toBe(false)
      expect(board.helper.lastRefused).toMatchObject({ reason: 'wrong_token', count: 2 })
      expect(check(board, 'helper').state).toBe('bad')
      expect(check(board, 'helper').summary).toMatch(/turned away.*doesn’t match/)
      expect(JSON.stringify(board)).not.toContain('w'.repeat(43))

      expect((await worker(claim, null)).status).toBe(401)
      board = await systemBoard()
      expect(board.helper.lastRefused).toMatchObject({ reason: 'no_token', count: 1 })
    })

    it('names a server that isn’t set up to take a helper', async () => {
      vi.stubEnv('PROCESSING_WORKER_TOKEN', 'short')
      expect((await worker(claim)).status).toBe(401)
      const board = await systemBoard()
      expect(board.helper.setupProblem).toBe('bad_server_token')
      expect(check(board, 'helper').summary).toMatch(/can’t connect/i)

      vi.stubEnv('PROCESSING_MODE', 'local')
      vi.stubEnv('PROCESSING_WORKER_TOKEN', TOKEN)
      expect((await worker(claim)).status).toBe(401)
      const local = await systemBoard()
      expect(local.helper.mode).toBe('local')
      expect(local.helper.lastRefused?.reason).toBe('local_mode')
    })

    it('shows a connected helper and what it said about itself', async () => {
      expect((await worker({ ...claim, kinds: ['text', 'image', 'video', 'speech'] })).status).toBe(
        200,
      )
      const board = await systemBoard()
      expect(board.helper.connected).toBe(true)
      expect(board.helper.workers[0]).toMatchObject({
        workerId: 'pete-mac',
        protocol: 2,
        kinds: ['text', 'image', 'video', 'speech'],
      })
      expect(check(board, 'helper')).toMatchObject({ state: 'ok', fix: null })
    })

    it('reads conversions waiting on a missing helper as broken, and a silent lease as stuck', async () => {
      conversion('pending', new Date(NOW - 60 * 60_000).toISOString())
      conversion('running', new Date(NOW - 60 * 60_000).toISOString(), NOW - 30 * 60_000)
      const board = await systemBoard(NOW)
      const q = board.queues.find((x) => x.id === 'conversions')!
      expect(q).toMatchObject({ waiting: 1, stuck: 1, where: 'the Mac helper', state: 'bad' })
      expect(q.summary).toMatch(/Mac helper, which isn’t connected/)
      expect(check(board, 'queue-conversions').fix).toMatch(/Open the ADHX helper/)
    })

    it('reads paused work as paused, not broken', async () => {
      conversion('pending', new Date(NOW - 60 * 60_000).toISOString())
      setNewWorkPaused(true)
      const q = (await systemBoard(NOW)).queues.find((x) => x.id === 'conversions')!
      expect(q.state).toBe('warn')
      expect(q.summary).toMatch(/Paused by an admin/)
    })

    it('counts broken checks for the admin menu', async () => {
      conversion('pending', new Date(NOW - 60 * 60_000).toISOString())
      expect(await systemProblems(NOW)).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('judgeQueue', () => {
  const base: Omit<QueueHealth, 'state' | 'summary' | 'hourly'> = {
    id: 'understanding',
    title: 'Understanding posts',
    where: 'this server',
    waiting: 0,
    retrying: 0,
    working: 0,
    stuck: 0,
    failed: 0,
    oldestWaitingAt: null,
    lastDoneAt: null,
    doneLastHour: 0,
    doneLastDay: 0,
  }
  const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()

  it('is caught up with nothing to do', () => {
    expect(judgeQueue(base, NOW, null)).toEqual({ state: 'ok', summary: 'All caught up.' })
  })

  it('is stalled when work has waited and nothing has finished or started', () => {
    const r = judgeQueue(
      { ...base, waiting: 40, oldestWaitingAt: ago(45), lastDoneAt: ago(120) },
      NOW,
      null,
    )
    expect(r.state).toBe('bad')
    expect(r.summary).toMatch(/^Stalled: 40 waiting for 45 minutes/)
  })

  it('is fine while it is working through a backlog', () => {
    expect(
      judgeQueue({ ...base, waiting: 40, oldestWaitingAt: ago(45), lastDoneAt: ago(1) }, NOW, null)
        .state,
    ).toBe('ok')
    expect(
      judgeQueue({ ...base, waiting: 40, working: 1, oldestWaitingAt: ago(45) }, NOW, null).state,
    ).toBe('ok')
  })

  it('asks for a look when things failed', () => {
    expect(judgeQueue({ ...base, failed: 3 }, NOW, null)).toEqual({
      state: 'warn',
      summary: '3 failed.',
    })
  })

  it('lets a block speak only when something is waiting on it', () => {
    const block = { state: 'bad' as const, summary: 'Waiting for the Mac helper.' }
    expect(judgeQueue(base, NOW, block).state).toBe('ok')
    expect(judgeQueue({ ...base, waiting: 1 }, NOW, block)).toEqual(block)
  })
})

function system(body: unknown) {
  return postSystem(
    new NextRequest('http://localhost/api/admin/system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

function settingRow(board: SystemBoard, name: string) {
  return board.settings.flatMap((g) => g.rows).find((r) => r.name === name)
}

describe('settings', () => {
  it('saves a key encrypted, uses it, and never shows it again', async () => {
    const key = 'jev_live_key_abcdefghijklmnop'
    expect(jevAvailable()).toBe(false)
    const res = await system({ action: 'set', name: 'TYPESAFE_API_KEY', value: key })
    expect(res.status).toBe(200)
    expect(extra('TYPESAFE_API_KEY')).toBe(key)
    expect(jevAvailable()).toBe(true)

    const raw = testInstance.sqlite
      .prepare("SELECT value FROM server_settings WHERE key = 'extra.TYPESAFE_API_KEY'")
      .get() as { value: string }
    expect(raw.value).not.toContain(key)

    const board = await systemBoard(NOW)
    expect(JSON.stringify(board)).not.toContain(key)
    expect(settingRow(board, 'TYPESAFE_API_KEY')).toMatchObject({ source: 'admin', value: 'Set' })
    expect(settingRow(board, 'TYPESAFE_API_KEY')?.edit?.value).toBeNull()
    const [audit] = await testInstance.db.select().from(adminAudit)
    expect(audit.action).toBe('set_setting')
    expect(audit.target).not.toContain(key)

    expect((await system({ action: 'set', name: 'TYPESAFE_API_KEY', value: null })).status).toBe(
      200,
    )
    expect(extra('TYPESAFE_API_KEY')).toBeNull()
  })

  it('beats the environment, and clearing goes back to it', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_from_env')
    expect(settingRow(await systemBoard(NOW), 'RESEND_API_KEY')?.source).toBe('env')
    expect(
      (await system({ action: 'set', name: 'RESEND_API_KEY', value: 're_other' })).status,
    ).toBe(200)
    expect(extra('RESEND_API_KEY')).toBe('re_other')
    expect(settingRow(await systemBoard(NOW), 'RESEND_API_KEY')?.edit).toMatchObject({
      source: 'admin',
      inEnv: true,
    })
    await system({ action: 'set', name: 'RESEND_API_KEY', value: null })
    expect(extra('RESEND_API_KEY')).toBe('re_from_env')
  })

  it('changes how the server works without a restart', async () => {
    vi.stubEnv('KEEP_CONCURRENCY', '3')
    expect(keepConcurrency()).toBe(3)
    const set = (name: string, value: string) => system({ action: 'set', name, value })
    expect((await set('KEEP_CONCURRENCY', '5')).status).toBe(200)
    expect(keepConcurrency()).toBe(5)
    expect((await set('KEEP_BACKFILL', 'off')).status).toBe(200)
    expect(keepBackfill()).toBe(false)
    expect((await set('KEEP_MIN_FREE_GB', '20')).status).toBe(200)
    expect(keepMinFreeBytes()).toBe(20 * 1024 ** 3)
    expect((await set('INDEXING_LEVEL', 'deep')).status).toBe(200)
    expect(indexingLevel()).toBe('deep')
    expect((await set('SEMANTIC_SPEECH', 'off')).status).toBe(200)
    expect(speechEnabled()).toBe(false)
    expect((await set('AUTO_SYNC_EVERY_MINUTES', '0')).status).toBe(200)
    expect(autoSyncEveryMinutes()).toBe(0)
    expect((await set('ALLOWED_EMAILS', 'ana@example.com, @friends.example')).status).toBe(200)
    expect(signupAllowlist()).toEqual(['ana@example.com', '@friends.example'])

    const board = await systemBoard(NOW)
    expect(settingRow(board, 'KEEP_CONCURRENCY')).toMatchObject({ value: '5', source: 'admin' })
    expect(settingRow(board, 'AUTO_SYNC_EVERY_MINUTES')?.value).toBe('Off')
    expect(settingRow(board, 'ALLOWED_EMAILS')?.value).toBe('2 entries')
  })

  it('refuses values the server can’t use', async () => {
    const set = (name: string, value: string) => system({ action: 'set', name, value })
    for (const [name, value] of [
      ['KEEP_CONCURRENCY', '9'],
      ['KEEP_CONCURRENCY', 'lots'],
      ['KEEP_MEDIA', 'maybe'],
      ['INDEXING_LEVEL', 'extreme'],
      ['KEEP_MAX_FILESIZE', 'big'],
      ['ALLOWED_EMAILS', 'ana, ben'],
    ]) {
      const res = await set(name, value)
      expect(res.status, `${name}=${value}`).toBe(409)
      expect((await res.json()).error).toBeTruthy()
    }
    expect(keepConcurrency()).toBe(2)
  })

  it('lists every setting once, and startup ones without a way to change them here', async () => {
    const rows = (await systemBoard(NOW)).settings.flatMap((g) => g.rows)
    const names = rows.map((r) => r.name).filter(Boolean)
    expect(new Set(names).size).toBe(names.length)
    const labels = rows.map((r) => r.label)
    expect(new Set(labels).size).toBe(labels.length)
    expect(rows.find((r) => r.name === 'PROCESSING_MODE')?.edit).toBeNull()
    expect(rows.find((r) => r.name === 'SESSION_SECRET')?.edit).toBeNull()
  })

  it('shows who can invite as Invites set it', async () => {
    setInviteMode('anyone')
    expect(
      (await systemBoard(NOW)).settings
        .flatMap((g) => g.rows)
        .find((r) => r.label === 'Who can invite')?.value,
    ).toBe('Any member')
  })

  it('checks values and refuses unknown names and members', async () => {
    expect(
      (await system({ action: 'set', name: 'SMTP_URL', value: 'mail.example.com' })).status,
    ).toBe(409)
    expect((await system({ action: 'set', name: 'PATH', value: '/tmp' })).status).toBe(400)
    mockUserId = USER_B
    expect((await system({ action: 'set', name: 'SERVER_LABEL', value: 'x' })).status).toBe(403)
  })

  it('names the server on the map', async () => {
    await system({ action: 'set', name: 'SERVER_LABEL', value: 'UGREEN NAS' })
    expect((await systemBoard(NOW)).host.label).toBe('UGREEN NAS')
  })

  it('tests Jev and says why it can’t', async () => {
    const res = await (await system({ action: 'test', service: 'jev' })).json()
    expect(res).toEqual({ ok: false, error: 'No Jev key is set' })
  })
})

describe('outside services', () => {
  it('reads Jev as failing when its newest call failed, without the error text', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'k')
    noteServiceCall('jev', 'search refine', { ok: true, ms: 300 }, NOW - 10 * 60_000)
    noteServiceCall(
      'jev',
      'channel names',
      { ok: false, error: new Error('Jev returned 401 {"to":"ana@example.com"}') },
      NOW - 60_000,
    )
    const board = await systemBoard(NOW)
    const jev = board.services.find((s) => s.id === 'jev')!
    expect(jev.state).toBe('warn')
    expect(jev.summary).toMatch(/HTTP 401/)
    expect(JSON.stringify(board)).not.toContain('ana@example.com')
    expect(jev.calls.map((c) => c.purpose)).toEqual(['channel names', 'search refine'])
  })

  it('is off without a key', async () => {
    const jev = (await systemBoard(NOW)).services.find((s) => s.id === 'jev')!
    expect(jev.state).toBe('off')
  })

  it('names failures by kind only', () => {
    expect(failureKind(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe('timed out')
    expect(failureKind(new Error('Resend send failed: 422 {"email":"a@b.c"}'))).toBe('HTTP 422')
    expect(failureKind(new Error('fetch failed'))).toBe('network error')
    expect(failureKind('weird')).toBe('failed')
  })
})

describe('hourlyCounts', () => {
  it('buckets the last 24 hours, oldest first', () => {
    const at = (h: number) => new Date(NOW - h * 3_600_000 - 1000).toISOString()
    const counts = hourlyCounts([at(0), at(0), at(5), at(23), at(30), null], NOW)
    expect(counts).toHaveLength(24)
    expect(counts[23]).toBe(2)
    expect(counts[18]).toBe(1)
    expect(counts[0]).toBe(1)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4)
  })
})
