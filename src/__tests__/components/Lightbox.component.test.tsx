/**
 * Lightbox Component Snapshot Tests
 *
 * Tests the Lightbox component rendering with real tweet fixtures.
 * Uses snapshot testing to detect accidental markup changes.
 *
 * Lightbox renders differently based on content type:
 * - MediaLightboxContent: photos, videos (2-panel layout)
 * - TextLightboxContent: text, quotes, articles (single panel)
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Lightbox } from '@/components/feed/Lightbox'
import { fixtures, fixtureMetadata, type FixtureSlug } from '../fixtures/tweets'
import { fxTwitterToFeedItem } from '../fixtures/tweets/helpers'

// Mock handlers
const mockOnClose = vi.fn()
const mockOnPrev = vi.fn()
const mockOnNext = vi.fn()
const mockOnMarkRead = vi.fn()
const mockOnTagAdd = vi.fn().mockResolvedValue(undefined)
const mockOnTagRemove = vi.fn().mockResolvedValue(undefined)

const defaultProps = {
  index: 0,
  total: 14,
  onClose: mockOnClose,
  onPrev: mockOnPrev,
  onNext: mockOnNext,
  onMarkRead: mockOnMarkRead,
  markingRead: false,
  onTagAdd: mockOnTagAdd,
  onTagRemove: mockOnTagRemove,
  availableTags: [
    { tag: 'test', count: 5 },
    { tag: 'fixture', count: 3 },
  ],
}

describe('Lightbox Component Snapshots', () => {
  describe('Renders all fixture types correctly', () => {
    it.each(fixtureMetadata)('$slug: renders correctly', ({ slug }) => {
      const fixture = fixtures[slug as FixtureSlug]
      const feedItem = fxTwitterToFeedItem(fixture)

      const { container } = render(
        <Lightbox
          item={feedItem}
          {...defaultProps}
        />
      )

      // Snapshot the rendered markup
      expect(container.firstChild).toMatchSnapshot()
    })
  })

  describe('Layout routing', () => {
    it('video-tweet: uses MediaLightboxContent (2-panel layout)', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['video-tweet'])

      const { container } = render(
        <Lightbox
          item={feedItem}
          {...defaultProps}
        />
      )

      // Media lightbox has flex-row layout on large screens
      expect(container.querySelector('.lg\\:flex-row')).toBeTruthy()
      // Should have video element
      expect(container.querySelector('video')).toBeTruthy()
    })

    it('4-images: renders multi-image gallery', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['4-images'])

      const { container } = render(
        <Lightbox
          item={feedItem}
          {...defaultProps}
        />
      )

      // Multi-image lightbox has scroll container
      expect(container.querySelector('.overflow-y-auto')).toBeTruthy()
      // Should have multiple img elements
      const images = container.querySelectorAll('img')
      expect(images.length).toBeGreaterThan(1)
    })

    it('plain-text: uses TextLightboxContent (single panel)', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])

      const { container } = render(
        <Lightbox
          item={feedItem}
          {...defaultProps}
        />
      )

      // Text lightbox has max-w-2xl single panel
      expect(container.querySelector('.max-w-2xl')).toBeTruthy()
    })

    it('article-with-media: shows ArticleContent', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['article-with-media'])

      const { container } = render(
        <Lightbox
          item={feedItem}
          {...defaultProps}
        />
      )

      // Article content shows title in h2
      expect(container.querySelector('h2')).toBeTruthy()
    })

    it('quote-of-text-tweet: shows TextQuoteContent', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['quote-of-text-tweet'])

      const { container } = render(
        <Lightbox
          item={feedItem}
          {...defaultProps}
        />
      )

      // Quote content shows quoted author
      expect(container.textContent).toContain('@')
    })
  })

  describe('Navigation elements', () => {
    it('shows counter with correct index/total', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])

      const { container } = render(
        <Lightbox
          item={feedItem}
          index={5}
          total={14}
          onClose={mockOnClose}
          onPrev={mockOnPrev}
          onNext={mockOnNext}
          onMarkRead={mockOnMarkRead}
          markingRead={false}
          onTagAdd={mockOnTagAdd}
          onTagRemove={mockOnTagRemove}
          availableTags={[]}
        />
      )

      // Counter shows "6 / 14" (1-indexed)
      expect(container.textContent).toContain('6 / 14')
    })

    it('shows keyboard hints on desktop', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])

      const { container } = render(
        <Lightbox
          item={feedItem}
          {...defaultProps}
        />
      )

      // Keyboard hints include navigation keys
      expect(container.textContent).toContain('Esc close')
    })
  })

  describe('Author header', () => {
    it('displays author name and handle', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])

      const { container } = render(
        <Lightbox
          item={feedItem}
          {...defaultProps}
        />
      )

      // Should show @author handle
      expect(container.textContent).toContain(`@${feedItem.author}`)
    })

    it('shows external link to tweet', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])

      const { container } = render(
        <Lightbox
          item={feedItem}
          {...defaultProps}
        />
      )

      // Should have link to original tweet
      const link = container.querySelector(`a[href="${feedItem.tweetUrl}"]`)
      expect(link).toBeTruthy()
    })
  })

  describe('Read status', () => {
    it('unread: shows green check button', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])
      feedItem.isRead = false

      const { container } = render(
        <Lightbox
          item={feedItem}
          {...defaultProps}
        />
      )

      const button = container.querySelector('button[title="Mark as read"]')
      expect(button?.className).toContain('bg-green-500')
    })

    it('read: shows gray eye-off button', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])
      feedItem.isRead = true

      const { container } = render(
        <Lightbox
          item={feedItem}
          {...defaultProps}
        />
      )

      const button = container.querySelector('button[title="Mark as unread"]')
      expect(button?.className).toContain('bg-gray-200')
    })
  })

  describe('Tag input', () => {
    it('renders tag input area', () => {
      const feedItem = fxTwitterToFeedItem(fixtures['plain-text'])
      feedItem.tags = ['existing-tag']

      const { container } = render(
        <Lightbox
          item={feedItem}
          {...defaultProps}
        />
      )

      // Should show existing tag
      expect(container.textContent).toContain('existing-tag')
    })
  })
})
