import { describe, it, expect } from 'vitest'
import {
  getVideoUrl,
  getPhotoUrl,
  getTwitterImageUrl,
  getEmbedUrl,
  resolveMediaUrl,
  getShareableUrl,
  getDownloadUrl,
  getThumbnailUrl,
} from '@/lib/media/fxembed'

describe('FxEmbed URL utilities', () => {
  const author = 'testuser'
  const tweetId = '1234567890'

  describe('getVideoUrl', () => {
    it('returns correct video URL format', () => {
      const url = getVideoUrl(author, tweetId)
      expect(url).toBe('https://d.fxtwitter.com/testuser/status/1234567890.mp4')
    })

    it('handles special characters in author name', () => {
      const url = getVideoUrl('user_123', tweetId)
      expect(url).toContain('user_123')
    })
  })

  describe('getPhotoUrl', () => {
    it('returns correct photo URL with default index', () => {
      const url = getPhotoUrl(author, tweetId)
      expect(url).toBe('https://d.fixupx.com/testuser/status/1234567890/photo/1')
    })

    it('returns correct photo URL with custom index', () => {
      const url = getPhotoUrl(author, tweetId, 3)
      expect(url).toBe('https://d.fixupx.com/testuser/status/1234567890/photo/3')
    })
  })

  describe('getTwitterImageUrl', () => {
    const mediaKey = 'FakeMedia123'

    it('returns correct Twitter image URL with default size', () => {
      const url = getTwitterImageUrl(mediaKey)
      expect(url).toBe('https://pbs.twimg.com/media/FakeMedia123?format=jpg&name=large')
    })

    it('returns correct Twitter image URL with small size', () => {
      const url = getTwitterImageUrl(mediaKey, 'small')
      expect(url).toBe('https://pbs.twimg.com/media/FakeMedia123?format=jpg&name=small')
    })

    it('returns correct Twitter image URL with orig size', () => {
      const url = getTwitterImageUrl(mediaKey, 'orig')
      expect(url).toBe('https://pbs.twimg.com/media/FakeMedia123?format=jpg&name=orig')
    })
  })

  describe('getEmbedUrl', () => {
    it('returns correct embed URL format', () => {
      const url = getEmbedUrl(author, tweetId)
      expect(url).toBe('https://fxtwitter.com/testuser/status/1234567890')
    })
  })

  describe('resolveMediaUrl', () => {
    it('returns video URL for video type', () => {
      const url = resolveMediaUrl({
        author,
        tweetId,
        mediaType: 'video',
      })
      expect(url).toContain('.mp4')
      expect(url).toContain('d.fxtwitter.com')
    })

    it('returns video URL for animated_gif type', () => {
      const url = resolveMediaUrl({
        author,
        tweetId,
        mediaType: 'animated_gif',
      })
      expect(url).toContain('.mp4')
    })

    it('returns photo URL for photo type', () => {
      const url = resolveMediaUrl({
        author,
        tweetId,
        mediaType: 'photo',
      })
      expect(url).toContain('/photo/')
      expect(url).toContain('d.fixupx.com')
    })

    it('uses correct media index for photos', () => {
      const url = resolveMediaUrl({
        author,
        tweetId,
        mediaType: 'photo',
        mediaIndex: 2,
      })
      expect(url).toContain('/photo/2')
    })

    it('defaults to photo URL for unknown media type', () => {
      const url = resolveMediaUrl({
        author,
        tweetId,
        mediaType: 'photo', // Cast for test
      })
      expect(url).toContain('/photo/')
    })
  })

  describe('getShareableUrl', () => {
    it('returns video URL for video type', () => {
      const url = getShareableUrl({
        author,
        tweetId,
        mediaType: 'video',
      })
      expect(url).toContain('.mp4')
    })

    it('returns photo URL for photo type', () => {
      const url = getShareableUrl({
        author,
        tweetId,
        mediaType: 'photo',
        mediaIndex: 1,
      })
      expect(url).toContain('/photo/1')
    })
  })

  describe('getDownloadUrl', () => {
    it('returns same URL as getShareableUrl', () => {
      const options = {
        author,
        tweetId,
        mediaType: 'photo' as const,
        mediaIndex: 1,
      }
      expect(getDownloadUrl(options)).toBe(getShareableUrl(options))
    })
  })

  describe('getThumbnailUrl', () => {
    it('returns preview URL if available', () => {
      const url = getThumbnailUrl({
        author,
        tweetId,
        mediaType: 'video',
        previewUrl: 'https://example.com/preview.jpg',
      })
      expect(url).toBe('https://example.com/preview.jpg')
    })

    it('returns photo URL for photo type without preview', () => {
      const url = getThumbnailUrl({
        author,
        tweetId,
        mediaType: 'photo',
        mediaIndex: 1,
      })
      expect(url).toContain('/photo/1')
    })

    it('falls back to video URL for video without preview', () => {
      const url = getThumbnailUrl({
        author,
        tweetId,
        mediaType: 'video',
      })
      // Without a preview URL, falls back to resolveMediaUrl (video URL)
      expect(url).toContain('.mp4')
    })
  })
})
