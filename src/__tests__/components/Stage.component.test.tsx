/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
vi.mock('@/lib/theater/share-tweet', () => ({
  fetchShareTweet: vi.fn().mockResolvedValue(null),
}))
import { Stage } from '@/components/theater/Stage'
import type { TheaterItem } from '@/components/theater/types'

/** A plain twitter text tweet — no thumbnail, no contentType — resolves to
 * `inferType() === 'text'`, so `Stage` renders `StageText` (no network
 * fetch, unlike `StageArticle`, keeping this test simple). */
function textItem(): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '999',
    author: 'someone-else',
    url: '/someone-else/status/999',
    text: 'just a plain tweet',
    createdAt: '2026-08-20T00:01:00Z',
  } as TheaterItem
}

/**
 * Owner report: "sometimes I'm watching with volume and it goes from a video
 * to an image or a text post, and then back to a video. It's actually muted
 * for me again."
 *
 * iOS grants unmuted playback to the ELEMENT the viewer gestured on, and
 * StageVideo's whole design is to never remount its <video> so that grant
 * survives item changes. But a text/photo/article item used to unmount
 * StageVideo entirely (a gap its own doc comment called out), so the next
 * video got a brand-new element and lost the grant. Stage now keeps the last
 * video mounted, paused and covered, underneath a non-video item.
 */
