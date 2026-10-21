import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestBookmark, createTestDb, type TestDbInstance } from './setup'

/**
 * The phone apps without the web (docs/specs/phone-app.md): your picture
 * (`/api/app/me/avatar`), invites (`/api/app/invites`), signing in by an
 * emailed code (`/api/app/signin`, `/verify`) and the reactions feed
 * (`/api/app/reacted`, web `/api/posts/reacted`), plus faces on every
 * saver/reactor object.
 */

let testInstance: TestDbInstance
let sessionUser: string | null = null
let mediaDir = ''
let delivery: 'email' | 'admin' | 'log' | null = 'email'
let sendOk = true
const sentCodes: { email: string; code: string }[] = []

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))
vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(async () => sessionUser),
  getSession: vi.fn(async () => (sessionUser ? { userId: sessionUser, username: 'x' } : null)),
  clearSessionCookie: vi.fn(),
}))
vi.mock('@/lib/sentry', () => ({
  metrics: new Proxy({}, { get: () => vi.fn() }),
  captureException: vi.fn(),
  metricCount: vi.fn(),
}))
vi.mock('@/lib/email/magic-link', () => ({
  signInDelivery: () => delivery,
  sendMagicLinkEmail: vi.fn(async () => ({ ok: true, delivery: 'email' })),
  sendSignInCodeEmail: vi.fn(async (args: { email: string; code: string }) => {
    if (!sendOk) return { ok: false }
    sentCodes.push(args)
    return { ok: true, delivery: 'email' }
  }),
}))

import { __resetRateLimitState, checkRateLimit } from '@/lib/rate-limit'
import { createAccessKey } from '@/lib/auth/access-keys'
import { installAccountWriteGuards } from '@/lib/db/account-invariants'

const BASE = 'http://localhost:3000'
const ANA = 'u_ana'
const BEN = 'u_ben'
const PETE = 'u_pete'
const MUM = 'u_mum'

function phone(
  url: string,
  key: string | null,
  init: { method?: string; json?: unknown; body?: BodyInit } = {},
) {
  const headers: Record<string, string> = {}
  if (key) headers.Authorization = `Bearer ${key}`
  if (init.json !== undefined) headers['Content-Type'] = 'application/json'
  return new Request(`${BASE}${url}`, {
    method: init.method ?? (init.json !== undefined || init.body ? 'POST' : 'GET'),
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
}

const keyFor = (userId: string) => createAccessKey(userId, 'Phone', 'phone')!.key
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) })

beforeEach(() => {
  testInstance = createTestDb()
  sessionUser = null
  delivery = 'email'
  sendOk = true
  sentCodes.length = 0
  __resetRateLimitState()
  mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-phone-'))
  vi.stubEnv('MEDIA_DIR', mediaDir)
  vi.stubEnv('NEXT_PUBLIC_APP_URL', BASE)
  testInstance.db
    .insert(schema.users)
    .values([
      { id: ANA, username: 'ana', displayName: 'Ana', avatarUrl: 'https://pbs.twimg.com/a.jpg' },
      { id: BEN, username: 'ben', displayName: null, avatarUrl: 'https://pbs.twimg.com/b.jpg' },
      { id: PETE, username: 'pete', displayName: 'Pete', role: 'admin' },
      { id: MUM, username: 'mum', displayName: 'Mum', avatarUrl: 'https://pbs.twimg.com/m.jpg' },
    ])
    .run()
  // Ben chose the generated icon: no picture is sent for him anywhere.
  testInstance.db
    .insert(schema.userPreferences)
    .values({ userId: BEN, key: 'avatarSource', value: 'generated' })
    .run()
  installAccountWriteGuards(testInstance.sqlite)
})

afterEach(() => {
  testInstance.close()
  vi.unstubAllEnvs()
  fs.rmSync(mediaDir, { recursive: true, force: true })
})

// ———————————————————————————— §1 picture ————————————————————————————

