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

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { FeedCard } from '@/components/feed/FeedCard'
import { fixtures, fixtureMetadata, type FixtureSlug } from '../fixtures/tweets'
import { fxTwitterToFeedItem } from '../fixtures/tweets/helpers'

// Mock handlers
const mockOnExpand = vi.fn()
const mockOnMarkRead = vi.fn()

describe('FeedCard Component Snapshots', () => {
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
          onMarkRead={mockOnMarkRead}
        />
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
          onMarkRead={mockOnMarkRead}
        />
      )

      // Text cards render the tweet text and a "Text" type badge.
      expect(container.textContent).toContain('Text')
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
          onMarkRead={mockOnMarkRead}
        />
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
          onMarkRead={mockOnMarkRead}
        />
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
          onMarkRead={mockOnMarkRead}
        />
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
          onMarkRead={mockOnMarkRead}
        />
      )

      // Quote cards have a quote indicator
      const text = container.textContent
      expect(text).toContain('Quote')
    })
  })

  describe('Read status styling', () => {
    it('unread: shows clay check button', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])
      feedItem.isRead = false

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
          onMarkRead={mockOnMarkRead}
        />
      )

      // Unread items show a clay-colored "mark as read" button
      const button = container.querySelector('button[title="Mark as read"]')
      expect(button?.className).toContain('bg-clay')
    })

    it('read: shows translucent eye-off button', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])
      feedItem.isRead = true

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
          onMarkRead={mockOnMarkRead}
        />
      )

      // Read items show a translucent black "mark as unread" button
      const button = container.querySelector('button[title="Mark as unread"]')
      expect(button?.className).toContain('bg-black/50')
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
          onMarkRead={mockOnMarkRead}
        />
      )

      // New items have shadow glow effect
      const card = container.querySelector('.group')
      expect(card?.className).toContain('shadow-')
    })
  })

  describe('X Article styling (Matter redesign)', () => {
    it('article-no-header: uses a dark image band (not the old blue gradient)', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['article-no-header'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          sortField="processedAt"
          onExpand={mockOnExpand}
          onMarkRead={mockOnMarkRead}
        />
      )

      // New design: dark band on a bg-black header, body on bg-surface.
      const band = container.querySelector('.bg-black')
      expect(band).toBeTruthy()

      // Should NOT use the old blue gradient
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
          onMarkRead={mockOnMarkRead}
        />
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
          onMarkRead={mockOnMarkRead}
        />
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
          onMarkRead={mockOnMarkRead}
        />
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