describe('Stage: the granted <video> element survives a non-video item', () => {
  // jsdom implements neither play() nor load(); StageVideo calls both on mount.
  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    HTMLMediaElement.prototype.load = vi.fn()
    HTMLMediaElement.prototype.pause = vi.fn()
  })

  /** A twitter item with media, so `usePlaybackSource` resolves a video src. */
  function videoItem(id: string): TheaterItem {
    return {
      action: 'save',
      platform: 'twitter',
      bookmarkId: id,
      author: 'someone',
      url: `/someone/status/${id}`,
      text: 'a video tweet',
      contentType: 'video',
      thumbnailUrl: 'https://example.com/poster.jpg',
      createdAt: '2026-08-20T00:00:00Z',
    } as TheaterItem
  }

  it('keeps the same element across video → text → video', () => {
    const props = { muted: true, onRequestUnmute: vi.fn() }
    const { container, rerender } = render(<Stage item={videoItem('1')} {...props} />)

    const first = container.querySelector('video')
    expect(first).not.toBeNull()

    // A text item in between: the element must still be there (covered), not
    // unmounted — that's what preserves the grant.
    rerender(<Stage item={textItem()} {...props} />)
    const whileCovered = container.querySelector('video')
    expect(whileCovered).toBe(first)
    expect(container.querySelector('[aria-hidden="true"] video')).toBe(first)

    // Back to a video: same element again, so the grant (and any unmute the
    // viewer had granted it) carries through.
    rerender(<Stage item={videoItem('2')} {...props} />)
    expect(container.querySelector('video')).toBe(first)
  })

  it('keeps the same video element when the album clip changes', () => {
    const item = {
      ...videoItem('1'),
      videoCount: 2,
      videoPosters: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    }
    const { container, getByRole } = render(<Stage item={item} muted onRequestUnmute={vi.fn()} />)
    const first = container.querySelector('video')
    fireEvent.click(getByRole('button', { name: 'Next video, 1 of 2' }))
    expect(container.querySelector('video')).toBe(first)
  })

  it('keeps the same video element when Read opens on a video album', () => {
    const item = {
      ...videoItem('1'),
      videoCount: 2,
      videoPosters: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    }
    const props = { muted: true, onRequestUnmute: vi.fn() }
    const { container, rerender } = render(<Stage item={item} {...props} />)
    const first = container.querySelector('video')
    rerender(<Stage item={item} {...props} articleMode />)
    expect(container.querySelector('video')).toBe(first)
  })

  it('renders no retained video before any video has played', () => {
    const { container } = render(<Stage item={textItem()} muted onRequestUnmute={vi.fn()} />)
    expect(container.querySelector('video')).toBeNull()
  })

  it('renders a video+quote item as the full-bleed player by default', () => {
    const item = {
      ...videoItem('2091399015971864972'),
      author: 'XRoboHub',
      text: 'parent essay',
      quote: {
        author: 'XRoboHub',
        text: 'quoted clip',
        bookmarkId: '2091018327875518851',
        hasVideo: true,
      },
    } as TheaterItem
    const { container } = render(<Stage item={item} muted onRequestUnmute={vi.fn()} />)
    expect(container.querySelector('video')).toBeTruthy()
    expect(container.querySelector('[data-testid="parent-inline-video"]')).toBeNull()
    expect(container.querySelector('[data-testid="quote-inline-video"]')).toBeNull()
    expect(container.querySelector('[data-testid="article-video-fade"]')).toBeNull()
  })

  it('keeps the parent video playing in article mode and shows the quote below', () => {
    const item = {
      ...videoItem('2091399015971864972'),
      author: 'XRoboHub',
      text: 'parent essay',
      quote: {
        author: 'XRoboHub',
        text: 'quoted clip',
        bookmarkId: '2091018327875518851',
        hasVideo: true,
      },
    } as TheaterItem
    const { container } = render(<Stage item={item} muted onRequestUnmute={vi.fn()} articleMode />)
    expect(container.querySelector('video')).toBeTruthy()
    expect(container.querySelector('[data-testid="parent-inline-video"]')).toBeNull()
    expect(container.querySelector('[data-testid="quote-inline-video"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="article-video-fade"]')).toBeTruthy()
    expect(container.firstElementChild?.className).toContain('isolate')
    expect(container.textContent).toContain('parent essay')
    expect(container.textContent).toContain('quoted clip')
  })

  it('opens a photo as the typeset reader in article mode', () => {
    const item = {
      ...textItem(),
      contentType: 'photo' as const,
      text: 'a long photo caption',
      thumbnailUrl: 'https://example.com/p.jpg',
    } as TheaterItem
    const { container } = render(<Stage item={item} muted onRequestUnmute={vi.fn()} articleMode />)
    expect(container.textContent).toContain('a long photo caption')
    expect(container.querySelector('img[alt=""]')).toBeTruthy()
  })

  it('stacks every photo in Read, not just the first', () => {
    const item = {
      ...textItem(),
      author: 'StreetFashion01',
      bookmarkId: '2091475617438957808',
      contentType: 'photo' as const,
      text: 'the loafers',
      thumbnailUrl: 'https://pbs.twimg.com/one.jpg',
      photoCount: 3,
    } as TheaterItem
    const { container } = render(<Stage item={item} muted onRequestUnmute={vi.fn()} articleMode />)
    const srcs = [...container.querySelectorAll('img')].map((el) => el.getAttribute('src') ?? '')
    for (const n of [1, 2, 3]) {
      expect(srcs).toContain(
        `/api/files/twitter/2091475617438957808/photo-${n}?a=StreetFashion01&v=2`,
      )
    }
    expect(container.querySelector('[aria-label="Photos, 3"]')).toBeNull()
  })

  it('keeps video-album snap chrome in Read', () => {
    const item = {
      ...videoItem('2091920006829199772'),
      videoCount: 2,
      videoPosters: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    } as TheaterItem
    const { container } = render(<Stage item={item} muted onRequestUnmute={vi.fn()} articleMode />)
    expect(container.querySelector('[aria-label="Videos, 2"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="article-video-fade"]')).toBeTruthy()
    const dots = container.querySelector('[aria-label="Next video, 1 of 2"]')
    expect(dots).toBeTruthy()
    expect(dots?.parentElement?.style.bottom).toBe('12px')
    expect(dots?.parentElement?.className).not.toContain('4.25rem')
  })
})