/** Left half red, right half blue, so the crop can be checked. */
async function halves(width = 800, height = 400): Promise<Buffer> {
  const half = Math.floor(width / 2)
  const right = await sharp({
    create: { width: width - half, height, channels: 3, background: { r: 0, g: 0, b: 255 } },
  })
    .png()
    .toBuffer()
  return sharp({ create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .composite([{ input: right, left: half, top: 0 }])
    .png()
    .toBuffer()
}

function form(bytes: Buffer, type: string, crop: Record<string, string> = {}): FormData {
  const data = new FormData()
  data.set('file', new Blob([new Uint8Array(bytes)], { type }), 'me')
  for (const [k, v] of Object.entries(crop)) data.set(k, v)
  return data
}

async function me(key: string) {
  const { GET } = await import('@/app/api/app/me/route')
  return (await GET(phone('/api/app/me', key))).json()
}

describe('your picture, from the phone', () => {
  it('needs a phone key', async () => {
    const { POST, DELETE } = await import('@/app/api/app/me/avatar/route')
    const res = await POST(phone('/api/app/me/avatar', null, { json: { source: 'x' } }))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('bad_key')
    // A session isn't enough here: phones only.
    sessionUser = ANA
    expect((await DELETE(phone('/api/app/me/avatar', null, { method: 'DELETE' }))).status).toBe(401)
  })

  it('takes a photo with a crop, re-encoded, and /api/app/me follows', async () => {
    const key = keyFor(ANA)
    const { POST } = await import('@/app/api/app/me/avatar/route')
    // The red left half only.
    const res = await POST(
      phone('/api/app/me/avatar', key, {
        method: 'POST',
        body: form(await halves(), 'image/png', { x: '0.25', y: '0.5', zoom: '1' }),
      }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['avatarUrl', 'source'])
    expect(body.source).toBe('upload')
    expect(body.avatarUrl).toMatch(/^\/api\/files\/avatar\/[a-f0-9]{16}$/)
    const [file] = fs.readdirSync(path.join(mediaDir, 'avatars'))
    const stored = sharp(path.join(mediaDir, 'avatars', file))
    expect(await stored.metadata()).toMatchObject({ width: 512, height: 512, format: 'jpeg' })
    const { dominant } = await stored.stats()
    expect(dominant.r).toBeGreaterThan(200)
    expect(dominant.b).toBeLessThan(60)

    expect(await me(key)).toMatchObject({ avatarUrl: body.avatarUrl, avatarSource: 'upload' })
  })

  it('takes an already-square JPEG sent without a type, judged by its bytes', async () => {
    const key = keyFor(ANA)
    const { POST } = await import('@/app/api/app/me/avatar/route')
    const square = await sharp(await halves(300, 300))
      .jpeg()
      .toBuffer()
    const res = await POST(
      phone('/api/app/me/avatar', key, {
        method: 'POST',
        body: form(square, 'application/octet-stream', { x: '0.5', y: '0.5', zoom: '1' }),
      }),
    )
    expect(res.status).toBe(200)
    // Not a picture, whatever it says: refused.
    const bad = await POST(
      phone('/api/app/me/avatar', key, {
        method: 'POST',
        body: form(Buffer.from('not a picture at all'), 'application/octet-stream'),
      }),
    )
    expect(bad.status).toBe(415)
    expect((await bad.json()).code).toBe('bad_type')
    const pdf = await POST(
      phone('/api/app/me/avatar', key, {
        method: 'POST',
        body: form(square, 'application/pdf'),
      }),
    )
    expect(pdf.status).toBe(415)
  })

  it('takes a Gob or the X picture, with the web’s errors', async () => {
    const key = keyFor(ANA)
    const { POST } = await import('@/app/api/app/me/avatar/route')
    const gob = await POST(
      phone('/api/app/me/avatar', key, { method: 'POST', json: { source: 'gob', colour: 'teal' } }),
    )
    expect(await gob.json()).toMatchObject({ source: 'gob' })
    expect((await me(key)).avatarSource).toBe('gob')

    const badColour = await POST(
      phone('/api/app/me/avatar', key, { method: 'POST', json: { source: 'gob', colour: 'puce' } }),
    )
    expect(badColour.status).toBe(400)
    expect(await badColour.json()).toMatchObject({ code: 'bad_colour' })

    const noX = await POST(
      phone('/api/app/me/avatar', key, { method: 'POST', json: { source: 'x' } }),
    )
    expect(noX.status).toBe(409)
    expect((await noX.json()).code).toBe('no_x_picture')
  })

  it('goes back to the generated icon on DELETE', async () => {
    const key = keyFor(ANA)
    const { POST, DELETE } = await import('@/app/api/app/me/avatar/route')
    await POST(
      phone('/api/app/me/avatar', key, { method: 'POST', json: { source: 'gob', colour: 'lime' } }),
    )
    const res = await DELETE(phone('/api/app/me/avatar', key, { method: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ avatarUrl: null, source: 'generated' })
    expect(fs.readdirSync(path.join(mediaDir, 'avatars'))).toEqual([])
    expect(await me(key)).toMatchObject({ avatarUrl: null, avatarSource: 'generated' })
  })

  it('shares the web’s rate budget', async () => {
    const key = keyFor(ANA)
    for (let i = 0; i < 30; i++) checkRateLimit(`avatar:${ANA}`, { windowMs: 3_600_000, max: 30 })
    const { POST } = await import('@/app/api/app/me/avatar/route')
    const res = await POST(
      phone('/api/app/me/avatar', key, { method: 'POST', json: { source: 'gob', colour: 'blue' } }),
    )
    expect(res.status).toBe(429)
    expect((await res.json()).code).toBe('busy')
    // Ben's budget is his own.
    const ben = await POST(
      phone('/api/app/me/avatar', keyFor(BEN), {
        method: 'POST',
        json: { source: 'gob', colour: 'blue' },
      }),
    )
    expect(ben.status).toBe(200)
  })

  it('/api/app/me says where the picture came from', async () => {
    expect(await me(keyFor(ANA))).toEqual({
      username: 'ana',
      name: 'Phone',
      avatarUrl: 'https://pbs.twimg.com/a.jpg',
      avatarSource: 'x',
    })
    expect(await me(keyFor(BEN))).toMatchObject({ avatarUrl: null, avatarSource: 'generated' })
    expect(await me(keyFor(PETE))).toMatchObject({ avatarUrl: null, avatarSource: 'generated' })
  })
})

// ———————————————————————————— §2 invites ————————————————————————————

describe('invites, from the phone', () => {
  async function routes() {
    const list = await import('@/app/api/app/invites/route')
    const one = await import('@/app/api/app/invites/[id]/route')
    const link = await import('@/app/api/app/invites/[id]/link/route')
    return { list, one, link }
  }

  it('needs a phone key', async () => {
    const { list, one } = await routes()
    expect((await list.GET(phone('/api/app/invites', null))).status).toBe(401)
    expect((await list.POST(phone('/api/app/invites', null, { method: 'POST' }))).status).toBe(401)
    expect(
      (
        await one.DELETE(
          phone('/api/app/invites/inv_x', null, { method: 'DELETE' }),
          ctx({ id: 'inv_x' }),
        )
      ).status,
    ).toBe(401)
  })

  it('makes, lists and revokes your own links', async () => {
    const { list, one, link } = await routes()
    const key = keyFor(PETE)
    const made = await list.POST(
      phone('/api/app/invites', key, { method: 'POST', json: { nameHint: 'Mum' } }),
    )
    expect(made.status).toBe(201)
    expect(made.headers.get('Cache-Control')).toBe('no-store')
    const created = await made.json()
    expect(Object.keys(created).sort()).toEqual(['expiresAt', 'id', 'url'])
    expect(created.url).toMatch(new RegExp(`^${BASE}/invite/[A-Za-z0-9_-]{43}$`))

    const listed = await (await list.GET(phone('/api/app/invites', key))).json()
    expect(listed.canInvite).toBe(true)
    expect(listed.invites).toHaveLength(1)
    expect(listed.invites[0]).toEqual({
      id: created.id,
      url: null,
      code: expect.stringMatching(/^[A-Z0-9]{1,4}$/),
      nameHint: 'Mum',
      createdAt: expect.any(String),
      expiresAt: created.expiresAt,
      uses: 0,
    })

    // A fresh link: the old one stops working.
    const renewed = await link.POST(
      phone(`/api/app/invites/${created.id}/link`, key, { method: 'POST' }),
      ctx({ id: created.id }),
    )
    const fresh = await renewed.json()
    expect(fresh).toMatchObject({ id: created.id, expiresAt: created.expiresAt })
    expect(fresh.url).not.toBe(created.url)

    const revoked = await one.DELETE(
      phone(`/api/app/invites/${created.id}`, key, { method: 'DELETE' }),
      ctx({ id: created.id }),
    )
    expect(revoked.status).toBe(200)
    expect(await revoked.json()).toEqual({ ok: true })
    expect((await (await list.GET(phone('/api/app/invites', key))).json()).invites).toEqual([])
  })

  it('never shows or revokes anyone else’s, even for an admin', async () => {
    const { list, one, link } = await routes()
    testInstance.db
      .insert(schema.serverSettings)
      .values({ key: 'invites.who', value: 'anyone', updatedAt: new Date().toISOString() })
      .run()
    const ana = keyFor(ANA)
    const pete = keyFor(PETE)
    const anas = await (
      await list.POST(phone('/api/app/invites', ana, { method: 'POST', json: {} }))
    ).json()
    // Pete (an admin) lists only his own here.
    expect((await (await list.GET(phone('/api/app/invites', pete))).json()).invites).toEqual([])
    const tried = await one.DELETE(
      phone(`/api/app/invites/${anas.id}`, pete, { method: 'DELETE' }),
      ctx({ id: anas.id }),
    )
    expect(tried.status).toBe(404)
    expect((await tried.json()).code).toBe('not_found')
    const relink = await link.POST(
      phone(`/api/app/invites/${anas.id}/link`, keyFor(BEN), { method: 'POST' }),
      ctx({ id: anas.id }),
    )
    expect(relink.status).toBe(404)
    expect((await (await list.GET(phone('/api/app/invites', ana))).json()).invites).toHaveLength(1)
  })

  it('says who may invite, and how many', async () => {
    const { list } = await routes()
    const ana = keyFor(ANA)
    // Only admins invite by default.
    expect((await (await list.GET(phone('/api/app/invites', ana))).json()).canInvite).toBe(false)
    const refused = await list.POST(phone('/api/app/invites', ana, { method: 'POST', json: {} }))
    expect(refused.status).toBe(403)
    expect((await refused.json()).code).toBe('not_allowed')

    const pete = keyFor(PETE)
    for (let i = 0; i < 20; i++) {
      await list.POST(phone('/api/app/invites', pete, { method: 'POST', json: {} }))
    }
    const tooMany = await list.POST(phone('/api/app/invites', pete, { method: 'POST', json: {} }))
    expect(tooMany.status).toBe(409)
    expect((await tooMany.json()).code).toBe('too_many')

    for (let i = 0; i < 30; i++)
      checkRateLimit(`invites:create:${PETE}`, { windowMs: 3_600_000, max: 30 })
    const busy = await list.POST(phone('/api/app/invites', pete, { method: 'POST', json: {} }))
    expect(busy.status).toBe(429)
    expect((await busy.json()).code).toBe('busy')
  })
})

// ———————————————————————————— §3 sign in ————————————————————————————

function linkEmail(userId: string, email: string) {
  testInstance.db
    .insert(schema.userIdentities)
    .values({ provider: 'email', providerId: email, userId })
    .run()
}

async function ask(email: unknown, name?: string) {
  const { POST } = await import('@/app/api/app/signin/route')
  const res = await POST(phone('/api/app/signin', null, { method: 'POST', json: { email, name } }))
  return { status: res.status, body: await res.json(), headers: res.headers }
}

async function verify(email: string, code: unknown, name = 'Ana’s iPhone') {
  const { POST } = await import('@/app/api/app/signin/verify/route')
  const res = await POST(
    phone('/api/app/signin/verify', null, { method: 'POST', json: { email, code, name } }),
  )
  return { status: res.status, body: await res.json() }
}

const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')
const phoneRows = () =>
  testInstance.db
    .select()
    .from(schema.loginTokens)
    .where(eq(schema.loginTokens.intent, 'phone'))
    .all()

describe('signing in on the phone by email code', () => {
  beforeEach(() => linkEmail(ANA, 'ana@example.com'))

  it('emails a code and spends it for a phone key, like pairing', async () => {
    const asked = await ask(' Ana@Example.com ')
    expect(asked.status).toBe(200)
    expect(asked.body).toEqual({ ok: true })
    expect(asked.headers.get('Cache-Control')).toBe('no-store')
    expect(sentCodes).toHaveLength(1)
    const { code } = sentCodes[0]
    expect(code).toMatch(/^\d{6}$/)
    // Stored hashed, never as typed.
    const [row] = phoneRows()
    expect(row.tokenHash).not.toContain(code)
    expect(row.userId).toBe(ANA)

    const done = await verify('ana@example.com', `${code.slice(0, 3)} ${code.slice(3)}`)
    expect(done.status).toBe(201)
    expect(Object.keys(done.body).sort()).toEqual(['key', 'name', 'username'])
    expect(done.body).toMatchObject({ name: 'Ana’s iPhone', username: 'ana' })
    expect(await me(done.body.key)).toMatchObject({ username: 'ana', name: 'Ana’s iPhone' })

    // Single use.
    const again = await verify('ana@example.com', code)
    expect(again.status).toBe(410)
    expect(again.body.code).toBe('expired')
  })

  it('answers the same for an address with no account, and sends nothing', async () => {
    const asked = await ask('nobody@example.com')
    expect(asked).toMatchObject({ status: 200, body: { ok: true } })
    expect(sentCodes).toEqual([])
    // Guessing looks the same as guessing a real code.
    const guess = await verify('nobody@example.com', '123456')
    expect(guess.status).toBe(400)
    expect(guess.body.code).toBe('bad_code')
    // And the minute's wait applies the same.
    expect((await ask('nobody@example.com')).body.code).toBe('too_soon')
  })

  it('treats banned and waiting accounts as unknown', async () => {
    linkEmail(MUM, 'mum@example.com')
    linkEmail(BEN, 'ben@example.com')
    testInstance.db
      .insert(schema.userBans)
      .values({ userId: MUM, createdBy: PETE, createdAt: new Date().toISOString() })
      .run()
    testInstance.db
      .update(schema.users)
      .set({ approval: 'pending' })
      .where(eq(schema.users.id, BEN))
      .run()
    expect((await ask('mum@example.com')).body).toEqual({ ok: true })
    expect((await ask('ben@example.com')).body).toEqual({ ok: true })
    expect(sentCodes).toEqual([])
    expect((await verify('mum@example.com', '000000')).body.code).toBe('bad_code')

    // Banned after the code went: still no key.
    testInstance.db.delete(schema.userBans).run()
    __resetRateLimitState()
    testInstance.sqlite.exec(`DELETE FROM login_tokens`)
    await ask('mum@example.com')
    const { code } = sentCodes[0]
    testInstance.db
      .insert(schema.userBans)
      .values({ userId: MUM, createdBy: PETE, createdAt: new Date().toISOString() })
      .run()
    const tried = await verify('mum@example.com', code)
    expect(tried.status).toBe(400)
    expect(tried.body.code).toBe('bad_code')
    expect(testInstance.db.select().from(schema.accessKeys).all()).toEqual([])
  })

  it('burns the code after five wrong tries', async () => {
    await ask('ana@example.com')
    const { code } = sentCodes[0]
    for (let i = 0; i < 5; i++) {
      const tried = await verify('ana@example.com', wrong(code))
      expect(tried.status).toBe(400)
      expect(tried.body.code).toBe('bad_code')
    }
    const late = await verify('ana@example.com', code)
    expect(late.status).toBe(410)
    expect(late.body.code).toBe('expired')
  })

  it('runs out after 15 minutes, and a new code replaces the old one', async () => {
    await ask('ana@example.com')
    const first = sentCodes[0].code
    expect(phoneRows()[0].expiresAt - Date.now()).toBeGreaterThan(14 * 60_000)
    testInstance.db
      .update(schema.loginTokens)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(schema.loginTokens.intent, 'phone'))
      .run()
    expect((await verify('ana@example.com', first)).status).toBe(410)

    // A new code: the old one doesn't work even if it hadn't run out.
    testInstance.sqlite.exec(`UPDATE login_tokens SET created_at = '2000-01-01T00:00:00Z'`)
    await ask('ana@example.com')
    expect(phoneRows()).toHaveLength(1)
    const second = sentCodes[1].code
    if (second !== first) expect((await verify('ana@example.com', first)).status).toBe(400)
    expect((await verify('ana@example.com', second)).status).toBe(201)
  })

  it('checks the input and keeps to its limits', async () => {
    expect((await ask('not an email')).body.code).toBe('bad_email')
    expect((await verify('nope', '123456')).body.code).toBe('bad_email')

    await ask('ana@example.com')
    // A minute between codes, shared with the magic link.
    const soon = await ask('ana@example.com')
    expect(soon.status).toBe(429)
    expect(soon.body.code).toBe('too_soon')
    // A malformed code is just wrong.
    expect((await verify('ana@example.com', 'abc')).body.code).toBe('bad_code')

    for (let i = 0; i < 20; i++)
      checkRateLimit('app-signin:ip:unknown', { windowMs: 600_000, max: 20 })
    const busy = await ask('other@example.com')
    expect(busy.status).toBe(429)
    expect(busy.body.code).toBe('busy')
    expect(busy.headers.get('Retry-After')).toMatch(/^\d+$/)
  })

  it('says so when this ADHX can’t send email, the same for every address', async () => {
    delivery = 'admin'
    for (const email of ['ana@example.com', 'nobody@example.com']) {
      const res = await ask(email)
      expect(res.status).toBe(503)
      expect(res.body.code).toBe('no_email')
    }
    delivery = 'email'
    sendOk = false
    const failed = await ask('ana@example.com')
    expect(failed.status).toBe(503)
    expect(failed.body.code).toBe('send_failed')
    // The failed code is gone, so asking again doesn't wait a minute.
    sendOk = true
    expect((await ask('ana@example.com')).body).toEqual({ ok: true })
  })

  it('stops at ten phones', async () => {
    for (let i = 0; i < 10; i++) keyFor(ANA)
    await ask('ana@example.com')
    const res = await verify('ana@example.com', sentCodes[0].code)
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('too_many')
  })
})

// ———————————————————————————— §4 reactions feed ————————————————————————————

function save(userId: string, id: string, extra: Partial<schema.NewBookmark> = {}) {
  testInstance.db
    .insert(schema.bookmarks)
    .values(createTestBookmark(userId, id, { text: `post ${id}`, ...extra }))
    .run()
}

let reactionN = 0
function reaction(
  userId: string,
  postId: string,
  minutesAgo: number,
  emoji: string | null = '🔥',
  text: string | null = null,
) {
  testInstance.db
    .insert(schema.postReactions)
    .values({
      id: `rtest${reactionN++}`,
      userId,
      platform: 'twitter',
      postId,
      emoji,
      text: emoji ? null : text,
      createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    })
    .run()
}

async function reacted(key: string, query = '') {
  const { GET } = await import('@/app/api/app/reacted/route')
  const res = await GET(phone(`/api/app/reacted${query}`, key))
  return { status: res.status, body: await res.json(), headers: res.headers }
}

describe('the reactions feed', () => {
  beforeEach(() => {
    save(ANA, 'a')
    save(ANA, 'b')
    save(ANA, 'c')
    save(ANA, 'priv', { isPrivate: true })
    save(BEN, 'quiet')
    reaction(BEN, 'a', 30)
    reaction(ANA, 'a', 5, '😂')
    reaction(PETE, 'b', 10, null, 'so good')
    reaction(BEN, 'c', 60)
    reaction(ANA, 'priv', 1)
  })

  it('needs a phone key', async () => {
    const { GET } = await import('@/app/api/app/reacted/route')
    expect((await GET(phone('/api/app/reacted', null))).status).toBe(401)
  })

  it('plays posts with reactions, newest reaction first, with the last face', async () => {
    const { status, body, headers } = await reacted(keyFor(PETE))
    expect(status).toBe(200)
    expect(headers.get('Cache-Control')).toBe('no-store')
    expect(Object.keys(body).sort()).toEqual(['items', 'nextOffset', 'total'])
    // Ana's private post isn't Pete's to see.
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(['a', 'b', 'c'])
    expect(body.total).toBe(3)
    expect(body.nextOffset).toBeNull()
    const [a, b, c] = body.items
    expect(a).toMatchObject({
      platform: 'twitter',
      id: 'a',
      kind: 'text',
      openPath: expect.any(String),
    })
    expect(a.reactions).toEqual({
      count: 2,
      last: {
        emoji: '😂',
        text: null,
        at: expect.any(String),
        saver: {
          username: 'ana',
          name: 'Ana',
          avatarUrl: 'https://pbs.twimg.com/a.jpg',
          isYou: false,
        },
      },
    })
    expect(b.reactions.last).toMatchObject({
      emoji: null,
      text: 'so good',
      saver: { username: 'pete', isYou: true, avatarUrl: null },
    })
    // Ben chose the generated icon.
    expect(c.reactions.last.saver).toEqual({
      username: 'ben',
      name: null,
      avatarUrl: null,
      isYou: false,
    })
  })

  it('shows your own private post to you', async () => {
    const { body } = await reacted(keyFor(ANA))
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(['priv', 'a', 'b', 'c'])
    expect(body.items[0].isPrivate).toBe(true)
  })

  it('pages', async () => {
    const key = keyFor(PETE)
    const first = await reacted(key, '?limit=2')
    expect(first.body.items.map((i: { id: string }) => i.id)).toEqual(['a', 'b'])
    expect(first.body.nextOffset).toBe(2)
    const second = await reacted(key, '?offset=2&limit=2')
    expect(second.body.items.map((i: { id: string }) => i.id)).toEqual(['c'])
    expect(second.body.nextOffset).toBeNull()
    expect((await reacted(key, '?offset=9')).body).toEqual({
      items: [],
      total: 3,
      nextOffset: null,
    })
    // At most 50.
    expect((await reacted(key, '?limit=500')).body.items).toHaveLength(3)
  })

  it('leaves out banned reactors and hidden posts', async () => {
    testInstance.db
      .insert(schema.userBans)
      .values({ userId: BEN, createdBy: PETE, createdAt: new Date().toISOString() })
      .run()
    // Ben's banned: `c` has no reaction left and `a` counts only Ana's. (Ben's save
    // of `quiet` is gone with him.)
    let { body } = await reacted(keyFor(PETE))
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(['a', 'b'])
    expect(body.items[0].reactions.count).toBe(1)

    testInstance.db
      .insert(schema.moderatedPosts)
      .values({
        platform: 'twitter',
        bookmarkId: 'b',
        createdAt: new Date().toISOString(),
        createdBy: PETE,
      })
      .run()
    ;({ body } = await reacted(keyFor(PETE)))
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(['a'])
  })

  it('leaves out posts gone from their network', async () => {
    testInstance.db
      .insert(schema.postEmbeddings)
      .values({
        platform: 'twitter',
        postId: 'c',
        kind: 'video',
        model: 'm',
        contentHash: 'h',
        status: 'none',
        error: 'gone',
        createdAt: new Date().toISOString(),
      })
      .run()
    const { body } = await reacted(keyFor(PETE))
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(['a', 'b'])
    expect(body.total).toBe(2)
  })

  it('fails closed when moderation can’t be read', async () => {
    testInstance.sqlite.exec('DROP TABLE moderated_posts')
    const { status, body } = await reacted(keyFor(PETE))
    expect(status).toBe(500)
    expect(body.code).toBe('failed')
  })

  it('keeps to a rate limit', async () => {
    for (let i = 0; i < 120; i++)
      checkRateLimit(`app-reacted:${PETE}`, { windowMs: 60_000, max: 120 })
    const { status, body } = await reacted(keyFor(PETE))
    expect(status).toBe(429)
    expect(body.code).toBe('busy')
  })

  it('is on the web for members, as a play queue', async () => {
    const { GET } = await import('@/app/api/posts/reacted/route')
    expect((await GET(new NextRequest(`${BASE}/api/posts/reacted`))).status).toBe(401)
    sessionUser = PETE
    const res = await GET(new NextRequest(`${BASE}/api/posts/reacted?limit=2`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ name: 'Reactions', total: 3, nextOffset: 2 })
    expect(body.items.map((i: { post: { id: string } }) => i.post.id)).toEqual(['a', 'b'])
    expect(body.items[0]).toMatchObject({ saved: false, reactions: { count: 2 } })
    // Someone else's copy: nothing about the saver beyond the named savers list.
    expect(body.items[0].post.tags).toEqual([])
  })
})

// ———————————————————————————— §5 faces ————————————————————————————

describe('faces on every saver and reactor', () => {
  it('Live reactions, post reactions, savers and people all carry memberAvatar', async () => {
    // Ana uploads a picture from her phone.
    const { POST } = await import('@/app/api/app/me/avatar/route')
    const up = await POST(
      phone('/api/app/me/avatar', keyFor(ANA), {
        method: 'POST',
        json: { source: 'gob', colour: 'coral' },
      }),
    )
    const { avatarUrl } = await up.json()
    expect(avatarUrl).toMatch(/^\/api\/files\/avatar\//)
    save(ANA, 'p')
    save(BEN, 'p')

    const { reactionForViewer } = await import('@/lib/moments/people')
    const live = reactionForViewer(
      {
        slug: 'm',
        userId: ANA,
        emoji: '🔥',
        post: { platform: 'twitter', id: 'p' },
        id: 'r1',
        at: new Date().toISOString(),
      },
      ANA,
    )
    expect(live?.saver).toMatchObject({ username: 'ana', avatarUrl, isYou: true })
    const benLive = reactionForViewer(
      {
        slug: 'm',
        userId: BEN,
        emoji: '🔥',
        post: { platform: 'twitter', id: 'p' },
        id: 'r2',
        at: new Date().toISOString(),
      },
      ANA,
    )
    expect(benLive?.saver.avatarUrl).toBeNull()

    const { addPostReaction, listPostReactions } = await import('@/lib/reactions/post-reactions')
    addPostReaction(ANA, { platform: 'twitter', id: 'p', emoji: '😂' })
    expect(listPostReactions(PETE, 'twitter', 'p')?.[0].saver).toMatchObject({ avatarUrl })

    const { saversFor } = await import('@/lib/people/savers')
    const savers = saversFor([{ platform: 'twitter', id: 'p' }], PETE).get('twitter:p')!
    expect(savers.find((s) => s.username === 'ana')?.avatarUrl).toBe(avatarUrl)
    expect(savers.find((s) => s.username === 'ben')?.avatarUrl).toBeNull()

    const { listMembers } = await import('@/lib/people/members')
    expect(listMembers(PETE).find((m) => m.username === 'ana')?.avatarUrl).toBe(avatarUrl)

    const { body } = await reacted(keyFor(PETE))
    expect(body.items[0].reactions.last.saver.avatarUrl).toBe(avatarUrl)
    expect(
      body.items[0].savers.find((s: { username: string }) => s.username === 'ana').avatarUrl,
    ).toBe(avatarUrl)
  })
})
