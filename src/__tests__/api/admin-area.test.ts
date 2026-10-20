import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { createTestDb, USER_A, USER_B, createTestBookmark, type TestDbInstance } from './setup'
import {
  accessKeys,
  adminAudit,
  analyticsEvents,
  bookmarks,
  momentLog,
  reactionCounts,
  users,
} from '@/lib/db/schema'

let mockUserId: string | null = USER_A
let testInstance: TestDbInstance

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

vi.mock('@/lib/sentry', () => ({
  metricCount: vi.fn(),
  captureException: vi.fn(),
  metrics: new Proxy({}, { get: () => vi.fn() }),
}))

// The live engine runs only while someone listens; the boards read a quiet one.
vi.mock('@/lib/moments/engine', () => ({
  getMomentsSnapshot: vi.fn(async () => ({
    label: 'Right now',
    hours: 24,
    moments: [],
    forming: [],
    stream: [],
    stats: { today: 0, lastHour: 0 },
  })),
  hasMoment: vi.fn(async () => true),
}))

import { GET as getBoard } from '@/app/api/admin/boards/[board]/route'
import { GET as getPerson, POST as postRole } from '@/app/api/admin/people/[username]/route'
import { DELETE as deletePhone } from '@/app/api/admin/people/[username]/phones/[id]/route'
import { POST as postProcessing } from '@/app/api/admin/processing/route'
import { GET as getPost } from '@/app/api/admin/posts/route'
import { POST as postUser } from '@/app/api/admin/users/route'
import { GET as getMe } from '@/app/api/auth/me/route'
import { POST as clearAccount } from '@/app/api/account/clear/route'
import { ADMIN_BOARDS } from '@/lib/admin/boards'
import { countReaction, logMomentFormed, noteTuneIn, __resetTunedIn } from '@/lib/admin/counts'
import { react } from '@/lib/moments/react'
import { __resetPresence, joinWatch } from '@/lib/moments/presence'
import { LAST_SEEN_EVERY_MS, touchLastSeen, phonePlatformOf } from '@/lib/people/last-seen'
import { newWorkPaused } from '@/lib/processing/pause'
import { reactionsSummary } from '@/lib/admin/boards/live'

const USER_C = 'user-c-789'

function boardRequest(board: string, query = '') {
  return getBoard(new NextRequest(`http://localhost/api/admin/boards/${board}${query}`), {
    params: Promise.resolve({ board }),
  })
}

