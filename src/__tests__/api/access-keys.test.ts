import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'

let testInstance: TestDbInstance
let sessionUser: string | null = 'user-1'

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
}))

vi.mock('@/lib/semantic/find', () => ({
  findPosts: vi.fn(),
}))

const post = {
  id: '111',
  platform: 'twitter',
  author: 'frogfan',
  authorName: 'Frog Fan',
  authorProfileImageUrl: null,
  text: 'look at this little guy',
  tweetUrl: 'https://x.com/frogfan/status/111',
  createdAt: '2026-10-01T00:00:00.000Z',
  processedAt: '2026-10-02T00:00:00.000Z',
  category: 'video',
  isArchived: false,
  isQuote: false,
  quoteContext: null,
  quotedTweetId: null,
  quotedTweet: null,
  isRetweet: false,
  retweetContext: null,
  media: [
    {
      id: 'm1',
      mediaType: 'video',
      width: 720,
      height: 1280,
      durationMs: 12_400,
      altText: null,
      url: 'https://video.twimg.com/frog.mp4',
      thumbnailUrl: 'https://pbs.twimg.com/frog.jpg',
      shareUrl: 'https://x.com/frogfan/status/111',
      originalUrl: null,
    },
  ],
  links: [
    { expandedUrl: 'https://frogs.example/care' },
    { expandedUrl: 'https://x.com/frogfan/status/111/video/1' },
  ],
  articlePreview: null,
  articleContent: null,
  isXArticle: false,
  tags: ['nature'],
  parentTweets: null,
  summary: null,
}

const get = (url: string, key?: string) =>
  new NextRequest(url, key ? { headers: { authorization: `Bearer ${key}` } } : undefined)

async function makeKey(name = 'Claude on my laptop') {
  const { POST } = await import('@/app/api/access-keys/route')
  const res = await POST(
    new NextRequest('https://adhx.test/api/access-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  )
  return { status: res.status, body: await res.json() }
}

describe('access keys', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    sessionUser = 'user-1'
    vi.clearAllMocks()
    await testInstance.db.insert(schema.users).values([
      { id: 'user-1', username: 'one' },
      { id: 'user-2', username: 'two' },
    ])
  })

  afterEach(() => {
    testInstance.close()
  })

  it('shows a new key once and keeps only its hash', async () => {
    const { status, body } = await makeKey()
    expect(status).toBe(201)
    expect(body.key).toMatch(/^adhx_[A-Za-z0-9_-]{43}$/)
    expect(body.hint).toBe(body.key.slice(-4))
    expect(body.name).toBe('Claude on my laptop')

    const [row] = await testInstance.db.select().from(schema.accessKeys)
    expect(row.keyHash).not.toContain(body.key)
    expect(JSON.stringify(row)).not.toContain(body.key)

    const { GET } = await import('@/app/api/access-keys/route')
    const list = await (await GET(get('https://adhx.test/api/access-keys'))).json()
    expect(list.keys).toHaveLength(1)
    expect(JSON.stringify(list)).not.toContain(body.key)
  })

  it('stops at five keys', async () => {
    for (let i = 0; i < 5; i++) expect((await makeKey(`k${i}`)).status).toBe(201)
    expect((await makeKey('one too many')).status).toBe(409)
  })

  it('searches only the key owner’s saves and returns links, media and why it matched', async () => {
    const { body } = await makeKey()
    sessionUser = null // no cookie: the key alone signs the request
    const { findPosts } = await import('@/lib/semantic/find')
    vi.mocked(findPosts).mockResolvedValue({
      items: [{ post, saved: true, matched: ['video', 'words'], strength: 'strong' }],
      total: 1,
      understood: true,
      close: true,
      refined: true,
      nextOffset: null,
    } as never)

    const { GET } = await import('@/app/api/agent/search/route')
    const res = await GET(
      get('https://adhx.test/api/agent/search?q=a%20frog&type=videos', body.key),
    )
    expect(res.status).toBe(200)
    expect(findPosts).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'a frog', type: 'videos', scope: 'mine', userId: 'user-1' }),
    )
    const data = await res.json()
    expect(data.results[0]).toMatchObject({
      kind: 'video',
      url: 'https://x.com/frogfan/status/111',
      adhxUrl: expect.stringMatching(/\/frogfan\/status\/111$/),
      author: { handle: 'frogfan', name: 'Frog Fan' },
      links: ['https://frogs.example/care'],
      media: [{ type: 'video', durationSeconds: 12 }],
      match: { strength: 'strong', on: ['video', 'words'] },
    })
  })

  it('refuses a missing, wrong, removed or banned key', async () => {
    const { GET } = await import('@/app/api/agent/search/route')
    const search = (key?: string) =>
      GET(get('https://adhx.test/api/agent/search?q=frog', key)).then((r) => r.status)

    expect(await search()).toBe(401)
    expect(await search(`adhx_${'a'.repeat(43)}`)).toBe(401)

    const { body } = await makeKey()
    const { findPosts } = await import('@/lib/semantic/find')
    vi.mocked(findPosts).mockResolvedValue({
      items: [],
      total: 0,
      understood: true,
      close: false,
      refined: false,
      nextOffset: null,
    })
    expect(await search(body.key)).toBe(200)

    await testInstance.db
      .insert(schema.userBans)
      .values({ userId: 'user-1', createdAt: new Date().toISOString(), createdBy: 'user-2' })
    expect(await search(body.key)).toBe(401)
    await testInstance.db.delete(schema.userBans)

    // Another account can't remove it; its owner can, and it stops working.
    const { DELETE } = await import('@/app/api/access-keys/[id]/route')
    const del = () =>
      DELETE(new NextRequest('https://adhx.test/x', { method: 'DELETE' }), {
        params: Promise.resolve({ id: body.id }),
      })
    sessionUser = 'user-2'
    expect((await del()).status).toBe(404)
    sessionUser = 'user-1'
    expect((await del()).status).toBe(200)
    expect(await search(body.key)).toBe(401)
  })

  it('wants something to look for', async () => {
    const { body } = await makeKey()
    const { GET } = await import('@/app/api/agent/search/route')
    expect((await GET(get('https://adhx.test/api/agent/search?q=%20', body.key))).status).toBe(400)
    expect(
      (await GET(get('https://adhx.test/api/agent/search?q=frog&type=gifs', body.key))).status,
    ).toBe(400)
  })
})
