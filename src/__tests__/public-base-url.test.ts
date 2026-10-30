import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, type TestDbInstance, USER_A } from './api/setup'
import * as schema from '@/lib/db/schema'
import { __resetRateLimitState } from '@/lib/rate-limit'

/**
 * A prebuilt image has no address compiled in. Absolute links (canonical,
 * og:url, og:image, JSON-LD, previewUrl) must use this server's own address,
 * read per request, never adhx.com.
 */

let testInstance: TestDbInstance

const mocks = vi.hoisted(() => ({
  getCachedTweet: vi.fn(),
  fetchTweetData: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/media/fxembed', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/fxembed')>('@/lib/media/fxembed')
  return { ...actual, fetchTweetData: mocks.fetchTweetData }
})
vi.mock('@/lib/utils/og-fetch', () => ({ fetchOgMetadata: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/auth/session', () => ({ getCurrentUserId: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/theater/resolve-shared-preview', () => ({
  getCachedTweet: mocks.getCachedTweet,
  resolveTweetShared: vi.fn(),
}))
vi.mock('@/lib/theater/shared-seed', () => ({
  buildSharedSeed: vi.fn(),
  stubTweetTheaterItem: vi.fn(),
}))
vi.mock('@/lib/theater/shared-preview', () => ({
  MODERATED_PAGE_METADATA: {},
  SharedPreviewPage: () => null,
}))

const OWNER_ADDRESS = 'http://192.168.1.20:3000'
const ADDRESS_ENV = [
  'NEXT_PUBLIC_APP_URL',
  'APP_URL',
  'RENDER_EXTERNAL_URL',
  'RAILWAY_PUBLIC_DOMAIN',
  'FLY_APP_NAME',
  'COOLIFY_URL',
  'ZEABUR_WEB_URL',
]

const tweet = {
  id: '2075540047613276197',
  url: 'https://x.com/kyutai_labs/status/2075540047613276197',
  text: 'A post with a photo.',
  author: {
    id: '1',
    name: 'Kyutai',
    screen_name: 'kyutai_labs',
    avatar_url: 'https://pbs.twimg.com/profile/k.jpg',
  },
  created_at: '2026-10-01T10:00:00Z',
  replies: 0,
  retweets: 0,
  likes: 0,
  media: {
    videos: [
      {
        url: 'https://video.twimg.com/v.mp4',
        thumbnail_url: 'https://pbs.twimg.com/thumb.jpg',
        width: 1280,
        height: 720,
        type: 'video',
      },
    ],
  },
}

beforeEach(() => {
  testInstance = createTestDb()
  __resetRateLimitState()
  for (const name of ADDRESS_ENV) vi.stubEnv(name, '')
  // The address the owner set ADHX up from, as /setup remembers it.
  testInstance.db
    .insert(schema.serverSettings)
    .values({ key: 'app_url', value: OWNER_ADDRESS, updatedAt: '2026-10-29' })
    .run()
})

afterEach(() => {
  testInstance.close()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('absolute links use this server’s address', () => {
  it('in a post preview page’s metadata', async () => {
    mocks.getCachedTweet.mockResolvedValue(tweet)
    const { generateMetadata } = await import('@/app/[username]/status/[id]/page')
    const metadata = await generateMetadata({
      params: Promise.resolve({ username: 'kyutai_labs', id: tweet.id }),
    })

    const canonical = `${OWNER_ADDRESS}/kyutai_labs/status/${tweet.id}`
    expect(metadata.alternates?.canonical).toBe(canonical)
    expect((metadata.openGraph as { url?: string }).url).toBe(canonical)
    const og = metadata.openGraph as { videos?: { url: string }[] }
    expect(og.videos?.[0]?.url.startsWith(`${OWNER_ADDRESS}/api/media/video?`)).toBe(true)
    expect(JSON.stringify(metadata)).not.toContain('adhx.com')
  })

  it('in the root layout’s metadataBase', async () => {
    vi.doMock('next/font/local', () => ({ default: () => ({ variable: 'font' }) }))
    vi.doMock('@/components/AppShell', () => ({ AppShell: () => null }))
    vi.doMock('@/components/next/demo/DemoBar', () => ({ DemoBar: () => null }))
    const { generateMetadata } = await import('@/app/layout')
    const metadata = generateMetadata()
    expect(String(metadata.metadataBase)).toBe(`${OWNER_ADDRESS}/`)
    expect((metadata.openGraph as { url?: string }).url).toBe(OWNER_ADDRESS)
  })

  it('in the public post JSON’s previewUrl', async () => {
    testInstance.db
      .insert(schema.bookmarks)
      .values({
        id: tweet.id,
        userId: USER_A,
        author: 'kyutai_labs',
        text: tweet.text,
        tweetUrl: tweet.url,
        processedAt: new Date().toISOString(),
      })
      .run()
    mocks.fetchTweetData.mockResolvedValue({ code: 200, message: 'OK', tweet })

    const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
    const response = await GET(
      new NextRequest(`${OWNER_ADDRESS}/api/share/tweet/kyutai_labs/${tweet.id}`),
      { params: Promise.resolve({ username: 'kyutai_labs', id: tweet.id }) },
    )
    const data = await response.json()
    expect(data.adhxContext.previewUrl).toBe(`${OWNER_ADDRESS}/kyutai_labs/status/${tweet.id}`)
    expect(JSON.stringify(data)).not.toContain('adhx.com')
  })
})
