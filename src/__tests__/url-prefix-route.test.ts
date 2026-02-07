import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * URL Prefix Route Tests
 *
 * Tests the validation logic and metadata generation for the
 * [username]/status/[id] route that handles quick-add via URL prefix.
 */

// Mock dependencies before importing the module
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/lib/media/fxembed', () => ({
  fetchTweetData: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

// Mock React components
vi.mock('@/components/QuickAddLanding', () => ({
  QuickAddLanding: () => null,
}))

vi.mock('@/components/TweetPreviewLanding', () => ({
  TweetPreviewLanding: () => null,
}))

describe('URL Prefix Route: /[username]/status/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Username validation', () => {
    const VALID_USERNAMES = [
      'a', // minimum 1 char
      'user123',
      'test_user',
      '_underscore_',
      'UPPERCASE',
      'MixedCase123',
      'abcdefghijklmno', // maximum 15 chars
    ]

    const INVALID_USERNAMES = [
      '', // empty
      'abcdefghijklmnop', // 16 chars (too long)
      'user-name', // hyphen not allowed
      'user.name', // dot not allowed
      'user name', // space not allowed
      'user@name', // @ not allowed
      'émoji', // non-ASCII
    ]

    it.each(VALID_USERNAMES)('accepts valid username: %s', (username) => {
      const pattern = /^\w{1,15}$/
      expect(pattern.test(username)).toBe(true)
    })

    it.each(INVALID_USERNAMES)('rejects invalid username: %s', (username) => {
      const pattern = /^\w{1,15}$/
      expect(pattern.test(username)).toBe(false)
    })
  })

  describe('Tweet ID validation', () => {
    const VALID_TWEET_IDS = [
      '1',
      '123456789',
      '1234567890123456789', // Twitter snowflake IDs are ~19 digits
      '0', // technically valid numeric
    ]

    const INVALID_TWEET_IDS = [
      '', // empty
      'abc', // non-numeric
      '123abc', // mixed
      '12.34', // decimal
      '-123', // negative
      '123 456', // space
    ]

    it.each(VALID_TWEET_IDS)('accepts valid tweet ID: %s', (id) => {
      const pattern = /^\d+$/
      expect(pattern.test(id)).toBe(true)
    })

    it.each(INVALID_TWEET_IDS)('rejects invalid tweet ID: %s', (id) => {
      const pattern = /^\d+$/
      expect(pattern.test(id)).toBe(false)
    })
  })

  describe('Metadata generation', () => {
    it('returns fallback metadata for invalid username', async () => {
      const { generateMetadata } = await import(
        '@/app/[username]/status/[id]/page'
      )

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'invalid-user', id: '123' }),
      })

      expect(metadata.title).toBe('ADHX - Save now. Read never. Find always.')
      expect(metadata.description).toBe(
        'For people who bookmark everything and read nothing.'
      )
    })

    it('returns fallback metadata for invalid tweet ID', async () => {
      const { generateMetadata } = await import(
        '@/app/[username]/status/[id]/page'
      )

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'validuser', id: 'not-numeric' }),
      })

      expect(metadata.title).toBe('ADHX - Save now. Read never. Find always.')
    })

    it('returns user-specific fallback when FxTwitter fails', async () => {
      const { fetchTweetData } = await import('@/lib/media/fxembed')
      vi.mocked(fetchTweetData).mockResolvedValue(null)

      const { generateMetadata } = await import(
        '@/app/[username]/status/[id]/page'
      )

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'testuser', id: '123456789' }),
      })

      expect(metadata.title).toBe("Save @testuser's tweet - ADHX")
      expect(metadata.description).toBe('Save this tweet to your ADHX collection')
    })

    it('generates rich metadata when tweet data is available', async () => {
      const { fetchTweetData } = await import('@/lib/media/fxembed')
      vi.mocked(fetchTweetData).mockResolvedValue({
        code: 200,
        message: 'OK',
        tweet: {
          id: '123456789',
          url: 'https://x.com/testauthor/status/123456789',
          text: 'This is a test tweet with some interesting content',
          author: {
            id: '1',
            name: 'Test Author',
            screen_name: 'testauthor',
            avatar_url: 'https://example.com/avatar.jpg',
          },
          created_at: '2024-01-01T00:00:00Z',
                    replies: 0,
          retweets: 0,
          likes: 0,
          views: 0,
        },
      })

      const { generateMetadata } = await import(
        '@/app/[username]/status/[id]/page'
      )

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'testauthor', id: '123456789' }),
      })

      expect(metadata.title).toContain('@testauthor')
      expect(metadata.title).toContain('This is a test tweet')
      expect(metadata.description).toBe(
        'This is a test tweet with some interesting content'
      )
      expect(metadata.openGraph?.title).toBe('@testauthor on X')
    })

    it('truncates long tweet text in metadata', async () => {
      const { fetchTweetData } = await import('@/lib/media/fxembed')
      const longText = 'A'.repeat(300) // Longer than 280 char limit

      vi.mocked(fetchTweetData).mockResolvedValue({
        code: 200,
        message: 'OK',
        tweet: {
          id: '123',
          url: 'https://x.com/user/status/123',
          text: longText,
          author: {
            id: '1',
            name: 'User',
            screen_name: 'user',
            avatar_url: 'https://example.com/avatar.jpg',
          },
          created_at: '2024-01-01T00:00:00Z',
                    replies: 0,
          retweets: 0,
          likes: 0,
          views: 0,
        },
      })

      const { generateMetadata } = await import(
        '@/app/[username]/status/[id]/page'
      )

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'user', id: '123' }),
      })

      // Description should be truncated to 280 chars (expanded for richer social unfurls)
      expect(metadata.description!.length).toBeLessThanOrEqual(280)
    })
  })

  describe('Page rendering', () => {
    it('redirects to home for invalid username', async () => {
      const QuickAddPage = (await import('@/app/[username]/status/[id]/page'))
        .default

      await expect(
        QuickAddPage({
          params: Promise.resolve({ username: 'invalid-user-name', id: '123' }),
        })
      ).rejects.toThrow('REDIRECT:/')
    })

    it('redirects to home for invalid tweet ID', async () => {
      const QuickAddPage = (await import('@/app/[username]/status/[id]/page'))
        .default

      await expect(
        QuickAddPage({
          params: Promise.resolve({ username: 'validuser', id: 'abc123' }),
        })
      ).rejects.toThrow('REDIRECT:/')
    })

    it('renders page for valid params', async () => {
      const { fetchTweetData } = await import('@/lib/media/fxembed')
      vi.mocked(fetchTweetData).mockResolvedValue(null)

      const QuickAddPage = (await import('@/app/[username]/status/[id]/page'))
        .default

      // Should not throw for valid params
      const result = await QuickAddPage({
        params: Promise.resolve({ username: 'validuser', id: '123456789' }),
      })

      expect(result).not.toBeNull()
    })
  })
})

