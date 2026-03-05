/**
 * @vitest-environment jsdom
 */

/**
 * TweetPreviewLanding Regression Tests
 *
 * Tests for bugs found in production:
 * 1. Expand/share button layout: ml-auto on both buttons causes expand icon
 *    to float in the center instead of adjacent to the share button
 * 2. RSC serialization crash: tweet prop must be a plain object to avoid
 *    infinite recursion in React Flight serializer when Sentry instruments fetch
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

// Mock formatRelativeTime for stable output
vi.mock('@/lib/utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/format')>()
  return {
    ...actual,
    formatRelativeTime: () => 'Jan 15, 2026',
  }
})

/**
 * Helper: get the tweet card footer element
 */
function getFooter(container: HTMLElement) {
  return container.querySelector('article[data-content="tweet"] footer')
}

describe('Regression: Expand/Share button layout', () => {
  // ═══════════════════════════════════════════════════════════════════
  // BUG: When both expand and share buttons have ml-auto, flexbox
  // distributes space between them, pushing the expand icon to the
  // center of the footer instead of grouping it next to the share icon.
  //
  // FIX: Share button only gets ml-auto when expand button is NOT shown.
  // When expand IS shown, it takes ml-auto and share follows naturally.
  // ═══════════════════════════════════════════════════════════════════

  it('share button has ml-auto when no expand button (media tweet)', () => {
    const fixture = fixtures['video-tweet']

    const { container } = render(
      <TweetPreviewLanding
        username="Kekius_Sage"
        tweetId="2011872260118716688"
        tweet={fixture.tweet!}
      />
    )

    const footer = getFooter(container)
    expect(footer).toBeTruthy()

    // Media tweets never show expand button
    const expandButton = footer!.querySelector('button[title="Collapse tweet"],button[title="Expand tweet"]')
    expect(expandButton).toBeNull()

    const shareButton = footer!.querySelector('button[aria-label="Share this preview"]')
    expect(shareButton).toBeTruthy()
    expect(shareButton!.className).toContain('ml-auto')
  })

  it('share button has ml-auto when no expand button (4-image tweet)', () => {
    const fixture = fixtures['4-images']

    const { container } = render(
      <TweetPreviewLanding
        username="iamgdsa"
        tweetId="2010782484728873387"
        tweet={fixture.tweet!}
      />
    )

    const footer = getFooter(container)
    const expandButton = footer!.querySelector('button[title="Collapse tweet"],button[title="Expand tweet"]')
    expect(expandButton).toBeNull()

    const shareButton = footer!.querySelector('button[aria-label="Share this preview"]')
    expect(shareButton!.className).toContain('ml-auto')
  })

  it('share button does NOT have ml-auto when expand button is visible', () => {
    // Text-only tweets default to expanded, showing the collapse button
    const fixture = fixtures['long-text-with-quote']

    const { container } = render(
      <TweetPreviewLanding
        username="_The_Prophet__"
        tweetId="2011834234642841806"
        tweet={fixture.tweet!}
      />
    )

    const footer = getFooter(container)
    expect(footer).toBeTruthy()

    const expandButton = footer!.querySelector('button[title="Collapse tweet"],button[title="Expand tweet"]')
    const shareButton = footer!.querySelector('button[aria-label="Share this preview"]')
    expect(shareButton).toBeTruthy()

    // When expand button is visible, share must NOT have ml-auto
    if (expandButton) {
      expect(shareButton!.className).not.toContain('ml-auto')
    }
  })

  it('at most one footer button has ml-auto (prevents split-center layout)', () => {
    // Key invariant: only one element pushes right with ml-auto
    const fixture = fixtures['plain-text']

    const { container } = render(
      <TweetPreviewLanding
        username="TheCinesthetic"
        tweetId="2010184900599583070"
        tweet={fixture.tweet!}
      />
    )

    const footer = getFooter(container)
    expect(footer).toBeTruthy()

    const buttons = Array.from(footer!.querySelectorAll('button'))
    const buttonsWithMlAuto = buttons.filter((btn) => btn.className.includes('ml-auto'))
    expect(buttonsWithMlAuto.length).toBeLessThanOrEqual(1)
  })

  it('share button is always the last child in footer', () => {
    const fixture = fixtures['plain-text']

    const { container } = render(
      <TweetPreviewLanding
        username="TheCinesthetic"
        tweetId="2010184900599583070"
        tweet={fixture.tweet!}
      />
    )

    const footer = getFooter(container)
    const shareButton = footer!.querySelector('button[aria-label="Share this preview"]')
    expect(shareButton).toBeTruthy()

    const allChildren = Array.from(footer!.children)
    const shareIndex = allChildren.indexOf(shareButton as Element)
    expect(shareIndex).toBe(allChildren.length - 1)
  })

  it.each(
    fixtureMetadata.filter(f =>
      ['video-tweet', '4-images', 'quote-of-image-tweet'].includes(f.slug)
    )
  )('media fixture $slug: share has ml-auto (no expand button)', ({ slug, author, tweetId }) => {
    const fixture = fixtures[slug as FixtureSlug]

    const { container } = render(
      <TweetPreviewLanding username={author} tweetId={tweetId} tweet={fixture.tweet!} />
    )

    const footer = getFooter(container)
    const shareButton = footer!.querySelector('button[aria-label="Share this preview"]')
    expect(shareButton!.className).toContain('ml-auto')
  })

  // ═══════════════════════════════════════════════════════════════════
  // BUG: When collapsed (via localStorage), the article's scrollHeight
  // is capped by max-h, so the check `scrollHeight > 400` passes even
  // when the content div inside is scrolling. The expand button vanishes
  // and users have no way to expand the internally-scrolling content.
  //
  // FIX: Also check contentRef.scrollHeight > contentRef.clientHeight
  // to detect actual content overflow inside the flex layout.
  // ═══════════════════════════════════════════════════════════════════

  it('text-only tweets have a scrollable content div inside the article', () => {
    // Structural requirement: the content div must exist for overflow detection
    const fixture = fixtures['long-text-with-quote']

    const { container } = render(
      <TweetPreviewLanding
        username="_The_Prophet__"
        tweetId="2011834234642841806"
        tweet={fixture.tweet!}
      />
    )

    const article = container.querySelector('article[data-content="tweet"]')
    expect(article).toBeTruthy()

    // Content div is the flex-1 child that handles scroll overflow
    const contentDiv = article!.querySelector('.min-h-0.overflow-x-hidden')
    expect(contentDiv).toBeTruthy()
  })

  it('media tweets do NOT have content overflow div with overflow-y-auto', () => {
    const fixture = fixtures['video-tweet']

    const { container } = render(
      <TweetPreviewLanding
        username="Kekius_Sage"
        tweetId="2011872260118716688"
        tweet={fixture.tweet!}
      />
    )

    const article = container.querySelector('article[data-content="tweet"]')
    // Media tweets should not have overflow-y-auto on the content div
    const scrollableContent = article!.querySelector('.overflow-y-auto')
    expect(scrollableContent).toBeNull()
  })
})