function json(body: unknown, method = 'POST') {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

describe('admin area', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    mockUserId = USER_A
    __resetTunedIn()
    __resetPresence()
    await testInstance.db.insert(users).values([
      { id: USER_A, username: 'pete', role: 'admin', displayName: 'Pete' },
      { id: USER_B, username: 'ana', displayName: 'Ana' },
      { id: USER_C, username: 'ben', displayName: 'Ben' },
    ])
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('who can see it', () => {
    it.each(ADMIN_BOARDS)(
      '%s: admins get it, no-store; members 403; strangers 401',
      async (board) => {
        const ok = await boardRequest(board)
        expect(ok.status).toBe(200)
        expect(ok.headers.get('Cache-Control')).toBe('private, no-store')

        mockUserId = USER_B
        const member = await boardRequest(board)
        expect(member.status).toBe(403)
        expect(member.headers.get('Cache-Control')).toBe('private, no-store')

        mockUserId = null
        expect((await boardRequest(board)).status).toBe(401)
      },
    )

    it('404s an unknown section', async () => {
      expect((await boardRequest('nope')).status).toBe(404)
    })

    it('gates a person and the actions the same way', async () => {
      const ctx = { params: Promise.resolve({ username: 'ana' }) }
      mockUserId = USER_B
      expect((await getPerson(new NextRequest('http://localhost/x'), ctx)).status).toBe(403)
      expect(
        (await postRole(new NextRequest('http://localhost/x', json({ role: 'admin' })), ctx))
          .status,
      ).toBe(403)
      expect(
        (await postProcessing(new NextRequest('http://localhost/x', json({ action: 'pause' }))))
          .status,
      ).toBe(403)
      mockUserId = null
      expect((await getPerson(new NextRequest('http://localhost/x'), ctx)).status).toBe(401)
    })
  })

  describe('Just for me saves are counted, never listed', () => {
    beforeEach(async () => {
      // Ana's private save is the only save of p1; p2 is shared by Ana and Ben.
      await testInstance.db
        .insert(bookmarks)
        .values([
          createTestBookmark(USER_B, 'p1', { text: 'secret pick', isPrivate: true }),
          createTestBookmark(USER_B, 'p2', { text: 'shared pick', note: 'so good' }),
          createTestBookmark(USER_C, 'p2', { text: 'shared pick' }),
          createTestBookmark(USER_B, 'p3', { text: 'private note', isPrivate: true, note: 'hush' }),
        ])
    })

    it('counts them on the overview but lists only shared posts', async () => {
      const data = await (await boardRequest('overview')).json()
      expect(data.saves.total).toBe(4)
      expect(data.saves.privateTotal).toBe(2)
      expect(data.mostSaved.map((m: { post: { id: string } }) => m.post.id)).toEqual(['p2'])
      expect(JSON.stringify(data)).not.toContain('secret pick')
      expect(JSON.stringify(data)).not.toContain('hush')
      expect(data.notes.total).toBe(1)
    })

    it('counts them on People and a person, but never lists them', async () => {
      const people = await (await boardRequest('people')).json()
      const ana = people.members.find((m: { username: string }) => m.username === 'ana')
      expect(ana).toMatchObject({ saves: 3, privateSaves: 2, notes: 1 })

      const res = await getPerson(new NextRequest('http://localhost/x'), {
        params: Promise.resolve({ username: 'ana' }),
      })
      const person = await res.json()
      expect(person.member.privateSaves).toBe(2)
      expect(person.sharedSaves.map((s: { id: string }) => s.id)).toEqual(['p2'])
      expect(JSON.stringify(person)).not.toContain('secret pick')
      expect(JSON.stringify(person)).not.toContain('hush')
    })

    it('shows a private-only post as counts in the inspector', async () => {
      const res = await getPost(
        new NextRequest('http://localhost/api/admin/posts?platform=twitter&id=p1'),
      )
      const body = await res.json()
      expect(body).toMatchObject({ listable: false, card: null, privateSaves: 1, sharedSaves: 0 })
      expect(body.text).toBeNull()
      expect(body.savers).toEqual([])

      const shared = await (
        await getPost(new NextRequest('http://localhost/api/admin/posts?platform=twitter&id=p2'))
      ).json()
      expect(shared.listable).toBe(true)
      expect(shared.savers.map((s: { username: string }) => s.username).sort()).toEqual([
        'ana',
        'ben',
      ])
    })

    it('never lists a private-only post as needing attention', async () => {
      testInstance.sqlite.exec(`
        INSERT INTO keep_jobs (platform, post_id, status, attempts, last_error, updated_at)
        VALUES ('twitter', 'p1', 'failed', 2, 'timeout', '${new Date().toISOString()}'),
               ('twitter', 'p2', 'failed', 1, 'timeout', '${new Date().toISOString()}')`)
      const posts = await (await boardRequest('posts')).json()
      expect(posts.attention.map((a: { post: { id: string } }) => a.post.id)).toEqual(['p2'])
      expect(posts.attentionPrivate).toBe(1)
      expect(JSON.stringify(posts)).not.toContain('secret pick')
    })
  })

  describe('reactions are counted, never kept', () => {
    it('counts a reaction by member, day and kind, without the words, post or moment', async () => {
      logMomentFormed('babies', 'Babies vs objects')
      expect(
        (await react(USER_B, 'babies', { emoji: '😭', platform: 'reddit', id: 'abc' })).ok,
      ).toBe(true)
      expect(
        (await react(USER_B, 'babies', { text: 'so cute', platform: 'reddit', id: 'abc' })).ok,
      ).toBe(true)
      expect(
        (await react(USER_C, 'babies', { emoji: '😭', platform: 'reddit', id: 'abc' })).ok,
      ).toBe(true)

      const rows = testInstance.db.select().from(reactionCounts).all()
      expect(rows).toHaveLength(3)
      expect(rows.find((r) => r.userId === USER_B && r.kind === 'crying')?.count).toBe(1)
      expect(rows.find((r) => r.userId === USER_B && r.kind === 'text')?.count).toBe(1)
      const dump = JSON.stringify(
        testInstance.sqlite.prepare('SELECT * FROM reaction_counts').all(),
      )
      expect(dump).not.toContain('so cute')
      expect(dump).not.toContain('abc')
      expect(dump).not.toContain('babies')
      expect(testInstance.db.select().from(momentLog).all()[0].reactions).toBe(3)

      const summary = reactionsSummary(null)
      expect(summary).toMatchObject({ total: 3, emoji: 2, typed: 1 })
      expect(summary.byKind[0]).toMatchObject({ kind: 'crying', emoji: '😭', count: 2 })
    })

    it('adds up on repeat and refuses a bad reaction without counting', async () => {
      countReaction(USER_B, 'fire')
      countReaction(USER_B, 'fire')
      expect(testInstance.db.select().from(reactionCounts).all()[0].count).toBe(2)
      const bad = await react(USER_B, 'babies', { emoji: '🙂', platform: 'reddit', id: 'abc' })
      expect(bad.ok).toBe(false)
      expect(testInstance.db.select().from(reactionCounts).all()).toHaveLength(1)
    })

    it('logs tune-ins once per member per moment, and the most watching at once', () => {
      logMomentFormed('babies', 'Babies vs objects')
      const leaveA = joinWatch('babies', USER_A)
      joinWatch('babies', USER_B)
      leaveA()
      joinWatch('babies', USER_A)
      joinWatch('babies', USER_A) // a second tab
      const [row] = testInstance.db.select().from(momentLog).all()
      expect(row).toMatchObject({ tuneIns: 2, peakWatching: 2 })
      expect(JSON.stringify(row)).not.toContain(USER_A)
      noteTuneIn('babies', USER_C, 3)
      expect(testInstance.db.select().from(momentLog).all()[0]).toMatchObject({
        tuneIns: 3,
        peakWatching: 3,
      })
    })
  })

  describe('last seen', () => {
    it('writes at most once every 5 minutes', () => {
      const t = Date.parse('2026-10-20T10:00:00.000Z')
      expect(touchLastSeen(USER_B, t)).toBe(true)
      expect(touchLastSeen(USER_B, t + 60_000)).toBe(false)
      expect(touchLastSeen(USER_B, t + LAST_SEEN_EVERY_MS - 1)).toBe(false)
      expect(touchLastSeen(USER_B, t + LAST_SEEN_EVERY_MS + 1)).toBe(true)
      const [row] = testInstance.db
        .select({ at: users.lastSeenAt })
        .from(users)
        .where(eq(users.id, USER_B))
        .all()
      expect(row.at).toBe(new Date(t + LAST_SEEN_EVERY_MS + 1).toISOString())
    })

    it('is noted by /api/auth/me, with an open (counts only)', async () => {
      mockUserId = USER_B
      await getMe()
      const [row] = testInstance.db
        .select({ at: users.lastSeenAt })
        .from(users)
        .where(eq(users.id, USER_B))
        .all()
      expect(row.at).toBeTruthy()
      const opens = testInstance.db
        .select()
        .from(analyticsEvents)
        .where(eq(analyticsEvents.name, 'app.open'))
        .all()
      expect(opens).toHaveLength(1)
      expect(opens[0].source).toBe('web')
    })

    it('tells phones apart', () => {
      expect(phonePlatformOf('ADHX/12 CFNetwork/1498 Darwin/24.0.0')).toBe('ios')
      expect(phonePlatformOf('Dalvik/2.1.0 (Linux; U; Android 14; Pixel 8)')).toBe('android')
      expect(phonePlatformOf(null, "Ana's iPhone")).toBe('ios')
      expect(phonePlatformOf(null, 'Pixel 8')).toBe('android')
      expect(phonePlatformOf('curl/8', 'Phone')).toBeNull()
    })
  })

  describe('making and removing admins', () => {
    const ctx = (username: string) => ({ params: Promise.resolve({ username }) })

    it('makes someone an admin and takes it away, with audit rows', async () => {
      const made = await postRole(
        new NextRequest('http://localhost/x', json({ role: 'admin' })),
        ctx('ana'),
      )
      expect(made.status).toBe(200)
      expect((await made.json()).role).toBe('admin')
      const removed = await postRole(
        new NextRequest('http://localhost/x', json({ role: 'user' })),
        ctx('ana'),
      )
      expect((await removed.json()).role).toBe('user')
      const actions = testInstance.db
        .select()
        .from(adminAudit)
        .all()
        .map((a) => a.action)
      expect(actions).toEqual(['make_admin', 'remove_admin'])
      const [ana] = testInstance.db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, USER_B))
        .all()
      expect(ana.role).toBe('user')
    })

    it('never lets the last admin step down', async () => {
      const res = await postRole(
        new NextRequest('http://localhost/x', json({ role: 'user' })),
        ctx('pete'),
      )
      expect(res.status).toBe(409)
      const [pete] = testInstance.db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, USER_A))
        .all()
      expect(pete.role).toBe('admin')
      expect(testInstance.db.select().from(adminAudit).all()).toHaveLength(0)

      // With another admin, they can.
      await postRole(new NextRequest('http://localhost/x', json({ role: 'admin' })), ctx('ana'))
      const ok = await postRole(
        new NextRequest('http://localhost/x', json({ role: 'user' })),
        ctx('pete'),
      )
      expect(ok.status).toBe(200)
    })

    it('refuses a bad role, an unknown person, and someone kept out', async () => {
      expect(
        (await postRole(new NextRequest('http://localhost/x', json({ role: 'owner' })), ctx('ana')))
          .status,
      ).toBe(400)
      expect(
        (
          await postRole(
            new NextRequest('http://localhost/x', json({ role: 'admin' })),
            ctx('nobody'),
          )
        ).status,
      ).toBe(404)
      testInstance.sqlite.exec(
        `INSERT INTO user_bans (user_id, reason, created_at, created_by) VALUES ('${USER_C}', 'x', '${new Date().toISOString()}', '${USER_A}')`,
      )
      expect(
        (await postRole(new NextRequest('http://localhost/x', json({ role: 'admin' })), ctx('ben')))
          .status,
      ).toBe(409)
    })
  })

  describe('phones, notes and processing', () => {
    it('removes one of a member’s phones', async () => {
      testInstance.db
        .insert(accessKeys)
        .values({
          id: 'k1',
          userId: USER_B,
          name: "Ana's iPhone",
          keyHash: 'h1',
          hint: '4F2A',
          createdAt: new Date().toISOString(),
          scope: 'phone',
          platform: 'ios',
        })
        .run()
      const person = await (
        await getPerson(new NextRequest('http://localhost/x'), {
          params: Promise.resolve({ username: 'ana' }),
        })
      ).json()
      expect(person.phones).toEqual([
        expect.objectContaining({ id: 'k1', hint: '4F2A', platform: 'ios' }),
      ])
      const res = await deletePhone(new NextRequest('http://localhost/x', { method: 'DELETE' }), {
        params: Promise.resolve({ username: 'ana', id: 'k1' }),
      })
      expect(res.status).toBe(200)
      expect(testInstance.db.select().from(accessKeys).all()).toHaveLength(0)
      expect(testInstance.db.select().from(adminAudit).all()[0].action).toBe('remove_phone')
      // Someone else's phone id under the wrong person is not found.
      const again = await deletePhone(new NextRequest('http://localhost/x', { method: 'DELETE' }), {
        params: Promise.resolve({ username: 'ben', id: 'k1' }),
      })
      expect(again.status).toBe(404)
    })

    it('clears every note a member left, audited', async () => {
      await testInstance.db
        .insert(bookmarks)
        .values([
          createTestBookmark(USER_B, 'n1', { note: 'one' }),
          createTestBookmark(USER_B, 'n2', { note: 'two' }),
        ])
      const res = await postUser(
        new NextRequest('http://localhost/x', json({ username: 'ana', clearNotes: true })),
      )
      expect((await res.json()).notesCleared).toBe(2)
      expect(
        testInstance.db.all<{ n: number }>(
          sql`SELECT COUNT(*) AS n FROM bookmarks WHERE note IS NOT NULL`,
        )[0].n,
      ).toBe(0)
      expect(testInstance.db.select().from(adminAudit).all()[0].action).toBe('clear_note')
    })

    it('pauses and resumes new work, and retries what failed', async () => {
      const pause = await postProcessing(
        new NextRequest('http://localhost/x', json({ action: 'pause' })),
      )
      expect(await pause.json()).toEqual({ paused: true })
      expect(newWorkPaused()).toBe(true)
      const board = await (await boardRequest('processing')).json()
      expect(board.paused).toBe(true)
      await postProcessing(new NextRequest('http://localhost/x', json({ action: 'resume' })))
      expect(newWorkPaused()).toBe(false)

      await testInstance.db.insert(bookmarks).values(createTestBookmark(USER_B, 'f1'))
      testInstance.sqlite.exec(`
        INSERT INTO keep_jobs (platform, post_id, status, attempts, last_error, updated_at)
        VALUES ('twitter', 'f1', 'failed', 3, 'timeout', '${new Date().toISOString()}')`)
      const retried = await postProcessing(
        new NextRequest('http://localhost/x', json({ action: 'retry_failed' })),
      )
      expect((await retried.json()).retried).toBe(1)
      const [job] = testInstance.db.all<{ status: string; attempts: number }>(
        sql`SELECT status, attempts FROM keep_jobs WHERE post_id = 'f1'`,
      )
      expect(job).toEqual({ status: 'pending', attempts: 0 })
      const actions = testInstance.db
        .select()
        .from(adminAudit)
        .all()
        .map((a) => a.action)
      expect(actions).toEqual(['pause_work', 'resume_work', 'retry_failed'])

      expect(
        (await postProcessing(new NextRequest('http://localhost/x', json({ action: 'explode' }))))
          .status,
      ).toBe(400)
    })
  })

  it('clears reaction counts when the account clears its data', async () => {
    countReaction(USER_B, 'fire')
    countReaction(USER_C, 'fire')
    mockUserId = USER_B
    const res = await clearAccount(
      new NextRequest('http://localhost/api/account/clear', { method: 'POST' }),
    )
    expect(res.status).toBe(200)
    expect(
      testInstance.db
        .select()
        .from(reactionCounts)
        .all()
        .map((r) => r.userId),
    ).toEqual([USER_C])
  })
})
