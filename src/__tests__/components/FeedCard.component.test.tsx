/**
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
          onExpand={mockOnExpand}
          onMarkRead={mockOnMarkRead}
        />
      )

      // Text cards have min-h-[150px] and noise texture
      expect(container.querySelector('.min-h-\\[150px\\]')).toBeTruthy()
    })

    it('4-images: renders MediaContent with multi-image badge', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['4-images'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          onExpand={mockOnExpand}
          onMarkRead={mockOnMarkRead}
        />
      )

      // Multi-image cards show "1/N" badge
      const badge = container.querySelector('.bg-black\\/70')
      expect(badge?.textContent).toContain('1/')
    })

    it('video-tweet: renders MediaContent with play button', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['video-tweet'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
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
          onExpand={mockOnExpand}
          onMarkRead={mockOnMarkRead}
        />
      )

      // Article cards have min-h-[200px]
      expect(container.querySelector('.min-h-\\[200px\\]')).toBeTruthy()
    })

    it('quote-of-text-tweet: renders QuoteCardContent', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['quote-of-text-tweet'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
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
    it('unread: shows green check button', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])
      feedItem.isRead = false

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          onExpand={mockOnExpand}
          onMarkRead={mockOnMarkRead}
        />
      )

      // Unread items have green background
      const button = container.querySelector('button[title="Mark as read"]')
      expect(button?.className).toContain('bg-green-500')
    })

    it('read: shows gray eye-off button', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])
      feedItem.isRead = true

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          onExpand={mockOnExpand}
          onMarkRead={mockOnMarkRead}
        />
      )

      // Read items have gray background
      const button = container.querySelector('button[title="Mark as unread"]')
      expect(button?.className).toContain('bg-gray-600')
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
          onExpand={mockOnExpand}
          onMarkRead={mockOnMarkRead}
        />
      )

      // New items have shadow glow effect
      const card = container.querySelector('.group')
      expect(card?.className).toContain('shadow-')
    })
  })

  describe('X Article background styling', () => {
    it('article-no-header: uses dark gradient background (not blue)', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['article-no-header'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          onExpand={mockOnExpand}
          onMarkRead={mockOnMarkRead}
        />
      )

      // Should use dark gray gradient (from-gray-900), not the old blue gradient
      const backgroundDiv = container.querySelector('.from-gray-900')
      expect(backgroundDiv).toBeTruthy()

      // Should NOT use the old blue gradient
      const oldBlueGradient = container.querySelector('.from-blue-600')
      expect(oldBlueGradient).toBeNull()
    })

    it('article-no-header: has noise texture overlay', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['article-no-header'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          onExpand={mockOnExpand}
          onMarkRead={mockOnMarkRead}
        />
      )

      // Should have mix-blend-overlay for noise texture
      const noiseOverlay = container.querySelector('.mix-blend-overlay')
      expect(noiseOverlay).toBeTruthy()
    })

    it('article-no-header: has blue glow accent', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['article-no-header'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
          onExpand={mockOnExpand}
          onMarkRead={mockOnMarkRead}
        />
      )

      // Should have blue glow accent (bg-blue-500/20)
      const glowAccent = container.querySelector('.bg-blue-500\\/20')
      expect(glowAccent).toBeTruthy()
    })

    it('article-no-header: does NOT show FileText icon (old design)', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['article-no-header'])

      const { container } = render(
        <FeedCard
          item={feedItem}
          lastSyncAt={null}
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
