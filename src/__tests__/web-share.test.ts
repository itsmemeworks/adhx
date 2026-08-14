/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  shareCaption,
  shareFileWithLink,
  canonicalShareUrl,
  fileFromMediaUrl,
  prefetchShareFile,
  resetShareFileCache,
  sharePageLink,
} from '@/lib/share/web-share'

describe('shareCaption', () => {
  it('prefixes the preview URL so messengers keep it when files are present', () => {
    expect(shareCaption('https://adhx.com/reels/abc')).toBe('via https://adhx.com/reels/abc')
  })

  it('returns undefined when there is no page URL', () => {
    expect(shareCaption()).toBeUndefined()
    expect(shareCaption('')).toBeUndefined()
  })
})

describe('canonicalShareUrl', () => {
  it('strips query and hash so the caption is a clean preview path', () => {
    expect(canonicalShareUrl('https://adhx.fly.dev/reels/abc?utm=1#x')).toBe(
      'https://adhx.fly.dev/reels/abc',
    )
  })
})

describe('shareFileWithLink', () => {
  const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' })
  let originalShare: typeof navigator.share | undefined
  let originalCanShare: typeof navigator.canShare | undefined

  beforeEach(() => {
    originalShare = navigator.share
    originalCanShare = navigator.canShare
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: originalCanShare, configurable: true })
  })

  it('sends files + via-text and never a second url field', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })

    await shareFileWithLink(file, {
      pageUrl: 'https://adhx.com/reels/abc?ref=1',
    })

    expect(share).toHaveBeenCalledOnce()
    expect(share).toHaveBeenCalledWith({
      files: [file],
      text: 'via https://adhx.com/reels/abc',
    })
    expect(share.mock.calls[0][0]).not.toHaveProperty('url')
  })

  it('falls back to files only when files + text throws', async () => {
    const share = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('text + files not supported'))
      .mockResolvedValueOnce(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })

    await shareFileWithLink(file, { pageUrl: 'https://adhx.com/reels/abc' })

    expect(share).toHaveBeenNthCalledWith(2, { files: [file] })
  })

  it('re-throws AbortError so callers treat dismiss as success', async () => {
    const abort = new Error('dismissed')
    abort.name = 'AbortError'
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(abort),
      configurable: true,
    })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })

    await expect(shareFileWithLink(file, { pageUrl: 'https://adhx.com/x' })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})

describe('sharePageLink', () => {
  it('shares the canonical url once with no caption duplicate', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })

    await sharePageLink({
      title: 'Reel',
      href: 'https://adhx.fly.dev/reels/abc?x=1',
    })

    expect(share).toHaveBeenCalledWith({
      url: 'https://adhx.fly.dev/reels/abc',
      title: 'Reel',
    })
  })
})

describe('fileFromMediaUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetShareFileCache()
  })

  it('rejects JSON error bodies so we never share a fake mp4', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        blob: () => Promise.resolve(new Blob(['{"error":"nope"}'], { type: 'application/json' })),
      }),
    )
    await expect(fileFromMediaUrl('/api/media/x', 'x.mp4')).rejects.toThrow('unavailable')
  })

  it('caches in-flight prefetches by url', async () => {
    const blob = new Blob(['video-bytes-video-bytes'], { type: 'video/mp4' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'video/mp4' },
      blob: () => Promise.resolve(blob),
    })
    vi.stubGlobal('fetch', fetchMock)

    const [a, b] = await Promise.all([
      prefetchShareFile('/api/media/instagram/video?id=1', 'ig.mp4'),
      prefetchShareFile('/api/media/instagram/video?id=1', 'ig.mp4'),
    ])
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(a).toBe(b)
  })
})
