import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * Settings → You → Change picture: `POST /api/account/avatar` (upload, Gob,
 * X), `DELETE` (no picture) and `/api/files/avatar/<hash>`. Uploads are
 * checked (type, 5 MB), re-encoded to a 512px JPEG with the crop applied and
 * clamped on the server, and the picture they replace is deleted.
 */

let testInstance: TestDbInstance
let sessionUser: string | null = 'u_ana'
let mediaDir = ''

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
  clearSessionCookie: vi.fn(),
}))
vi.mock('@/lib/sentry', () => ({
  metrics: new Proxy({}, { get: () => vi.fn() }),
  captureException: vi.fn(),
}))

const ANA = 'u_ana'
const BEN = 'u_ben'
const BASE = 'http://localhost:3000'

/** A real PNG: left half red, right half blue, so a crop can be checked. */
async function halves(width = 800, height = 400): Promise<Buffer> {
  const half = Math.floor(width / 2)
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .composite([
      {
        input: await sharp({
          create: { width: width - half, height, channels: 3, background: { r: 0, g: 0, b: 255 } },
        })
          .png()
          .toBuffer(),
        left: half,
        top: 0,
      },
    ])
    .png()
    .toBuffer()
}

function upload(
  bytes: Buffer,
  type = 'image/png',
  crop: Record<string, string> = {},
  name = 'me.png',
): NextRequest {
  const form = new FormData()
  form.set('file', new Blob([new Uint8Array(bytes)], { type }), name)
  for (const [k, v] of Object.entries(crop)) form.set(k, v)
  return new NextRequest(`${BASE}/api/account/avatar`, { method: 'POST', body: form })
}

