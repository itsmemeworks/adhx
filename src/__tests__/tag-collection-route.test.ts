import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * Shared-tag-collection route tests — `src/app/t/[username]/[tag]/page.tsx`.
 *
 * Mirrors the style of `author-hub-route.test.ts`: mocks the data layer
 * (`@/lib/tags/query`) and asserts the route's branching (not_found → 404,
 * private → quiet no-index page with zero item content, ok → rendered page +
 * rich metadata) without touching a real database.
 *
 * The `ok` + non-empty branch mounts `<TheaterShell mode="collection">` (the
 * tag-collections-as-theater feature) instead of a server-rendered card grid
 * — that component is a heavy client component (localStorage/matchMedia/
 * fetch-backed hooks) with no business being exercised via
 * `renderToStaticMarkup` in a DOM-less test, so it's mocked here the same way
 * `url-prefix-route.test.ts` mocks it for the tweet-preview route. This test
 * asserts the SEO-critical bits this page still owns directly: the sr-only
 * crawlable link list and the props handed to the theater.
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

// Resolved only on a `not_found` — never hits the real DB in this
// route-level test. Redirect behavior is covered by its own describe block
// below.
vi.mock('@/lib/users/lookup', () => ({
  resolveUsernameAlias: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
  permanentRedirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

const theaterShellSpy = vi.fn()
vi.mock('@/components/theater/TheaterShell', () => ({
  TheaterShell: (props: unknown) => {
    theaterShellSpy(props)
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

      expect(metadata.title).toBe("#cool-stuff — @curator's playlist on ADHX")
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
      expect(html).toContain('Private playlist')
      expect(html).not.toContain('someauthor')
    })

    it('renders the sr-only crawlable list + mounts the theater for a public tag', async () => {
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

      // The interactive surface is `TheaterShell` (mocked above) — assert
      // it's mounted in collection mode with the right identity + seed.
      expect(theaterShellSpy).toHaveBeenCalledTimes(1)
      const props = theaterShellSpy.mock.calls[0][0] as {
        mode: string
        authed: boolean
        playlist: { tag: string; curator: string; count: number }
        seed: { items: Array<{ platform: string; bookmarkId: string | null }> }
      }
      expect(props.mode).toBe('playlist')
      expect(props.authed).toBe(false)
      expect(props.playlist).toEqual({ tag: 'cool-stuff', curator: 'curator', count: 2 })
      expect(props.seed.items).toHaveLength(2)
      expect(props.seed.items.map((i) => i.bookmarkId)).toEqual(['1', '2'])
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
