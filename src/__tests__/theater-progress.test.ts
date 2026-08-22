import { describe, it, expect } from 'vitest'
import {
  progressKindFor,
  progressKindForPin,
  collectionTabProgressKind,
} from '@/components/theater/TheaterProgressLine'
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

/**
 * shared-post-repeat: while the shared post is pinned (isSharedPostPinned in
 * TheaterShell.tsx), a 'timed' item (photo/text/quote/article) must never
 * auto-advance the visitor out from under it — so its progress kind is
 * demoted to 'none', which stops both the ticking line and the
 * `theater-advance` dispatch that would otherwise fire when it fills.
 * 'video' items are untouched: their auto-advance is already blocked at the
 * player level (StageVideo's `loop` attribute / StageYouTube's seek-to-0
 * replay), so their progress line keeps behaving normally.
 */
describe('progressKindForPin', () => {
  it('demotes timed to none while pinned', () => {
    expect(progressKindForPin('timed', true)).toBe('none')
  })

  it('leaves timed alone when not pinned', () => {
    expect(progressKindForPin('timed', false)).toBe('timed')
  })

  it('never touches video, pinned or not', () => {
    expect(progressKindForPin('video', true)).toBe('video')
    expect(progressKindForPin('video', false)).toBe('video')
  })

  it('never touches none, pinned or not', () => {
    expect(progressKindForPin('none', true)).toBe('none')
    expect(progressKindForPin('none', false)).toBe('none')
  })
})

/**
 * "My Collection is just a different playlist in that same theater" (owner
 * directive, 2026-08-21): the personal theater's Collection tab used to force every kind
 * to 'none'. Now only 'timed' items (photo/text/quote/article) — which still
 * wait on a deliberate Done/Later/Delete, never a 10s dwell auto-advance —
 * get demoted there. 'video' keeps its real kind: those items auto-advance
 * on end through the player's own `onEnded` (see CollectionStage/StageVideo),
 * exactly like every other playlist.
 */
describe('collectionTabProgressKind', () => {
  it('demotes timed to none inside the Collection tab', () => {
    expect(collectionTabProgressKind('timed', true)).toBe('none')
  })

  it('leaves timed alone outside the Collection tab', () => {
    expect(collectionTabProgressKind('timed', false)).toBe('timed')
  })

  it('never touches video, inside the Collection tab or not', () => {
    expect(collectionTabProgressKind('video', true)).toBe('video')
    expect(collectionTabProgressKind('video', false)).toBe('video')
  })

  it('never touches none, inside the Collection tab or not', () => {
    expect(collectionTabProgressKind('none', true)).toBe('none')
    expect(collectionTabProgressKind('none', false)).toBe('none')
  })
})
