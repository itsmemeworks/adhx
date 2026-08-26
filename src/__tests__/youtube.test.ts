import { describe, it, expect, beforeEach, vi } from 'vitest'

const cacheHarness = vi.hoisted(() => {
  const entries = new Map<string, string>()
  return {
    clear: () => entries.clear(),
    unstableCache:
      <A extends unknown[], R>(
        fn: (...args: A) => Promise<R>,
        keyParts: string[] = [],
      ): ((...args: A) => Promise<R>) =>
      async (...args: A): Promise<R> => {
        const key = JSON.stringify([keyParts, args])
        const cached = entries.get(key)
        if (cached !== undefined) return JSON.parse(cached) as R
        const value = await fn(...args)
        entries.set(key, JSON.stringify(value))
        return value
      },
  }
})

vi.mock('next/cache', () => ({
  unstable_cache: cacheHarness.unstableCache,
}))

import {
  extractYouTubeId,
  isValidVideoId,
  youtubeThumbnail,
  youtubeEmbedUrl,
  youtubeShortUrl,
  fetchYouTubeMetadata,
  fetchYouTubeMetadataStatus,
} from '@/lib/media/youtube'

describe('youtube — extractYouTubeId', () => {
  it('pulls the id from a Shorts URL (www/m, no protocol, tracking param, trailing slash)', () => {
    expect(extractYouTubeId('https://youtube.com/shorts/Y9aytLYBajw')).toBe('Y9aytLYBajw')
    expect(extractYouTubeId('https://www.youtube.com/shorts/Y9aytLYBajw?si=Ns240PHC8T7l5ZZC')).toBe(
      'Y9aytLYBajw',
    )
    expect(extractYouTubeId('https://m.youtube.com/shorts/Y9aytLYBajw')).toBe('Y9aytLYBajw')
    expect(extractYouTubeId('youtube.com/shorts/Y9aytLYBajw')).toBe('Y9aytLYBajw')
    expect(extractYouTubeId('https://www.youtube.com/shorts/Y9aytLYBajw/')).toBe('Y9aytLYBajw')
  })

  it('rejects watch, youtu.be, embed, live, and bare ids — those are regular videos', () => {
    expect(extractYouTubeId('https://youtu.be/Y9aytLYBajw')).toBeNull()
    expect(extractYouTubeId('https://www.youtube.com/watch?v=Y9aytLYBajw&t=10s')).toBeNull()
    expect(extractYouTubeId('https://www.youtube.com/embed/Y9aytLYBajw')).toBeNull()
    expect(extractYouTubeId('https://www.youtube.com/live/Y9aytLYBajw')).toBeNull()
    expect(extractYouTubeId('https://www.youtube-nocookie.com/embed/Y9aytLYBajw')).toBeNull()
    expect(extractYouTubeId('Y9aytLYBajw')).toBeNull()
  })

  it('returns null for non-YouTube or malformed input', () => {
    expect(extractYouTubeId('https://www.tiktok.com/@u/video/123')).toBeNull()
    expect(extractYouTubeId('https://youtube.com/shorts/tooShort')).toBeNull()
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
    cacheHarness.clear()
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

  it.each([400, 404, 410])('classifies and caches a confirmed %i miss', async (status) => {
    mockFetch.mockResolvedValue({ ok: false, status, json: async () => ({}) })

    await expect(fetchYouTubeMetadataStatus('Y9aytLYBajw')).resolves.toEqual({
      kind: 'permanent-miss',
    })
    await expect(fetchYouTubeMetadataStatus('Y9aytLYBajw')).resolves.toEqual({
      kind: 'permanent-miss',
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it.each([429, 500, 503])(
    'keeps HTTP %i transient and refetches instead of negative-caching it',
    async (status) => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status, json: async () => ({}) })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ title: 'Recovered' }),
        })

      await expect(fetchYouTubeMetadataStatus('Y9aytLYBajw')).resolves.toEqual({
        kind: 'transient-failure',
      })
      await expect(fetchYouTubeMetadataStatus('Y9aytLYBajw')).resolves.toMatchObject({
        kind: 'resolved',
        metadata: { title: 'Recovered' },
      })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    },
  )

  it('keeps timeouts transient and refetches successfully', async () => {
    mockFetch
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ title: 'Recovered' }),
      })

    await expect(fetchYouTubeMetadataStatus('Y9aytLYBajw')).resolves.toEqual({
      kind: 'transient-failure',
    })
    await expect(fetchYouTubeMetadataStatus('Y9aytLYBajw')).resolves.toMatchObject({
      kind: 'resolved',
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('returns null (never throws) when the network fails', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))
    expect(await fetchYouTubeMetadata('Y9aytLYBajw')).toBeNull()
  })
})
