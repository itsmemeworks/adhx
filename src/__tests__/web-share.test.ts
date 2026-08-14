/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shareCaption, shareFileWithLink } from '@/lib/share/web-share'

describe('shareCaption', () => {
  it('prefixes the preview URL so messengers keep it when files are present', () => {
    expect(shareCaption('https://adhx.com/reels/abc')).toBe('via https://adhx.com/reels/abc')
  })

  it('returns undefined when there is no page URL', () => {
    expect(shareCaption()).toBeUndefined()
    expect(shareCaption('')).toBeUndefined()
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

  it('attaches the preview URL as text (and url) when the browser allows it', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })

    await shareFileWithLink(file, {
      title: 'Reel',
      pageUrl: 'https://adhx.com/reels/abc',
    })

    expect(share).toHaveBeenCalledWith({
      files: [file],
      title: 'Reel',
      text: 'via https://adhx.com/reels/abc',
      url: 'https://adhx.com/reels/abc',
    })
  })

  it('falls back to files + text when files + url throws', async () => {
    const share = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('url + files not supported'))
      .mockResolvedValueOnce(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })

    await shareFileWithLink(file, { pageUrl: 'https://adhx.com/reels/abc' })

    expect(share).toHaveBeenNthCalledWith(2, {
      files: [file],
      title: undefined,
      text: 'via https://adhx.com/reels/abc',
    })
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