function json(body: unknown) {
  return new NextRequest(`${BASE}/api/account/avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function send(req: NextRequest) {
  const { POST } = await import('@/app/api/account/avatar/route')
  const res = await POST(req)
  return { status: res.status, body: await res.json() }
}

const avatarFiles = () =>
  fs.existsSync(path.join(mediaDir, 'avatars'))
    ? fs.readdirSync(path.join(mediaDir, 'avatars')).sort()
    : []
const user = (id = ANA) =>
  testInstance.db.select().from(schema.users).where(eq(schema.users.id, id)).get()!
const source = (id = ANA) =>
  testInstance.db
    .select()
    .from(schema.userPreferences)
    .all()
    .find((p) => p.userId === id && p.key === 'avatarSource')?.value

beforeEach(() => {
  testInstance = createTestDb()
  sessionUser = ANA
  mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-avatar-'))
  vi.stubEnv('MEDIA_DIR', mediaDir)
  testInstance.db
    .insert(schema.users)
    .values([
      { id: ANA, username: 'ana' },
      { id: BEN, username: 'ben' },
    ])
    .run()
})

afterEach(() => {
  testInstance.close()
  vi.unstubAllEnvs()
  fs.rmSync(mediaDir, { recursive: true, force: true })
})

describe('crop maths', () => {
  it('clamps whatever is posted to a square inside the photo', async () => {
    const { clampCrop, cropRect } = await import('@/lib/avatar/store')
    expect(clampCrop({ x: '7', y: '-3', zoom: '99' })).toEqual({ x: 1, y: 0, zoom: 4 })
    expect(clampCrop({ x: 'NaN', y: undefined, zoom: '0.1' })).toEqual({ x: 0.5, y: 0.5, zoom: 1 })
    // Far right and off the top: the square slides back inside.
    expect(cropRect(800, 400, { x: 1, y: 0, zoom: 1 })).toEqual({ left: 400, top: 0, size: 400 })
    expect(cropRect(800, 400, { x: 0, y: 1, zoom: 2 })).toEqual({ left: 0, top: 200, size: 200 })
    expect(cropRect(800, 400, { x: 0.5, y: 0.5, zoom: 4 })).toEqual({
      left: 350,
      top: 150,
      size: 100,
    })
  })

  it('knows image types by their bytes, not their name', async () => {
    const { sniffImageType } = await import('@/lib/avatar/store')
    expect(sniffImageType(await halves(20, 20))).toBe('image/png')
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
  })
})

describe('POST /api/account/avatar', () => {
  it('needs sign-in', async () => {
    sessionUser = null
    expect((await send(upload(await halves()))).status).toBe(401)
  })

  it('refuses a type that isn’t a photo, whatever it claims to be', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
    expect((await send(upload(svg, 'image/svg+xml', {}, 'x.svg'))).body.code).toBe('bad_type')
    // Declared PNG, but it isn't one.
    const fake = await send(upload(Buffer.from('not really a png at all'), 'image/png'))
    expect(fake.status).toBe(415)
    expect(avatarFiles()).toEqual([])
    expect(user().avatarUrl).toBeNull()
  })

  it('refuses anything over 5 MB', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0)
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const res = await send(upload(big))
    expect(res.status).toBe(413)
    expect(res.body.code).toBe('too_big')
    expect(avatarFiles()).toEqual([])
  })

  it('re-encodes to a 512px square JPEG with the crop applied on the server', async () => {
    const res = await send(upload(await halves(), 'image/png', { x: '0', y: '0.5', zoom: '1' }))
    expect(res.status).toBe(200)
    expect(res.body.source).toBe('upload')
    expect(res.body.avatarUrl).toMatch(/^\/api\/files\/avatar\/[a-f0-9]{16}$/)
    expect(user().avatarUrl).toBe(res.body.avatarUrl)
    expect(source()).toBe('upload')

    const [file] = avatarFiles()
    expect(file).toMatch(/^u_ana-[a-f0-9]{16}\.jpg$/)
    const out = fs.readFileSync(path.join(mediaDir, 'avatars', file))
    const meta = await sharp(out).metadata()
    expect(meta).toMatchObject({ format: 'jpeg', width: 512, height: 512 })
    // x=0 crops the left (red) half.
    const { dominant } = await sharp(out).stats()
    expect(dominant.r).toBeGreaterThan(200)
    expect(dominant.b).toBeLessThan(60)
  })

  it('clamps a crop that points outside the photo instead of failing', async () => {
    const res = await send(upload(await halves(), 'image/png', { x: '40', y: '-9', zoom: '1e9' }))
    expect(res.status).toBe(200)
    const [file] = avatarFiles()
    const out = fs.readFileSync(path.join(mediaDir, 'avatars', file))
    expect(await sharp(out).metadata()).toMatchObject({ width: 512, height: 512 })
    // Clamped to the right edge: blue.
    const { dominant } = await sharp(out).stats()
    expect(dominant.b).toBeGreaterThan(200)
  })

  it('deletes the old picture when a new one replaces it', async () => {
    const first = await send(upload(await halves(), 'image/png', { x: '0' }))
    const second = await send(upload(await halves(), 'image/png', { x: '1' }))
    expect(first.body.avatarUrl).not.toBe(second.body.avatarUrl)
    const files = avatarFiles()
    expect(files).toHaveLength(1)
    expect(files[0]).toContain(second.body.avatarUrl.split('/').pop())
  })

  it('makes a Gob in one of the colours, and refuses others', async () => {
    expect((await send(json({ source: 'gob', colour: 'mauve' }))).status).toBe(400)
    const res = await send(json({ source: 'gob', colour: 'teal' }))
    expect(res.status).toBe(200)
    expect(source()).toBe('gob')
    expect(avatarFiles()).toHaveLength(1)
  })

  it('uses the X photo only when there is one, and drops the stored file', async () => {
    expect((await send(json({ source: 'x' }))).body.code).toBe('no_x_picture')
    await send(upload(await halves()))
    testInstance.db
      .insert(schema.oauthTokens)
      .values({
        userId: ANA,
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: Date.now() + 60_000,
        profileImageUrl: 'https://pbs.twimg.com/profile_images/1/me.jpg',
      } as never)
      .run()
    const res = await send(json({ source: 'x' }))
    expect(res.status).toBe(200)
    expect(user().avatarUrl).toBe('https://pbs.twimg.com/profile_images/1/me.jpg')
    expect(source()).toBe('x')
    expect(avatarFiles()).toEqual([])
  })

  it('DELETE removes the picture and its file', async () => {
    await send(upload(await halves()))
    const { DELETE } = await import('@/app/api/account/avatar/route')
    const res = await DELETE(new NextRequest(`${BASE}/api/account/avatar`, { method: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(source()).toBe('generated')
    expect(user().avatarUrl).toBeNull()
    expect(avatarFiles()).toEqual([])
  })
})

describe('GET /api/files/avatar/<hash>', () => {
  async function fetchAvatar(hash: string) {
    const { GET } = await import('@/app/api/files/avatar/[hash]/route')
    return GET(new Request(`${BASE}/api/files/avatar/${hash}`), {
      params: Promise.resolve({ hash }),
    })
  }

  it('serves a member’s current picture to members only', async () => {
    const { body } = await send(upload(await halves()))
    const hash = body.avatarUrl.split('/').pop()
    sessionUser = BEN
    const res = await fetchAvatar(hash)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    sessionUser = null
    expect((await fetchAvatar(hash)).status).toBe(401)
  })

  it('stops serving a replaced picture and anything that isn’t a picture address', async () => {
    const first = await send(upload(await halves(), 'image/png', { x: '0' }))
    await send(upload(await halves(), 'image/png', { x: '1' }))
    expect((await fetchAvatar(first.body.avatarUrl.split('/').pop())).status).toBe(404)
    expect((await fetchAvatar('..%2F..%2Fadhdone.db')).status).toBe(404)
  })
})

describe('account deletion', () => {
  it('removes the picture files with the account', async () => {
    await send(upload(await halves()))
    expect(avatarFiles()).toHaveLength(1)
    const { DELETE } = await import('@/app/api/account/route')
    const res = await DELETE(new NextRequest(`${BASE}/api/account`, { method: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(avatarFiles()).toEqual([])
  })

  it('never touches another account’s files', async () => {
    await send(upload(await halves()))
    sessionUser = BEN
    await send(upload(await halves(), 'image/png', { x: '1' }))
    const { removeAvatarFiles } = await import('@/lib/avatar/store')
    await removeAvatarFiles(ANA)
    expect(avatarFiles()).toHaveLength(1)
    expect(avatarFiles()[0]).toMatch(/^u_ben-/)
  })
})
