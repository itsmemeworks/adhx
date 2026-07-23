import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Author hub route tests — `src/app/[username]/page.tsx`.
 *
 * Covers handle validation/decoding, the notFound() 404 path (invalid handle,
 * or zero public items), and metadata fallback — mirroring the style of
 * `url-prefix-route.test.ts` for the sibling `/status/[id]` route.
 */

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/lib/authors/query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authors/query')>()
  return {
    ...actual,
    getAuthorProfile: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
}))

const SAMPLE_PROFILE = {
  handle: 'testauthor',
  authorName: 'Test Author',
  avatarUrl: 'https://example.com/avatar.jpg',
  totalCount: 2,
  items: [
    {
      bookmarkId: '1',
      text: 'Hello world',
      thumbnailUrl: null,
      url: '/testauthor/status/1',
      createdAt: '2026-06-06T10:00:00Z',
      saveCount: 3,
      contentType: 'text' as const,
    },
    {
      bookmarkId: '2',
      text: 'A video post',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      url: '/testauthor/status/2',
      createdAt: '2026-06-06T11:00:00Z',
      saveCount: 1,
      contentType: 'video' as const,
    },
  ],
}

describe('Author hub route: /[username]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateMetadata', () => {
    it('falls back to default metadata for an invalid handle', async () => {
      const { generateMetadata } = await import('@/app/[username]/page')

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'invalid-handle!' }),
      })

      expect(metadata.title).toBe('ADHX - Save now. Read never. Find always.')
    })

    it('falls back to default metadata when the author has no public profile', async () => {
      const { getAuthorProfile } = await import('@/lib/authors/query')
      vi.mocked(getAuthorProfile).mockResolvedValue(null)

      const { generateMetadata } = await import('@/app/[username]/page')

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'nobody' }),
      })

      expect(metadata.title).toBe('ADHX - Save now. Read never. Find always.')
    })

    it('builds rich metadata from the author profile', async () => {
      const { getAuthorProfile } = await import('@/lib/authors/query')
      vi.mocked(getAuthorProfile).mockResolvedValue(SAMPLE_PROFILE)

      const { generateMetadata } = await import('@/app/[username]/page')

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'testauthor' }),
      })

      expect(metadata.title).toBe('@testauthor — saved posts')
      expect(metadata.description).toContain('2 public posts')
      expect(metadata.alternates?.canonical).toContain('/testauthor')
    })

    it('decodes a percent-encoded handle before validating', async () => {
      const { getAuthorProfile } = await import('@/lib/authors/query')
      vi.mocked(getAuthorProfile).mockResolvedValue(SAMPLE_PROFILE)

      const { generateMetadata } = await import('@/app/[username]/page')

      // Next may hand us an already-encoded segment; %74estauthor decodes to
      // "testauthor" (a valid handle) — should NOT fall back to defaults.
      await generateMetadata({
        params: Promise.resolve({ username: '%74estauthor' }),
      })

      expect(vi.mocked(getAuthorProfile)).toHaveBeenCalledWith('testauthor')
    })
  })

  describe('page rendering / notFound', () => {
    it('calls notFound() for an invalid handle', async () => {
      const AuthorHubPage = (await import('@/app/[username]/page')).default

      await expect(
        AuthorHubPage({ params: Promise.resolve({ username: 'not a handle' }) }),
      ).rejects.toThrow('NOT_FOUND')
    })

    it('calls notFound() when the author has zero public items', async () => {
      const { getAuthorProfile } = await import('@/lib/authors/query')
      vi.mocked(getAuthorProfile).mockResolvedValue(null)

      const AuthorHubPage = (await import('@/app/[username]/page')).default

      await expect(
        AuthorHubPage({ params: Promise.resolve({ username: 'nobody' }) }),
      ).rejects.toThrow('NOT_FOUND')
    })

    it('renders for a valid handle with public items', async () => {
      const { getAuthorProfile } = await import('@/lib/authors/query')
      vi.mocked(getAuthorProfile).mockResolvedValue(SAMPLE_PROFILE)

      const AuthorHubPage = (await import('@/app/[username]/page')).default

      const result = await AuthorHubPage({
        params: Promise.resolve({ username: 'testauthor' }),
      })

      expect(result).not.toBeNull()
    })

    it('rejects a mismatched dynamic-route reserved-looking name with no data (404 rather than a crash)', async () => {
      const { getAuthorProfile } = await import('@/lib/authors/query')
      vi.mocked(getAuthorProfile).mockResolvedValue(null)

      const AuthorHubPage = (await import('@/app/[username]/page')).default

      // Static routes (trending, settings, api, etc.) always win at the
      // filesystem-routing level, but a reserved-looking word that's still a
      // valid handle shape with zero saved data must 404 gracefully rather
      // than render an empty hub.
      await expect(
        AuthorHubPage({ params: Promise.resolve({ username: 'settings' }) }),
      ).rejects.toThrow('NOT_FOUND')
    })
  })
})
