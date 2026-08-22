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

describe('resolveTheaterChrome', () => {
  const live = item('live-1')
  const personal = item('mine-1')

  it('picks the live pulse while not on the collection tab', () => {
    const chrome = resolveTheaterChrome({
      isCollectionTab: false,
      personalFinished: false,
      collectionStageTheaterItem: personal,
      waiting: false,
      current: live,
      personalDisplayItems: [personal],
      displayItems: [live],
      currentKey: 'twitter:live-1',
      personalIsSeen: () => false,
      isSeen: () => true,
      seenReady: true,
      freshKeys: new Set(['twitter:live-1']),
      newCount: 2,
      currentIndex: 0,
      unseenCount: 1,
      effectiveRepeatMode: 'off',
      personalIndex: 0,
      canPrev: false,
      canNext: true,
    })
    expect(chrome.chromeCurrent?.bookmarkId).toBe('live-1')
    expect(chrome.chromeItems).toHaveLength(1)
    expect(chrome.chromeCanNext).toBe(true)
    expect(chrome.chromeNewCount).toBe(2)
    expect(chrome.queueTotal).toBeTypeOf('number')
  })

  it('picks the personal queue on the collection tab and hides live extras', () => {
    const chrome = resolveTheaterChrome({
      isCollectionTab: true,
      personalFinished: false,
      collectionStageTheaterItem: personal,
      waiting: false,
      current: live,
      personalDisplayItems: [personal],
      displayItems: [live],
      currentKey: 'twitter:live-1',
      personalIsSeen: () => false,
      isSeen: () => true,
      seenReady: true,
      freshKeys: new Set(['twitter:live-1']),
      newCount: 2,
      currentIndex: 0,
      unseenCount: 1,
      effectiveRepeatMode: 'off',
      personalIndex: 1,
      canPrev: false,
      canNext: true,
    })
    expect(chrome.chromeCurrent?.bookmarkId).toBe('mine-1')
    expect(chrome.chromeItems[0]?.bookmarkId).toBe('mine-1')
    expect(chrome.chromeNewCount).toBe(0)
    expect(chrome.queueTotal).toBeUndefined()
    expect(chrome.chromeCanPrev).toBe(true)
  })
})