describe('Regression: RSC serialization safety (JSON-cloned tweet)', () => {
  // ═══════════════════════════════════════════════════════════════════
  // BUG: Sentry SDK's @sentry/node wraps fetch responses with Proxy
  // for tracing. When Next.js Turbopack serializes Proxy-wrapped objects
  // across the RSC boundary (server → client), the createNS namespace
  // wrappers recurse infinitely via Object.apply, causing:
  //   "RangeError: Maximum call stack size exceeded"
  //
  // FIX: Deep-clone tweet with JSON.parse(JSON.stringify()) before
  // passing to client component. Verify component works with cloned data.
  // ═══════════════════════════════════════════════════════════════════

  it.each(fixtureMetadata)(
    '$slug: renders correctly with JSON-cloned tweet data',
    ({ slug, author, tweetId }) => {
      const fixture = fixtures[slug as FixtureSlug]
      // Simulate the deep clone from page.tsx
      const clonedTweet = JSON.parse(JSON.stringify(fixture.tweet!))

      const { container } = render(
        <TweetPreviewLanding username={author} tweetId={tweetId} tweet={clonedTweet} />
      )

      // Should render without crashing
      expect(container.firstChild).toBeTruthy()
      // Author should be visible
      expect(container.textContent).toContain(fixture.tweet!.author.name)
    }
  )

  it('JSON clone strips non-serializable properties', () => {
    const fixture = fixtures['plain-text']
    const tweet = { ...fixture.tweet! }

    // Add non-serializable properties that a Proxy might introduce
    Object.defineProperty(tweet, '__sentry_wrapped__', {
      value: true,
      enumerable: false,
    })

    // JSON clone strips the non-enumerable property
    const cloned = JSON.parse(JSON.stringify(tweet))
    expect(cloned).not.toHaveProperty('__sentry_wrapped__')

    // But the component still renders correctly
    const { container } = render(
      <TweetPreviewLanding
        username="TheCinesthetic"
        tweetId="2010184900599583070"
        tweet={cloned}
      />
    )

    expect(container.textContent).toContain(fixture.tweet!.text)
  })

  it('JSON clone produces a distinct object (not same reference)', () => {
    const fixture = fixtures['plain-text']
    const original = fixture.tweet!
    const cloned = JSON.parse(JSON.stringify(original))

    // Not the same reference
    expect(cloned).not.toBe(original)
    // But same content
    expect(cloned.id).toBe(original.id)
    expect(cloned.text).toBe(original.text)
    expect(cloned.author.name).toBe(original.author.name)
  })
})
