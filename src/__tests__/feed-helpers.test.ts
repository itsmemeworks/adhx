import { describe, it, expect } from 'vitest'
import {
  selectArticleLink,
  buildArticlePreview,
  parseArticleContent,
  BookmarkLink,
} from '@/lib/utils/feed-helpers'

describe('Feed Helpers', () => {
  describe('selectArticleLink', () => {
    it('returns null for empty array', () => {
      expect(selectArticleLink([])).toBeNull()
    })

    it('returns null for undefined/null input', () => {
      expect(selectArticleLink(null as unknown as BookmarkLink[])).toBeNull()
      expect(selectArticleLink(undefined as unknown as BookmarkLink[])).toBeNull()
    })

    it('prioritizes article type with previewTitle over other links', () => {
      const links: BookmarkLink[] = [
        {
          id: 1,
          bookmarkId: '123',
          expandedUrl: 'https://example.com/tweet',
          linkType: 'tweet',
          previewTitle: null,
        },
        {
          id: 2,
          bookmarkId: '123',
          expandedUrl: 'https://x.com/user/article/123',
          linkType: 'article',
          previewTitle: 'My Article Title',
          previewDescription: 'Article description',
        },
      ]

      const result = selectArticleLink(links)
      expect(result).not.toBeNull()
      expect(result?.id).toBe(2)
      expect(result?.previewTitle).toBe('My Article Title')
    })

    it('selects article link even when it comes second in array', () => {
      // This is the real-world bug scenario: empty tweet link first, article link second
      const links: BookmarkLink[] = [
        {
          id: 95,
          bookmarkId: '2009347948816335031',
          expandedUrl: 'http://x.com/i/article/2009344531444191232',
          linkType: 'tweet',
          previewTitle: null,
        },
        {
          id: 96,
          bookmarkId: '2009347948816335031',
          expandedUrl: 'https://x.com/aliniikk/article/2009347948816335031',
          linkType: 'article',
          previewTitle: 'human data will be a $1 trillion/year market',
        },
      ]

      const result = selectArticleLink(links)
      expect(result).not.toBeNull()
      expect(result?.id).toBe(96)
      expect(result?.previewTitle).toBe('human data will be a $1 trillion/year market')
    })

    it('falls back to link with previewTitle if no article type', () => {
      const links: BookmarkLink[] = [
        {
          id: 1,
          bookmarkId: '123',
          expandedUrl: 'https://example.com/empty',
          linkType: 'tweet',
          previewTitle: null,
        },
        {
          id: 2,
          bookmarkId: '123',
          expandedUrl: 'https://medium.com/article',
          linkType: 'external',
          previewTitle: 'External Article',
        },
      ]

      const result = selectArticleLink(links)
      expect(result?.id).toBe(2)
      expect(result?.previewTitle).toBe('External Article')
    })

    it('falls back to link with previewImageUrl if no previewTitle', () => {
      const links: BookmarkLink[] = [
        {
          id: 1,
          bookmarkId: '123',
          expandedUrl: 'https://example.com/empty',
          linkType: 'tweet',
          previewTitle: null,
          previewImageUrl: null,
        },
        {
          id: 2,
          bookmarkId: '123',
          expandedUrl: 'https://example.com/with-image',
          linkType: 'external',
          previewTitle: null,
          previewImageUrl: 'https://example.com/image.jpg',
        },
      ]

      const result = selectArticleLink(links)
      expect(result?.id).toBe(2)
    })

    it('returns null when no links have preview data', () => {
      const links: BookmarkLink[] = [
        {
          id: 1,
          bookmarkId: '123',
          expandedUrl: 'https://example.com/link1',
          linkType: 'tweet',
          previewTitle: null,
        },
        {
          id: 2,
          bookmarkId: '123',
          expandedUrl: 'https://example.com/link2',
          linkType: 'tweet',
          previewTitle: null,
        },
      ]

      expect(selectArticleLink(links)).toBeNull()
    })

    it('prefers article type over external links even if external has preview', () => {
      const links: BookmarkLink[] = [
        {
          id: 1,
          bookmarkId: '123',
          expandedUrl: 'https://external.com',
          linkType: 'external',
          previewTitle: 'External Preview',
        },
        {
          id: 2,
          bookmarkId: '123',
          expandedUrl: 'https://x.com/user/article/123',
          linkType: 'article',
          previewTitle: 'Article Preview',
        },
      ]

      const result = selectArticleLink(links)
      expect(result?.linkType).toBe('article')
      expect(result?.previewTitle).toBe('Article Preview')
    })
  })

  describe('buildArticlePreview', () => {
    it('builds preview object with all fields', () => {
      const link: BookmarkLink = {
        id: 1,
        bookmarkId: '123',
        expandedUrl: 'https://x.com/user/article/123',
        domain: 'x.com',
        linkType: 'article',
        previewTitle: 'Test Article',
        previewDescription: 'Test description',
        previewImageUrl: 'https://example.com/image.jpg',
      }

      const preview = buildArticlePreview(link, true)

      expect(preview).toEqual({
        title: 'Test Article',
        description: 'Test description',
        imageUrl: 'https://example.com/image.jpg',
        url: 'https://x.com/user/article/123',
        domain: 'x.com',
        isXArticle: true,
      })
    })

    it('handles null fields', () => {
      const link: BookmarkLink = {
        id: 1,
        bookmarkId: '123',
        expandedUrl: 'https://example.com',
        previewTitle: null,
        previewDescription: null,
        previewImageUrl: null,
        domain: null,
      }

      const preview = buildArticlePreview(link, false)

      expect(preview.title).toBeNull()
      expect(preview.description).toBeNull()
      expect(preview.imageUrl).toBeNull()
      expect(preview.domain).toBeNull()
      expect(preview.isXArticle).toBe(false)
    })
  })

  describe('parseArticleContent', () => {
    it('parses valid JSON content', () => {
      const content = JSON.stringify({
        blocks: [{ type: 'paragraph', text: 'Hello' }],
        entityMap: {},
      })

      const result = parseArticleContent(content)

      expect(result).toEqual({
        blocks: [{ type: 'paragraph', text: 'Hello' }],
        entityMap: {},
      })
    })

    it('returns null for null input', () => {
      expect(parseArticleContent(null)).toBeNull()
    })

    it('returns null for undefined input', () => {
      expect(parseArticleContent(undefined)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(parseArticleContent('')).toBeNull()
    })

    it('returns null for invalid JSON', () => {
      expect(parseArticleContent('not valid json {')).toBeNull()
    })

    it('returns null for malformed JSON', () => {
      expect(parseArticleContent('{incomplete')).toBeNull()
    })
  })
})
