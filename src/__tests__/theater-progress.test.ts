import { describe, it, expect } from 'vitest'
import { progressKindFor } from '@/components/theater/TheaterProgressLine'
import type { TrendingItem } from '@/lib/trending/query'

/**
 * Pure item -> progress-treatment mapping backing the mobile theater's
 * stories-style auto-advance (docs/specs/theater-first.md): a video plays out
 * on its own timeline, a non-video post gets a fixed 10s dwell. YouTube also
 * gets the video treatment — StageYouTube drives real play/pause/ended/mute
 * via the raw postMessage protocol — so the dock/peek-bar transport + audio
 * buttons render for it (they're gated on this kind), even though the shared
 * top progress line never actually fills for it.
 */

function make(
  overrides: Partial<TrendingItem> & { platform: TrendingItem['platform'] },
): TrendingItem {
  return {
    action: 'save',
    bookmarkId: '1',
    author: 'someone',
    url: '/someone/status/1',
    createdAt: '2026-06-08T00:00:00Z',
    ...overrides,
  }
}

describe('progressKindFor', () => {
  it('returns none for a null item', () => {
    expect(progressKindFor(null)).toBe('none')
  })

  it('returns video for youtube (StageYouTube drives real play/pause/ended/mute)', () => {
    expect(progressKindFor(make({ platform: 'youtube' }))).toBe('video')
  })

  it('returns video for tiktok', () => {
    expect(progressKindFor(make({ platform: 'tiktok' }))).toBe('video')
  })

  it('returns video for instagram', () => {
    expect(progressKindFor(make({ platform: 'instagram' }))).toBe('video')
  })

  it('returns video for a twitter item whose contentType is video', () => {
    expect(progressKindFor(make({ platform: 'twitter', contentType: 'video' }))).toBe('video')
  })

  it('returns timed for text, photo, quote, and article content types', () => {
    expect(progressKindFor(make({ platform: 'twitter', contentType: 'text' }))).toBe('timed')
    expect(progressKindFor(make({ platform: 'twitter', contentType: 'photo' }))).toBe('timed')
    expect(progressKindFor(make({ platform: 'twitter', contentType: 'quote' }))).toBe('timed')
    expect(progressKindFor(make({ platform: 'twitter', contentType: 'article' }))).toBe('timed')
  })

  it('returns timed for a twitter item with no contentType set', () => {
    expect(progressKindFor(make({ platform: 'twitter' }))).toBe('timed')
  })
})
