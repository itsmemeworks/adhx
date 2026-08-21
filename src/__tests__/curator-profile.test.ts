import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * Curator-profile route tests — `src/app/t/[username]/page.tsx`.
 *
 * Mirrors the style of `tag-collection-route.test.ts`: mocks the data layer
 * (`@/lib/users/profile`) and asserts the route's branching (not_found → 404,
 * ok → rendered page + rich metadata + JSON-LD) without touching a real
 * database. `CollectionPosterCard` (`@/components/tags`) is mocked the same
 * way that test mocks `TheaterShell` — it's a separate component under
 * parallel development, not this route's own SEO-critical content.
 *
 * The privacy invariants (private tags never leak, cross-user isolation,
 * zero-public-collections → not_found) are verified for real against an
 * in-memory DB in `users-profile-query.test.ts` — this file only asserts
 * that the route renders whatever the data layer hands it, correctly.
 */

vi.mock('@/lib/users/profile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/users/profile')>()
  return {
    ...actual,
    getPublicProfile: vi.fn(),
  }
})

// Resolved only on a `not_found` — never hits the real DB in this route-level
// test (mirrors `getPublicProfile` above). Redirect behavior is covered by
// its own describe block below.
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

const posterCardSpy = vi.fn()
vi.mock('@/components/tags', () => ({
  CollectionPosterCard: (props: unknown) => {
    posterCardSpy(props)
    return null
  },
}))

const SAMPLE_PROFILE = {
  status: 'ok' as const,
  profile: {
    username: 'curator',
    displayName: 'The Curator',
    avatarUrl: 'https://example.com/avatar.jpg',
    memberSince: '2026-03-15T00:00:00Z',
    publicTagCount: 2,
    postCount: 3,
    collections: [
      {
        tag: 'cool-stuff',
        count: 2,
        tiles: [{ thumbnailUrl: 'https://example.com/thumb.jpg', text: 'a post' }],
        href: '/t/curator/cool-stuff',
        stats: { viewCount: 42, cloneCount: 5, rank: 3 },
      },
      {
        tag: 'more-stuff',
        count: 1,
        tiles: [],
        href: '/t/curator/more-stuff',
        stats: null,
      },
    ],
    stats: { viewCount: 42, cloneCount: 5, bestRank: 3 },
  },
}

