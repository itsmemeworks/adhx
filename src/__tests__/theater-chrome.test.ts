import { describe, expect, it } from 'vitest'
import { resolveTheaterChrome } from '@/components/theater/theater-chrome'
import type { TheaterItem } from '@/components/theater/types'

function item(id: string): TheaterItem {
  return {
    action: 'preview',
    platform: 'twitter',
    bookmarkId: id,
    url: `/alice/status/${id}`,
    author: 'alice',
    text: id,
    createdAt: '2026-08-22T00:00:00.000Z',
    addedAt: '2026-08-22T00:00:00.000Z',
  }
}

const live = item('live-1')
const personal = item('mine-1')

function base(overrides: Partial<Parameters<typeof resolveTheaterChrome>[0]> = {}) {
  return resolveTheaterChrome({
    isCollectionTab: false,
    personalFinished: false,
    collectionStageTheaterItem: personal,
    waiting: false,
    current: live,
    personalDisplayItems: [personal],
    displayItems: [live],
    currentKey: 'twitter:live-1',
    personalIsSeen: () => false,
    isSeen: () => false,
    seenReady: true,
    freshKeys: new Set(),
    newCount: 0,
    unseenCount: 1,
    effectiveRepeatMode: 'off',
    personalIndex: 0,
    canPrev: false,
    canNext: true,
    ...overrides,
  })
}

describe('resolveTheaterChrome', () => {
  it('picks the live pulse while not on the collection tab', () => {
    const chrome = base({ newCount: 2, freshKeys: new Set(['twitter:live-1']) })
    expect(chrome.chromeCurrent?.bookmarkId).toBe('live-1')
    expect(chrome.queueToPlay).toBe(1)
    expect(chrome.queuePlayed).toBe(0)
    expect(chrome.queueLooping).toBe(false)
    expect(chrome.chromeNewCount).toBe(2)
  })

  it('Live repeat-off count is unseen remaining', () => {
    const chrome = base({
      displayItems: [item('a'), item('b'), item('c')],
      unseenCount: 3,
    })
    expect(chrome.queueToPlay).toBe(3)
    expect(chrome.queuePlayed).toBe(0)
    expect(chrome.queueTotal).toBe(3)
  })

  it('Live repeat-all count is the playlist size', () => {
    const chrome = base({
      displayItems: [item('a'), item('b')],
      unseenCount: 1,
      effectiveRepeatMode: 'all',
    })
    expect(chrome.queueLooping).toBe(true)
    expect(chrome.queueTotal).toBe(2)
  })

  it('Repeat this post is 1', () => {
    const chrome = base({ effectiveRepeatMode: 'one', displayItems: [live, item('b')] })
    expect(chrome.queueLooping).toBe(true)
    expect(chrome.queueTotal).toBe(1)
  })

  it('Repeat-off Queue lists Seen after the playable rows', () => {
    const chrome = base({
      displayItems: [item('a')],
      unseenCount: 1,
      queueItems: [item('a'), item('watched')],
    })
    expect(chrome.chromeItems.map((i) => i.bookmarkId)).toEqual(['a', 'watched'])
    expect(chrome.seenStartIndex).toBe(1)
    expect(chrome.queueToPlay).toBe(1)
  })

  it('caught-up has no playable count', () => {
    const chrome = base({ waiting: true, unseenCount: 0, displayItems: [] })
    expect(chrome.chromeCurrent).toBeNull()
    expect(chrome.queueToPlay).toBe(0)
  })

  it('Saved unread pile is unseen remaining, not a 1-based walk', () => {
    const saved = Array.from({ length: 13 }, (_, i) => item(`mine-${i}`))
    const chrome = base({
      isCollectionTab: true,
      collectionStageTheaterItem: saved[5],
      personalDisplayItems: saved,
      personalIndex: 5,
    })
    expect(chrome.chromeCurrent?.bookmarkId).toBe('mine-5')
    expect(chrome.queuePlayed).toBe(0)
    expect(chrome.queueToPlay).toBe(13)
    expect(chrome.queueLooping).toBe(false)
    expect(chrome.chromeCanPrev).toBe(true)
  })

  it('Saved Queue accents session prepends', () => {
    const chrome = base({
      isCollectionTab: true,
      personalFreshKeys: new Set(['twitter:mine-1']),
      freshKeys: new Set(['twitter:live-1']),
      newCount: 2,
    })
    expect(chrome.chromeFreshKeys.has('twitter:mine-1')).toBe(true)
    expect(chrome.chromeFreshKeys.has('twitter:live-1')).toBe(false)
    expect(chrome.chromeNewCount).toBe(0)
  })
})