describe('Proxy + Route Integration', () => {
  /**
   * These tests verify that the proxy regex and route validation
   * work together correctly for the URL prefix feature.
   *
   * IMPORTANT: Browsers normalize // to / in URL paths!
   * Tests use single-slash format (https:/x.com) that proxy actually receives.
   */

  // Updated pattern to handle browser path normalization (// → /)
  const proxyPattern =
    /^\/(https?:\/?\/?)?(?:www\.)?(x\.com|twitter\.com)\/(\w{1,15})\/status\/(\d+)/i

  it('proxy extracts valid username and ID', () => {
    const testCases = [
      {
        // Browser normalizes https://x.com to https:/x.com
        path: '/https:/x.com/testuser/status/123456789',
        expectedUsername: 'testuser',
        expectedId: '123456789',
      },
      {
        path: '/https:/twitter.com/another_user/status/987654321',
        expectedUsername: 'another_user',
        expectedId: '987654321',
      },
      {
        path: '/x.com/short/status/1',
        expectedUsername: 'short',
        expectedId: '1',
      },
    ]

    for (const { path, expectedUsername, expectedId } of testCases) {
      const match = path.match(proxyPattern)
      expect(match).not.toBeNull()
      expect(match![3]).toBe(expectedUsername)
      expect(match![4]).toBe(expectedId)
    }
  })

  it('proxy rejects invalid Twitter URLs', () => {
    const invalidPaths = [
      '/https:/facebook.com/user/status/123', // wrong domain
      '/https:/x.com/user/posts/123', // wrong path structure
      '/https:/x.com/toolongusername1234/status/123', // username > 15 chars
      '/https:/x.com/user/status/abc', // non-numeric ID
    ]

    for (const path of invalidPaths) {
      const match = path.match(proxyPattern)
      // Should either not match or extract invalid data that route will reject
      if (match) {
        const username = match[3]
        const id = match[4]
        // If proxy matches, the extracted values should be invalid
        const usernameValid = /^\w{1,15}$/.test(username)
        const idValid = /^\d+$/.test(id)
        expect(usernameValid && idValid).toBe(false)
      }
    }
  })

  it('extracts params that pass route validation', () => {
    // Test that proxy-extracted values pass the route's validation
    const routeUsernamePattern = /^\w{1,15}$/
    const routeIdPattern = /^\d+$/

    const validPaths = [
      '/https:/x.com/user123/status/999888777',
      '/twitter.com/_test_/status/1',
      '/http:/x.com/A/status/12345678901234567890',
    ]

    for (const path of validPaths) {
      const match = path.match(proxyPattern)
      expect(match).not.toBeNull()

      const username = match![3]
      const id = match![4]

      expect(routeUsernamePattern.test(username)).toBe(true)
      expect(routeIdPattern.test(id)).toBe(true)
    }
  })
})