describe('Curator profile route: /t/[username]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateMetadata', () => {
    it('falls back to default metadata when the user is not found', async () => {
      const { getPublicProfile: mocked } = await import('@/lib/users/profile')
      vi.mocked(mocked).mockResolvedValue({ status: 'not_found' })

      const { generateMetadata } = await import('@/app/t/[username]/page')
      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'nobody' }),
      })

      expect(metadata.title).toBe('@nobody — ADHX')
    })

    it('builds rich metadata listing collection names', async () => {
      const { getPublicProfile: mocked } = await import('@/lib/users/profile')
      vi.mocked(mocked).mockResolvedValue(SAMPLE_PROFILE)

      const { generateMetadata } = await import('@/app/t/[username]/page')
      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'curator' }),
      })

      expect(metadata.title).toBe('@curator — collections on ADHX')
      expect(metadata.description).toContain('#cool-stuff')
      expect(metadata.description).toContain('#more-stuff')
      expect(metadata.alternates?.canonical).toContain('/t/curator')
    })
  })

  describe('page rendering', () => {
    it('calls notFound() when the user does not exist', async () => {
      const { getPublicProfile: mocked } = await import('@/lib/users/profile')
      vi.mocked(mocked).mockResolvedValue({ status: 'not_found' })

      const CuratorProfilePage = (await import('@/app/t/[username]/page')).default
      await expect(
        CuratorProfilePage({ params: Promise.resolve({ username: 'nobody' }) }),
      ).rejects.toThrow('NOT_FOUND')
    })

    it('renders JSON-LD, the sr-only crawlable list, and a poster card per collection', async () => {
      const { getPublicProfile: mocked } = await import('@/lib/users/profile')
      vi.mocked(mocked).mockResolvedValue(SAMPLE_PROFILE)

      const CuratorProfilePage = (await import('@/app/t/[username]/page')).default
      const result = await CuratorProfilePage({
        params: Promise.resolve({ username: 'curator' }),
      })

      expect(result).not.toBeNull()
      const html = renderToStaticMarkup(result as React.ReactElement)

      expect(html).toContain('application/ld+json')
      expect(html).toContain('ProfilePage')
      expect(html).toContain('href="/t/curator/cool-stuff"')
      expect(html).toContain('href="/t/curator/more-stuff"')
      expect(html).toContain('@curator')

      expect(posterCardSpy).toHaveBeenCalledTimes(2)
      const firstProps = posterCardSpy.mock.calls[0][0] as {
        tag: string
        count: number
        href: string
        stats: unknown
      }
      expect(firstProps.tag).toBe('cool-stuff')
      expect(firstProps.count).toBe(2)
      expect(firstProps.href).toBe('/t/curator/cool-stuff')

      // Discovery stats are forwarded through to the poster card (docs/specs/
      // discovery-leaderboards.md §6) — the rank chip renders inside the
      // card's own stat line, not as a top-right `badge` (which the
      // component docs say isn't safe to combine with `wholeCardLink`).
      expect(firstProps.stats).toEqual({ viewCount: 42, cloneCount: 5, rank: 3 })
      const secondProps = posterCardSpy.mock.calls[1][0] as { stats: unknown }
      expect(secondProps.stats).toBeNull()

      // Curator stat strip under the handle.
      expect(html).toContain('42 views this week')
      expect(html).toContain('5 saves')
      expect(html).toContain('#3 on the')
    })

    it('omits the curator stat strip when there is no view/save activity yet', async () => {
      const { getPublicProfile: mocked } = await import('@/lib/users/profile')
      vi.mocked(mocked).mockResolvedValue({
        ...SAMPLE_PROFILE,
        profile: {
          ...SAMPLE_PROFILE.profile,
          collections: SAMPLE_PROFILE.profile.collections.map((c) => ({ ...c, stats: null })),
          stats: { viewCount: 0, cloneCount: 0, bestRank: null },
        },
      })

      const CuratorProfilePage = (await import('@/app/t/[username]/page')).default
      const result = await CuratorProfilePage({
        params: Promise.resolve({ username: 'curator' }),
      })
      const html = renderToStaticMarkup(result as React.ReactElement)

      expect(html).not.toContain('views this week')
    })

    it('decodes a percent-encoded username before querying', async () => {
      const { getPublicProfile: mocked } = await import('@/lib/users/profile')
      vi.mocked(mocked).mockResolvedValue(SAMPLE_PROFILE)

      const { generateMetadata } = await import('@/app/t/[username]/page')
      await generateMetadata({ params: Promise.resolve({ username: '%63urator' }) })

      expect(vi.mocked(mocked)).toHaveBeenCalledWith('curator')
    })

    it('308s to the current username when the old one resolves via username_aliases', async () => {
      const { getPublicProfile: mocked } = await import('@/lib/users/profile')
      vi.mocked(mocked).mockResolvedValue({ status: 'not_found' })
      const { resolveUsernameAlias } = await import('@/lib/users/lookup')
      vi.mocked(resolveUsernameAlias).mockResolvedValue({ userId: 'u1', username: 'newname' })

      const CuratorProfilePage = (await import('@/app/t/[username]/page')).default
      await expect(
        CuratorProfilePage({ params: Promise.resolve({ username: 'oldname' }) }),
      ).rejects.toThrow('REDIRECT:/t/newname')
    })

    it('still 404s when neither a live user nor an alias matches', async () => {
      const { getPublicProfile: mocked } = await import('@/lib/users/profile')
      vi.mocked(mocked).mockResolvedValue({ status: 'not_found' })
      const { resolveUsernameAlias } = await import('@/lib/users/lookup')
      vi.mocked(resolveUsernameAlias).mockResolvedValue(null)

      const CuratorProfilePage = (await import('@/app/t/[username]/page')).default
      await expect(
        CuratorProfilePage({ params: Promise.resolve({ username: 'nobody' }) }),
      ).rejects.toThrow('NOT_FOUND')
    })
  })
})
