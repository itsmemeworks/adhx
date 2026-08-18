import React from 'react'
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
  getCurrentUserId: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/lib/media/fxembed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/media/fxembed')>()
  return {
    ...actual,
    fetchTweetData: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}))

vi.mock('@/lib/sentry', () => ({
  metrics: {
    shareTweetPreviewViewed: vi.fn(),
    theaterOpened: vi.fn(),
  },
}))

vi.mock('@/lib/utils/og-fetch', () => ({
  fetchOgMetadata: vi.fn().mockResolvedValue(null),
}))

// Mock React components
vi.mock('@/components/QuickAddLanding', () => ({
  QuickAddLanding: () => null,
}))

// The page now renders the theater instead of TweetPreviewLanding (Phase 3,
// docs/specs/theater-first.md §3) — mock its replacements instead.
vi.mock('@/components/theater/SharedPostStatic', () => ({
  SharedPostStatic: () => null,
}))

vi.mock('@/components/theater/TheaterShell', () => ({
  TheaterShell: () => null,
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
      const { generateMetadata } = await import('@/app/[username]/status/[id]/page')

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'invalid-user', id: '123' }),
      })

      expect(metadata.title).toBe('ADHX - Save now. Read never. Find always.')
      expect(metadata.description).toBe('For people who bookmark everything and read nothing.')
    })

    it('returns fallback metadata for invalid tweet ID', async () => {
      const { generateMetadata } = await import('@/app/[username]/status/[id]/page')

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'validuser', id: 'not-numeric' }),
      })

      expect(metadata.title).toBe('ADHX - Save now. Read never. Find always.')
    })

    it('returns user-specific fallback when FxTwitter fails', async () => {
      const { fetchTweetData } = await import('@/lib/media/fxembed')
      vi.mocked(fetchTweetData).mockResolvedValue(null)

      const { generateMetadata } = await import('@/app/[username]/status/[id]/page')

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'testuser', id: '123456789' }),
      })

      expect(metadata.title).toBe("Preview @testuser's tweet")
      expect(metadata.description).toBe('Preview this tweet on ADHX')
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

      const { generateMetadata } = await import('@/app/[username]/status/[id]/page')

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'testauthor', id: '123456789' }),
      })

      expect(metadata.title).toContain('@testauthor')
      expect(metadata.title).toContain('This is a test tweet')
      // The title already shows this whole (short, media-less, no-engagement)
      // post, so the SERP description doesn't restate it — repeating the
      // headline is what made the snippet read like a scraper mirror. With no
      // content left to continue and no facts worth listing, the closer stands
      // alone. Longer posts get "…<continuation> · <facts> · <closer>".
      expect(metadata.description).toBe('Read the full post — no X account needed.')
      expect(metadata.description).not.toContain('This is a test tweet')
      // The OG title now matches the content-first page <title> — the old
      // "Preview @user's tweet" utility framing was dropped for CTR.
      expect(metadata.openGraph?.title).toBe(
        'This is a test tweet with some interesting content — @testauthor',
      )
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

      const { generateMetadata } = await import('@/app/[username]/status/[id]/page')

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: 'user', id: '123' }),
      })

      // Description should be truncated to 500 chars (expanded for richer social unfurls)
      expect(metadata.description!.length).toBeLessThanOrEqual(500)
    })
  })

  describe('Page rendering', () => {
    it('redirects to home for invalid username', async () => {
      const QuickAddPage = (await import('@/app/[username]/status/[id]/page')).default

      await expect(
        QuickAddPage({
          params: Promise.resolve({ username: 'invalid-user-name', id: '123' }),
        }),
      ).rejects.toThrow('REDIRECT:/')
    })

    it('redirects to home for invalid tweet ID', async () => {
      const QuickAddPage = (await import('@/app/[username]/status/[id]/page')).default

      await expect(
        QuickAddPage({
          params: Promise.resolve({ username: 'validuser', id: 'abc123' }),
        }),
      ).rejects.toThrow('REDIRECT:/')
    })

    it('renders page for valid params', async () => {
      const { fetchTweetData } = await import('@/lib/media/fxembed')
      vi.mocked(fetchTweetData).mockResolvedValue(null)

      const QuickAddPage = (await import('@/app/[username]/status/[id]/page')).default

      // Should not throw for valid params
      const result = await QuickAddPage({
        params: Promise.resolve({ username: 'validuser', id: '123456789' }),
      })

      expect(result).not.toBeNull()
    })

    // Regression coverage carried over from the pre-theater version of this
    // page: that version passed the raw FxTwitter tweet object straight into
    // a client component (`TweetPreviewLanding`), which crashed on RSC
    // serialization because Sentry wraps fetch responses in a Proxy that
    // recurses infinitely when Turbopack tries to serialize it — fixed there
    // with a JSON.parse(JSON.stringify()) deep clone. The theater (Phase 3,
    // docs/specs/theater-first.md §3) sidesteps the whole class of bug: the
    // page never forwards the raw tweet object to a client component at all —
    // `tweetToTheaterItem()` extracts plain primitive fields into a brand new
    // `TheaterItem`, which is what actually crosses the boundary.
    it('passes a plain derived TheaterItem to TheaterShell, never the raw tweet reference', async () => {
      const { fetchTweetData } = await import('@/lib/media/fxembed')

      const originalTweet = {
        id: '999888777',
        url: 'https://x.com/testuser/status/999888777',
        text: 'Test tweet for serialization safety',
        author: {
          id: '42',
          name: 'Test User',
          screen_name: 'testuser',
          avatar_url: 'https://example.com/avatar.jpg',
        },
        created_at: '2024-01-01T00:00:00Z',
        replies: 10,
        retweets: 5,
        likes: 100,
        views: 1000,
      }

      vi.mocked(fetchTweetData).mockResolvedValue({
        code: 200,
        message: 'OK',
        tweet: originalTweet,
      })

      const QuickAddPage = (await import('@/app/[username]/status/[id]/page')).default

      const result = await QuickAddPage({
        params: Promise.resolve({ username: 'testuser', id: '999888777' }),
      })

      // Walk the React element tree to find TheaterShell's sharedItem prop
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fragment = result as React.ReactElement<any>
      const children = React.Children.toArray(fragment.props.children)
      const shellElement = children.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (child): child is React.ReactElement<any> =>
          React.isValidElement(child) && (child.type as { name?: string })?.name === 'TheaterShell',
      )

      expect(shellElement).toBeTruthy()
      const sharedItem = shellElement!.props.sharedItem

      // Never the raw tweet object (nor its nested author object) — a plain
      // derived shape built field-by-field in tweetToTheaterItem().
      expect(sharedItem).not.toBe(originalTweet)
      expect(sharedItem.text).toBe(originalTweet.text)
      expect(sharedItem.author).toBe(originalTweet.author.screen_name)
      expect(sharedItem.authorName).toBe(originalTweet.author.name)
      expect(sharedItem.authorAvatarUrl).toBe(originalTweet.author.avatar_url)
      expect(sharedItem.createdAt).toBe(originalTweet.created_at)
      expect(sharedItem.platform).toBe('twitter')
      expect(sharedItem.bookmarkId).toBe('999888777')
    })

    it('OG-facet enrichment does not break the shared theater item', async () => {
      const { fetchTweetData } = await import('@/lib/media/fxembed')
      const { fetchOgMetadata } = await import('@/lib/utils/og-fetch')

      const tweetWithFacets = {
        id: '111222333',
        url: 'https://x.com/testuser/status/111222333',
        text: 'Check this out https://t.co/abc123',
        raw_text: {
          text: 'Check this out https://t.co/abc123',
          facets: [
            {
              type: 'url',
              indices: [15, 38] as [number, number],
              original: 'https://t.co/abc123',
              replacement: 'https://example.com/article',
              display: 'example.com/article',
            },
          ],
        },
        author: {
          id: '42',
          name: 'Test User',
          screen_name: 'testuser',
          avatar_url: 'https://example.com/avatar.jpg',
        },
        created_at: '2024-01-01T00:00:00Z',
        replies: 0,
        retweets: 0,
        likes: 0,
        views: 0,
      }

      vi.mocked(fetchTweetData).mockResolvedValue({
        code: 200,
        message: 'OK',
        tweet: tweetWithFacets,
      })

      vi.mocked(fetchOgMetadata).mockResolvedValue({
        title: 'Example Article',
        description: 'An example article',
        image: 'https://example.com/og.jpg',
      })

      const QuickAddPage = (await import('@/app/[username]/status/[id]/page')).default

      const result = await QuickAddPage({
        params: Promise.resolve({ username: 'testuser', id: '111222333' }),
      })

      // Walk the React element tree to find TheaterShell's sharedItem prop.
      // The facet enrichment mutates `tweet.external` in place before this
      // point (see getTweetData's caller) — this just confirms that mutation
      // never breaks the (unrelated) mapping into a TheaterItem downstream.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fragment = result as React.ReactElement<any>
      const children = React.Children.toArray(fragment.props.children)
      const shellElement = children.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (child): child is React.ReactElement<any> =>
          React.isValidElement(child) && (child.type as { name?: string })?.name === 'TheaterShell',
      )

      expect(shellElement).toBeTruthy()
      const sharedItem = shellElement!.props.sharedItem
      expect(sharedItem).not.toBe(tweetWithFacets)
      expect(sharedItem.text).toBe(tweetWithFacets.text)
      expect(sharedItem.bookmarkId).toBe('111222333')
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
