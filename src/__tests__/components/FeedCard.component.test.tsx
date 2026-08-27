/**
 * @vitest-environment jsdom
 *
 * FeedCard Component Snapshot Tests
 *
 * Tests the FeedCard component rendering with real tweet fixtures.
 * Uses snapshot testing to detect accidental markup changes.
 *
 * FeedCard renders differently based on content type:
 * - MediaContent: photos, videos
 * - ArticleCardContent: X articles, external articles
 * - QuoteCardContent: quote tweets without media
 * - TextCardContent: plain text tweets
 */

import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FeedCard } from '@/components/feed/FeedCard'
import { fixtures, fixtureMetadata, type FixtureSlug } from '../fixtures/tweets'
import { fxTwitterToFeedItem } from '../fixtures/tweets/helpers'

// Mock handlers
const mockOnExpand = vi.fn()

function keyboardActivate(button: HTMLElement, key: 'Enter' | ' '): void {
  button.focus()
  fireEvent.keyDown(button, { key })
  fireEvent.keyUp(button, { key })
  // jsdom does not synthesize a native button click from keyboard events.
  // This click represents the browser's one native activation after the key.
  fireEvent.click(button, { detail: 0 })
}

describe('FeedCard Component Snapshots', () => {
  beforeEach(() => {
    mockOnExpand.mockClear()
  })

  describe('Renders all fixture types correctly', () => {
    it.each(fixtureMetadata)('$slug: renders correctly', ({ slug }) => {
      const fixture = fixtures[slug as FixtureSlug]
      const feedItem = fxTwitterToFeedItem(fixture)

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
        />,
      )

      // Snapshot the rendered markup
      expect(container.firstChild).toMatchSnapshot()
    })
  })

  describe('Content type routing', () => {
    it('plain-text: renders TextCardContent', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
        />,
      )

      // Text cards are tweet-style: the author handle + the post body.
      expect(container.textContent).toContain(`@${feedItem.author}`)
      expect(container.textContent).toContain(feedItem.text.slice(0, 20))
    })

    it('4-images: renders MediaContent with multi-image badge', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['4-images'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
        />,
      )

      // Multi-image cards show a "1/N" count badge
      expect(container.textContent).toContain('1/')
    })

    it('video-tweet: renders MediaContent with play button', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['video-tweet'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
        />,
      )

      // Video cards show play icon overlay
      expect(container.querySelector('svg')).toBeTruthy()
    })

    it('article-with-media: renders ArticleCardContent', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['article-with-media'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
        />,
      )

      // Article cards render the article body on a surface with a serif title
      // and an "Article" type badge.
      expect(container.textContent).toContain('Article')
      expect(container.querySelector('.font-serif')).toBeTruthy()
    })

    it('quote-of-text-tweet: renders QuoteCardContent', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['quote-of-text-tweet'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
        />,
      )

      // Quote cards are tweet-style with the embedded quoted post beneath.
      const text = container.textContent
      expect(text).toContain(`@${feedItem.author}`)
      if (feedItem.quoteContext?.author) {
        expect(text).toContain(`@${feedItem.quoteContext.author}`)
      }
    })
  })

  describe('No hover overlay', () => {
    it('renders no action overlay on the card — copy/share/read live in the collection theater', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
        />,
      )

      // The gallery hover overlay was removed — opening a card in the collection theater is the
      // only interaction. No copy/share/mark-read buttons on the card itself.
      expect(container.querySelector('button[title="Copy link to this post"]')).toBeNull()
      expect(container.querySelector('button[title="Mark as read"]')).toBeNull()
      expect(container.querySelector('button[title="Mark as unread"]')).toBeNull()
    })
  })

  describe('Keyboard and link accessibility', () => {
    it('exposes one native primary button in the tab order and activates once per Enter or Space', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])
      const onExpand = vi.fn()
      render(
        <FeedCard item={feedItem} lastSyncAt={null} sortField="processedAt" onExpand={onExpand} />,
      )

      const primaryAction = screen.getByRole('button', {
        name: new RegExp(`open text by`, 'i'),
      })
      expect(primaryAction).toBeInstanceOf(HTMLButtonElement)
      expect(primaryAction).toHaveAttribute('type', 'button')
      expect(primaryAction).toHaveProperty('tabIndex', 0)

      keyboardActivate(primaryAction, 'Enter')
      expect(onExpand).toHaveBeenCalledTimes(1)

      onExpand.mockClear()
      keyboardActivate(primaryAction, ' ')
      expect(onExpand).toHaveBeenCalledTimes(1)
    })

    it('uses aria-pressed and toggles selection instead of opening from the keyboard', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])
      const onExpand = vi.fn()
      const onToggleSelect = vi.fn()
      const { rerender } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={onExpand}
          selectionMode
          selected={false}
          selectionName="research"
          onToggleSelect={onToggleSelect}
        />,
      )

      const addAction = screen.getByRole('button', {
        name: /add text by .* to #research/i,
      })
      expect(addAction).toHaveAttribute('aria-pressed', 'false')
      keyboardActivate(addAction, 'Enter')
      expect(onToggleSelect).toHaveBeenCalledTimes(1)
      expect(onExpand).not.toHaveBeenCalled()

      onToggleSelect.mockClear()
      keyboardActivate(addAction, ' ')
      expect(onToggleSelect).toHaveBeenCalledTimes(1)
      expect(onExpand).not.toHaveBeenCalled()

      rerender(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={onExpand}
          selectionMode
          selected
          selectionName="research"
          onToggleSelect={onToggleSelect}
        />,
      )
      expect(
        screen.getByRole('button', { name: /remove text by .* from #research/i }),
      ).toHaveAttribute('aria-pressed', 'true')
    })

    it('keeps inline links independently focusable without nesting or card activation', () => {
      const feedItem = {
        ...fxTwitterToFeedItem(fixtures['plain-text']),
        text: 'Read https://example.com/accessibility',
      }
      const onExpand = vi.fn()
      const { container } = render(
        <FeedCard item={feedItem} lastSyncAt={null} sortField="processedAt" onExpand={onExpand} />,
      )

      const primaryAction = screen.getByRole('button', { name: /open text by/i })
      const inlineLink = screen.getByRole('link', { name: 'https://example.com/accessibility' })
      expect(primaryAction.querySelector('a')).toBeNull()
      expect(container.querySelector('button a, a button')).toBeNull()

      inlineLink.focus()
      expect(inlineLink).toHaveFocus()
      fireEvent.click(inlineLink)
      expect(onExpand).not.toHaveBeenCalled()

      keyboardActivate(primaryAction, 'Enter')
      expect(onExpand).toHaveBeenCalledTimes(1)
    })

    it('adds a normalized, bounded content excerpt that distinguishes repeated-author posts', () => {
      const baseItem = fxTwitterToFeedItem(fixtures['plain-text'])
      const firstItem = {
        ...baseItem,
        id: 'first-accessible-name',
        text: `First   distinct\npost ${'with useful detail '.repeat(8)}`,
      }
      const secondItem = {
        ...baseItem,
        id: 'second-accessible-name',
        text: 'Second distinct post',
      }
      render(
        <>
          <FeedCard item={firstItem} lastSyncAt={null} sortField="processedAt" onExpand={vi.fn()} />
          <FeedCard
            item={secondItem}
            lastSyncAt={null}
            sortField="processedAt"
            onExpand={vi.fn()}
          />
        </>,
      )

      const primaryActions = screen.getAllByRole('button', { name: /open text by/i })
      const firstName = primaryActions[0].getAttribute('aria-label') || ''
      const secondName = primaryActions[1].getAttribute('aria-label') || ''
      const firstExcerpt = firstName.split(': ')[1]

      expect(firstName).toContain('First distinct post with useful detail')
      expect(firstName).not.toMatch(/\s{2,}|\n/)
      expect(firstExcerpt.length).toBeLessThanOrEqual(72)
      expect(firstExcerpt).toMatch(/…$/)
      expect(secondName).toContain('Second distinct post')
      expect(firstName).not.toBe(secondName)
    })
  })

  describe('New item glow', () => {
    it('new items: has amber glow when synced after lastSyncAt', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])
      const oldSyncTime = new Date(Date.now() - 1000).toISOString()
      feedItem.processedAt = new Date().toISOString()

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={oldSyncTime}
          sortField="processedAt"
          onExpand={mockOnExpand}
        />,
      )

      // New items have shadow glow effect
      const card = container.querySelector('.group')
      expect(card?.className).toContain('shadow-')
    })
  })

  describe('X Article styling (Matter redesign)', () => {
    it('article-no-header: renders a serif title (not the old blue gradient)', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['article-no-header'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
        />,
      )

      // New design: a serif article title (over a cover image, or on an accent
      // gradient fallback) — never the old blue gradient.
      expect(container.querySelector('.font-serif')).toBeTruthy()
      expect(container.querySelector('.from-blue-600')).toBeNull()
    })

    it('article-no-header: shows the Article type badge', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['article-no-header'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
        />,
      )

      // New unified TypeBadge renders the "Article" label.
      expect(container.textContent).toContain('Article')

      // Old design's noise/blue-glow decorations are gone.
      expect(container.querySelector('.mix-blend-overlay')).toBeNull()
      expect(container.querySelector('.bg-blue-500\\/20')).toBeNull()
    })

    it('article-no-header: does NOT show FileText icon (old design)', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['article-no-header'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
        />,
      )

      // The old design had a w-24 h-24 FileText icon centered
      // New design should not have this large centered icon
      const largeIcon = container.querySelector('.w-24.h-24')
      expect(largeIcon).toBeNull()
    })

    it('article-with-media: uses image background (not gradient)', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['article-with-media'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
        />,
      )

      // Articles with images should have an img element for the background
      const img = container.querySelector('img')
      expect(img).toBeTruthy()

      // Should NOT use the dark gradient fallback
      const darkGradient = container.querySelector('.from-gray-900.via-gray-800')
      expect(darkGradient).toBeNull()
    })
  })
})
