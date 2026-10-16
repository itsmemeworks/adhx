import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

let mockCurrentUserId: string | null = null

/**
 * Shared-tag-collection route tests — `src/app/t/[username]/[tag]/page.tsx`.
 *
 * Mirrors the style of `author-hub-route.test.ts`: mocks the data layer
 * (`@/lib/tags/query`) and asserts the route's branching (not_found → 404,
 * private → quiet no-index page with zero item content, ok → rendered page +
 * rich metadata) without touching a real database.
 *
 * The `ok` branch mounts `<ChannelPage>`, a client component that loads its
 * own posts, so it's mocked here. This test asserts the SEO-critical bits
 * this page still owns directly: the sr-only crawlable link list and the
 * props handed to the channel page.
 */

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockCurrentUserId)),
}))

vi.mock('@/lib/tags/query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tags/query')>()
  return {
    ...actual,
    getPublicTagCollection: vi.fn(),
  }
})

// Resolved only on a `not_found` — never hits the real DB in this
// route-level test. Redirect behavior is covered by its own describe block
// below.
vi.mock('@/lib/users/lookup', () => ({
  getUserIdForUsername: vi.fn(() => Promise.resolve('owner-id')),
  resolveUsernameAlias: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn(() => 'Mozilla/5.0'),
    }),
  ),
}))

const recordCollectionEventSpy = vi.fn()
vi.mock('@/lib/discovery/record', () => ({
  recordCollectionEvent: (event: unknown) => recordCollectionEventSpy(event),
}))

