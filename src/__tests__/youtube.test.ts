import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  extractYouTubeId,
  isValidVideoId,
  youtubeThumbnail,
  youtubeEmbedUrl,
  youtubeShortUrl,
  fetchYouTubeMetadata,
} from '@/lib/media/youtube'

describe('youtube — extractYouTubeId', () => {
  it('pulls the id from every URL form', () => {
    expect(extractYouTubeId('https://youtube.com/shorts/Y9aytLYBajw')).toBe('Y9aytLYBajw')
    expect(extractYouTubeId('https://www.youtube.com/shorts/Y9aytLYBajw?si=Ns240PHC8T7l5ZZC')).toBe(
      'Y9aytLYBajw',
    )
    expect(extractYouTubeId('https://m.youtube.com/shorts/Y9aytLYBajw')).toBe('Y9aytLYBajw')
    expect(extractYouTubeId('https://youtu.be/Y9aytLYBajw')).toBe('Y9aytLYBajw')
    expect(extractYouTubeId('https://www.youtube.com/watch?v=Y9aytLYBajw&t=10s')).toBe(
      'Y9aytLYBajw',
    )
    expect(extractYouTubeId('https://www.youtube.com/embed/Y9aytLYBajw')).toBe('Y9aytLYBajw')
    expect(extractYouTubeId('youtube.com/shorts/Y9aytLYBajw')).toBe('Y9aytLYBajw') // no protocol
  })

  it('accepts a bare 11-char id', () => {
    expect(extractYouTubeId('Y9aytLYBajw')).toBe('Y9aytLYBajw')
  })

  it('returns null for non-YouTube or malformed input', () => {
    expect(extractYouTubeId('https://www.tiktok.com/@u/video/123')).toBeNull()
    expect(extractYouTubeId('https://youtube.com/watch?v=tooShort')).toBeNull()
    expect(extractYouTubeId('https://youtube.com/feed/subscriptions')).toBeNull()
    expect(extractYouTubeId('not a url')).toBeNull()
    expect(extractYouTubeId('')).toBeNull()
  })
})

describe('youtube — id validation + url builders', () => {
  it('validates the 11-char id shape', () => {
    expect(isValidVideoId('Y9aytLYBajw')).toBe(true)
    expect(isValidVideoId('ab-_12345CD')).toBe(true)
    expect(isValidVideoId('short')).toBe(false)
    expect(isValidVideoId('waytoolongid12')).toBe(false)
    expect(isValidVideoId('has spaces!')).toBe(false)
  })

  it('builds thumbnail/embed/short urls', () => {
    expect(youtubeThumbnail('Y9aytLYBajw')).toBe('https://i.ytimg.com/vi/Y9aytLYBajw/hqdefault.jpg')
    expect(youtubeEmbedUrl('Y9aytLYBajw')).toBe(
      'https://www.youtube-nocookie.com/embed/Y9aytLYBajw',
    )
    expect(youtubeShortUrl('Y9aytLYBajw')).toBe('https://www.youtube.com/shorts/Y9aytLYBajw')
  })
})

describe('youtube — fetchYouTubeMetadata (oEmbed)', () => {
  const mockFetch = vi.fn()
  beforeEach(() => {
    mockFetch.mockReset()
    global.fetch = mockFetch as unknown as typeof fetch
  })

  it('maps oEmbed JSON + parses the channel handle from author_url', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'June 5, 2026',
        author_name: 'BassForge',
        author_url: 'https://www.youtube.com/@BassForge_us',
      }),
    })
    const meta = await fetchYouTubeMetadata('Y9aytLYBajw')
    expect(meta).toEqual({
      videoId: 'Y9aytLYBajw',
      title: 'June 5, 2026',
      authorName: 'BassForge',
      author: '@BassForge_us',
      thumbnailUrl: 'https://i.ytimg.com/vi/Y9aytLYBajw/hqdefault.jpg',
    })
    // Queries oEmbed via the watch form for a stable hqdefault thumbnail.
    expect(mockFetch.mock.calls[0][0]).toContain('youtube.com/oembed')
    expect(mockFetch.mock.calls[0][0]).toContain('watch%3Fv%3DY9aytLYBajw')
  })

  it('returns null for an invalid id without hitting the network', async () => {
    const meta = await fetchYouTubeMetadata('bad')
    expect(meta).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null when oEmbed 404s (private/removed video)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    expect(await fetchYouTubeMetadata('Y9aytLYBajw')).toBeNull()
  })

  it('returns null (never throws) when the network fails', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))
    expect(await fetchYouTubeMetadata('Y9aytLYBajw')).toBeNull()
  })
})
