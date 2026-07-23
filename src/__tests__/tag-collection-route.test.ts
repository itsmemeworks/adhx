import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * Shared-tag-collection route tests — `src/app/t/[username]/[tag]/page.tsx`.
 *
 * Mirrors the style of `author-hub-route.test.ts`: mocks the data layer
 * (`@/lib/tags/query`) and asserts the route's branching (not_found → 404,
 * private → quiet no-index page with zero item content, ok → rendered page +
 * rich metadata) without touching a real database.
 */

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/lib/tags/query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tags/query')>()
  return {
    ...actual,
    getPublicTagCollection: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
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
  })

  describe('generateMetadata', () => {
    it('falls back to default metadata when the tag is not found', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue({ status: 'not_found' })

      const { generateMetadata } = await import('@/app/t/[username]/[tag]/page')
      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'nobody', tag: 'some-tag' }),
      })

      expect(metadata.title).toBe('#some-tag — ADHX')
    })

    it('marks a private tag noindex without leaking any content', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue({ status: 'private' })

      const { generateMetadata } = await import('@/app/t/[username]/[tag]/page')
      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'curator', tag: 'secret-tag' }),
      })

      expect(metadata.robots).toEqual({ index: false, follow: false })
      expect(JSON.stringify(metadata)).not.toContain('secret content')
    })

    it('builds rich metadata from the tag collection', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue(SAMPLE_COLLECTION)

      const { generateMetadata } = await import('@/app/t/[username]/[tag]/page')
      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'curator', tag: 'cool-stuff' }),
      })

      expect(metadata.title).toBe("#cool-stuff — @curator's collection on ADHX")
      expect(metadata.description).toContain('2 bookmarks curated by @curator')
      expect(metadata.alternates?.canonical).toContain('/t/curator/cool-stuff')
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
      expect(html).toContain('Private collection')
      expect(html).not.toContain('someauthor')
    })

    it('renders the collection for a public tag', async () => {
      const { getPublicTagCollection } = await import('@/lib/tags/query')
      vi.mocked(getPublicTagCollection).mockResolvedValue(SAMPLE_COLLECTION)

      const SharedTagPage = (await import('@/app/t/[username]/[tag]/page')).default
      const result = await SharedTagPage({
        params: Promise.resolve({ username: 'curator', tag: 'cool-stuff' }),
      })

      expect(result).not.toBeNull()
      const html = renderToStaticMarkup(result as React.ReactElement)

      // Every item's primary link must point on-site, to the ADHX preview path.
      expect(html).toContain('href="/someauthor/status/1"')
      expect(html).toContain('href="/someauthor/status/2"')

      // Any anchor that DOES point at x.com must be the demoted secondary
      // "view on the original platform" icon link (target="_blank" + the
      // specific aria-label), never a bare/primary card link.
      const anchors = html.match(/<a\b[^>]*>/g) ?? []
      const externalAnchors = anchors.filter((a) => /href="https:\/\/x\.com/.test(a))
      expect(externalAnchors.length).toBeGreaterThan(0)
      for (const a of externalAnchors) {
        expect(a).toContain('target="_blank"')
        expect(a).toContain('aria-label="View on the original platform"')
      }
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
  })
})