const recordAnalyticSpy = vi.fn()
vi.mock('@/lib/analytics/record', () => ({
  recordAnalytic: (event: unknown) => recordAnalyticSpy(event),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
  permanentRedirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

const channelPageSpy = vi.fn()
vi.mock('@/components/next/channels/ChannelPage', () => ({
  ChannelPage: (props: unknown) => {
    channelPageSpy(props)
    return null
  },
}))

const SAMPLE_COLLECTION = {
  status: 'ok' as const,
  data: {
    tag: 'cool-stuff',
    username: 'curator',
    tweetCount: 2,
    items: [
      {
        bookmarkId: '1',
        platform: 'twitter',
        author: 'someauthor',
        authorName: 'Some Author',
        authorAvatarUrl: null,
        text: 'Hello world',
        thumbnailUrl: null,
        extraMediaCount: 0,
        contentType: 'text' as const,
        createdAt: '2026-06-06T10:00:00Z',
        url: '/someauthor/status/1',
        externalUrl: 'https://x.com/someauthor/status/1',
      },
      {
        bookmarkId: '2',
        platform: 'twitter',
        author: 'someauthor',
        authorName: 'Some Author',
        authorAvatarUrl: null,
        text: 'A video post',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        extraMediaCount: 0,
        contentType: 'video' as const,
        createdAt: '2026-06-06T11:00:00Z',
        url: '/someauthor/status/2',
        externalUrl: 'https://x.com/someauthor/status/2',
      },
    ],
  },
}

describe('Shared tag route: /t/[username]/[tag]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrentUserId = null
  })

  describe('generateMetadata', () => {
    it('falls back to default metadata when the tag is not found', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue({ status: 'not_found' })

      const { generateMetadata } = await import('@/app/t/[username]/[tag]/page')
      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'nobody', tag: 'some-tag' }),
      })

      expect(metadata.title).toBe('ADHX channel')
      expect(JSON.stringify(metadata)).toContain('/api/og/playlist/brand/card?generic=1')
      expect(JSON.stringify(metadata)).not.toContain('nobody')
      expect(JSON.stringify(metadata)).not.toContain('some-tag')
    })

    it('marks a private tag noindex without leaking any content', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue({ status: 'private' })

      const { generateMetadata } = await import('@/app/t/[username]/[tag]/page')
      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'curator', tag: 'secret-tag' }),
      })

      expect(metadata.title).toBe('Private channel — ADHX')
      expect(metadata.robots).toEqual({ index: false, follow: false })
      expect(JSON.stringify(metadata)).toContain('/api/og/playlist/brand/card?generic=1')
      expect(JSON.stringify(metadata)).not.toContain('curator')
      expect(JSON.stringify(metadata)).not.toContain('secret-tag')
      expect(JSON.stringify(metadata)).not.toContain('secret content')
    })

    it('builds rich metadata from the tag collection', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue(SAMPLE_COLLECTION)

      const { generateMetadata } = await import('@/app/t/[username]/[tag]/page')
      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'curator', tag: 'cool-stuff' }),
      })

      expect(metadata.title).toBe("#cool-stuff — @curator's channel on ADHX")
      expect(metadata.description).toContain('2 bookmarks curated by @curator')
      expect(metadata.alternates?.canonical).toContain('/t/curator/cool-stuff')
      expect(JSON.stringify(metadata)).toContain('/api/og/playlist/curator/cool-stuff')
      expect(JSON.stringify(metadata)).not.toContain('https://example.com/thumb.jpg')
    })
  })

  describe('page rendering', () => {
    it('calls notFound() when the tag/user does not exist', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue({ status: 'not_found' })

      const SharedTagPage = (await import('@/app/t/[username]/[tag]/page')).default

      await expect(
        SharedTagPage({ params: Promise.resolve({ username: 'nobody', tag: 'some-tag' }) }),
      ).rejects.toThrow('NOT_FOUND')
    })

    it('renders a private-collection message with no item content for a private tag', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue({ status: 'private' })

      const SharedTagPage = (await import('@/app/t/[username]/[tag]/page')).default
      const result = await SharedTagPage({
        params: Promise.resolve({ username: 'curator', tag: 'secret-tag' }),
      })

      expect(result).not.toBeNull()
      const html = renderToStaticMarkup(result as React.ReactElement)
      expect(html).toContain('Private channel')
      expect(html).not.toContain('someauthor')
    })

    it('shows a private channel only to its owner', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue({ status: 'private' })
      const SharedTagPage = (await import('@/app/t/[username]/[tag]/page')).default
      const render = async () =>
        renderToStaticMarkup(
          (await SharedTagPage({
            params: Promise.resolve({ username: 'curator', tag: 'secret-tag' }),
          })) as React.ReactElement,
        )

      mockCurrentUserId = 'someone-else'
      expect(await render()).toContain('Private channel')
      expect(channelPageSpy).not.toHaveBeenCalled()

      mockCurrentUserId = 'owner-id'
      await render()
      expect(channelPageSpy).toHaveBeenCalledWith(expect.objectContaining({ mine: true }))
    })

    it('renders the sr-only crawlable list + mounts the channel page for a public tag', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue(SAMPLE_COLLECTION)

      const SharedTagPage = (await import('@/app/t/[username]/[tag]/page')).default
      const result = await SharedTagPage({
        params: Promise.resolve({ username: 'curator', tag: 'cool-stuff' }),
      })

      expect(result).not.toBeNull()
      const html = renderToStaticMarkup(result as React.ReactElement)

      // The sr-only crawlable list is this page's own SEO-critical content —
      // every item's link must point on-site, to the ADHX preview path.
      expect(html).toContain('href="/someauthor/status/1"')
      expect(html).toContain('href="/someauthor/status/2"')
      expect(html).toContain('Hello world')
      expect(html).toContain('A video post')

      expect(html).toContain('application/ld+json')
      expect(channelPageSpy).toHaveBeenCalledWith({
        username: 'curator',
        tag: 'cool-stuff',
        count: 2,
        mine: false,
        signedIn: false,
      })
    })

    it('treats a rejected stale session as anonymous chrome and analytics', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue(SAMPLE_COLLECTION)
      mockCurrentUserId = null

      const SharedTagPage = (await import('@/app/t/[username]/[tag]/page')).default
      const result = await SharedTagPage({
        params: Promise.resolve({ username: 'curator', tag: 'cool-stuff' }),
      })
      renderToStaticMarkup(result as React.ReactElement)

      const { getCurrentUserId } = await import('@/lib/auth/session')
      expect(getCurrentUserId).toHaveBeenCalledTimes(1)
      expect(channelPageSpy).toHaveBeenCalledWith(expect.objectContaining({ signedIn: false }))
      expect(recordCollectionEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ viewerId: null }),
      )
      expect(recordAnalyticSpy).toHaveBeenCalledWith(expect.objectContaining({ userId: null }))
    })

    it('persists only a validated live account ID for a playlist view', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue(SAMPLE_COLLECTION)
      mockCurrentUserId = 'viewer-id'

      const SharedTagPage = (await import('@/app/t/[username]/[tag]/page')).default
      const result = await SharedTagPage({
        params: Promise.resolve({ username: 'curator', tag: 'cool-stuff' }),
      })
      renderToStaticMarkup(result as React.ReactElement)

      expect(channelPageSpy).toHaveBeenCalledWith(expect.objectContaining({ signedIn: true }))
      expect(recordCollectionEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ viewerId: 'viewer-id' }),
      )
      expect(recordAnalyticSpy).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'viewer-id' }),
      )
    })

    it('decodes a percent-encoded username/tag before querying', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue(SAMPLE_COLLECTION)

      const { generateMetadata } = await import('@/app/t/[username]/[tag]/page')
      await generateMetadata({
        params: Promise.resolve({ username: 'curator', tag: '%63ool-stuff' }),
      })

      expect(vi.mocked(getPublicTagCollection)).toHaveBeenCalledWith('curator', 'cool-stuff')
    })

    it('308s to the current username when the old one resolves via username_aliases', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue({ status: 'not_found' })
      const { resolveUsernameAlias } = await import('@/lib/users/lookup')
      vi.mocked(resolveUsernameAlias).mockResolvedValue({ userId: 'u1', username: 'newname' })

      const SharedTagPage = (await import('@/app/t/[username]/[tag]/page')).default
      await expect(
        SharedTagPage({ params: Promise.resolve({ username: 'oldname', tag: 'cool-stuff' }) }),
      ).rejects.toThrow('REDIRECT:/t/newname/cool-stuff')
    })

    it('still 404s when neither a live user nor an alias matches', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue({ status: 'not_found' })
      const { resolveUsernameAlias } = await import('@/lib/users/lookup')
      vi.mocked(resolveUsernameAlias).mockResolvedValue(null)

      const SharedTagPage = (await import('@/app/t/[username]/[tag]/page')).default
      await expect(
        SharedTagPage({ params: Promise.resolve({ username: 'nobody', tag: 'some-tag' }) }),
      ).rejects.toThrow('NOT_FOUND')
    })
  })
})
