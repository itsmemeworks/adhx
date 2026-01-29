/**
 * TweetPreviewLanding Component Snapshot Tests
 *
 * Tests the share page preview component with real tweet fixtures.
 * Uses snapshot testing to detect accidental markup changes.
 *
 * TweetPreviewLanding shows:
 * - Tweet content preview (text, media, articles, quotes)
 * - Author information
 * - Engagement stats
 * - CTA buttons for saving
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { TweetPreviewLanding } from '@/components/TweetPreviewLanding'
import { fixtures, fixtureMetadata, type FixtureSlug } from '../fixtures/tweets'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// Mock formatRelativeTime to return stable output for snapshot tests
// (actual time would change as fixtures age, causing snapshot failures)
vi.mock('@/lib/utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/format')>()
  return {
    ...actual,
    formatRelativeTime: () => 'Jan 15, 2026',
  }
})

describe('TweetPreviewLanding Component Snapshots', () => {
  describe('Renders all fixture types correctly (unauthenticated)', () => {
    it.each(fixtureMetadata)('$slug: renders correctly', ({ slug, author, tweetId }) => {
      const fixture = fixtures[slug as FixtureSlug]

      const { container } = render(
        <TweetPreviewLanding
          username={author}
          tweetId={tweetId}
          tweet={fixture.tweet!}
          isAuthenticated={false}
        />
      )

      // Snapshot the rendered markup
      expect(container.firstChild).toMatchSnapshot()
    })
  })

  describe('Renders all fixture types correctly (authenticated)', () => {
    it.each(fixtureMetadata)('$slug: renders with authenticated CTA', ({ slug, author, tweetId }) => {
      const fixture = fixtures[slug as FixtureSlug]

      const { container } = render(
        <TweetPreviewLanding
          username={author}
          tweetId={tweetId}
          tweet={fixture.tweet!}
          isAuthenticated={true}
        />
      )

      // Snapshot the rendered markup
      expect(container.firstChild).toMatchSnapshot()
    })
  })

  describe('Content type rendering', () => {
    it('plain-text: shows tweet text without media', () => {
      const fixture = fixtures['plain-text']

      const { container } = render(
        <TweetPreviewLanding
          username="TheCinesthetic"
          tweetId="2010184900599583070"
          tweet={fixture.tweet!}
        />
      )

      // Should show the tweet text
      expect(container.textContent).toContain(fixture.tweet!.text)
      // Should not have any img elements for media (only author avatar and logo)
      const images = container.querySelectorAll('img')
      expect(images.length).toBeLessThanOrEqual(2) // avatar + logo
    })

    it('video-tweet: shows video thumbnail with play button', () => {
      const fixture = fixtures['video-tweet']

      const { container } = render(
        <TweetPreviewLanding
          username="Kekius_Sage"
          tweetId="2011872260118716688"
          tweet={fixture.tweet!}
        />
      )

      // Should have play button
      const playButton = container.querySelector('button')
      expect(playButton).toBeTruthy()
    })

    it('4-images: shows media grid', () => {
      const fixture = fixtures['4-images']

      const { container } = render(
        <TweetPreviewLanding
          username="iamgdsa"
          tweetId="2010782484728873387"
          tweet={fixture.tweet!}
        />
      )

      // Should have multiple images in grid
      const images = container.querySelectorAll('img')
      expect(images.length).toBeGreaterThan(2)
    })

    it('article-with-media: shows article content', () => {
      const fixture = fixtures['article-with-media']

      const { container } = render(
        <TweetPreviewLanding
          username="NoahRyanCo"
          tweetId="2008957369212866843"
          tweet={fixture.tweet!}
        />
      )

      // Should show article title
      expect(container.textContent).toContain(fixture.tweet!.article!.title)
      // Should show X Article badge
      expect(container.textContent).toContain('X Article')
    })

    it('quote-of-text-tweet: shows quoted tweet', () => {
      const fixture = fixtures['quote-of-text-tweet']

      const { container } = render(
        <TweetPreviewLanding
          username="elonmusk"
          tweetId="2012040892719169884"
          tweet={fixture.tweet!}
        />
      )

      // Should show quoted author
      expect(container.textContent).toContain(fixture.tweet!.quote!.author?.screen_name)
    })

    it('youtube-link: shows external link preview', () => {
      const fixture = fixtures['youtube-link']

      const { container } = render(
        <TweetPreviewLanding
          username="skalskip92"
          tweetId="1996677567642996772"
          tweet={fixture.tweet!}
        />
      )

      // Should show external link title or domain
      if (fixture.tweet!.external?.title) {
        expect(container.textContent).toContain(fixture.tweet!.external.title)
      } else if (fixture.tweet!.external?.display_url) {
        expect(container.textContent).toContain(fixture.tweet!.external.display_url)
      }
    })
  })

  describe('Author information', () => {
    it('displays author avatar', () => {
      const fixture = fixtures['plain-text']

      const { container } = render(
        <TweetPreviewLanding
          username="TheCinesthetic"
          tweetId="2010184900599583070"
          tweet={fixture.tweet!}
        />
      )

      // Should have author avatar
      const avatar = container.querySelector(`img[alt="${fixture.tweet!.author.name}"]`)
      expect(avatar).toBeTruthy()
    })

    it('displays author name and handle', () => {
      const fixture = fixtures['plain-text']

      const { container } = render(
        <TweetPreviewLanding
          username="TheCinesthetic"
          tweetId="2010184900599583070"
          tweet={fixture.tweet!}
        />
      )

      expect(container.textContent).toContain(fixture.tweet!.author.name)
      expect(container.textContent).toContain(`@${fixture.tweet!.author.screen_name}`)
    })
  })

  describe('Engagement stats', () => {
    it('displays reply, retweet, like counts', () => {
      const fixture = fixtures['plain-text']

      const { container } = render(
        <TweetPreviewLanding
          username="TheCinesthetic"
          tweetId="2010184900599583070"
          tweet={fixture.tweet!}
        />
      )

      // Stats section exists (may be formatted with K/M suffixes)
      const statsSection = container.querySelector('.border-t')
      expect(statsSection).toBeTruthy()
    })
  })

  describe('CTA buttons', () => {
    it('unauthenticated: shows "Save this tweet" button', () => {
      const fixture = fixtures['plain-text']

      const { container } = render(
        <TweetPreviewLanding
          username="TheCinesthetic"
          tweetId="2010184900599583070"
          tweet={fixture.tweet!}
          isAuthenticated={false}
        />
      )

      expect(container.textContent).toContain('Save this tweet')
    })

    it('authenticated: shows "Add to Collection" button', () => {
      const fixture = fixtures['plain-text']

      const { container } = render(
        <TweetPreviewLanding
          username="TheCinesthetic"
          tweetId="2010184900599583070"
          tweet={fixture.tweet!}
          isAuthenticated={true}
        />
      )

      expect(container.textContent).toContain('Add to Collection')
    })

    it('authenticated: shows "Continue to Gallery" button', () => {
      const fixture = fixtures['plain-text']

      const { container } = render(
        <TweetPreviewLanding
          username="TheCinesthetic"
          tweetId="2010184900599583070"
          tweet={fixture.tweet!}
          isAuthenticated={true}
        />
      )

      expect(container.textContent).toContain('Continue to Gallery')
    })
  })

  describe('URL trick callout', () => {
    it('shows preview input and URL trick hint', () => {
      const fixture = fixtures['plain-text']

      const { container } = render(
        <TweetPreviewLanding
          username="TheCinesthetic"
          tweetId="2010184900599583070"
          tweet={fixture.tweet!}
        />
      )

      expect(container.textContent).toContain('Preview another tweet')
      expect(container.textContent).toContain('adh')
      // Check for input placeholder
      expect(container.querySelector('input[placeholder*="Paste"]')).toBeTruthy()
    })
  })
})
