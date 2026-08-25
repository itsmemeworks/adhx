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
    expect(chrome.queueTotal).toBe(1)
    expect(chrome.queuePlayed).toBe(0)
    expect(chrome.queueToPlay).toBe(1)
    expect(chrome.queueLooping).toBe(false)
  })

  it('Live stop-when-caught-up counts leftover unseen, not the full feed', () => {
    const leftover = item('new-1')
    const watched = Array.from({ length: 11 }, (_, i) => item(`old-${i}`))
    const chrome = resolveTheaterChrome({
      isCollectionTab: false,
      personalFinished: false,
      collectionStageTheaterItem: personal,
      waiting: false,
      current: leftover,
      personalDisplayItems: [personal],
      displayItems: [leftover, item('new-2'), ...watched],
      currentKey: 'twitter:new-1',
      personalIsSeen: () => false,
      isSeen: () => true,
      seenReady: true,
      freshKeys: new Set(),
      newCount: 0,
      currentIndex: 0,
      unseenCount: 2,
      effectiveRepeatMode: 'off',
      personalIndex: 0,
      canPrev: false,
      canNext: true,
    })
    expect(chrome.queuePlayed).toBe(0)
    expect(chrome.queueToPlay).toBe(2)
    expect(chrome.queueTotal).toBe(13)
    expect(chrome.queueLooping).toBe(false)
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
    expect(chrome.chromeFreshKeys.size).toBe(0)
    expect(chrome.queueTotal).toBe(1)
    expect(chrome.queuePlayed).toBe(1)
    expect(chrome.queueToPlay).toBe(1)
    expect(chrome.queueLooping).toBe(false)
    expect(chrome.chromeCanPrev).toBe(true)
  })

  it('Saved Queue accents session prepends without Live grouping keys', () => {
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
      personalFreshKeys: new Set(['twitter:mine-1']),
      newCount: 2,
      currentIndex: 0,
      unseenCount: 1,
      effectiveRepeatMode: 'all',
      personalIndex: 0,
      canPrev: false,
      canNext: true,
    })
    expect(chrome.chromeFreshKeys.has('twitter:mine-1')).toBe(true)
    expect(chrome.chromeFreshKeys.has('twitter:live-1')).toBe(false)
    expect(chrome.chromeNewCount).toBe(0)
  })

  it('Saved one-pass is played of the list, not leftover of the pile', () => {
    const saved = Array.from({ length: 13 }, (_, i) => item(`mine-${i}`))
    const chrome = resolveTheaterChrome({
      isCollectionTab: true,
      personalFinished: false,
      collectionStageTheaterItem: saved[5],
      waiting: false,
      current: live,
      personalDisplayItems: saved,
      displayItems: [live],
      currentKey: 'twitter:live-1',
      personalIsSeen: () => false,
      isSeen: () => true,
      seenReady: true,
      freshKeys: new Set(),
      newCount: 0,
      currentIndex: 0,
      unseenCount: 1,
      effectiveRepeatMode: 'off',
      personalIndex: 5,
      canPrev: true,
      canNext: true,
    })
    expect(chrome.queuePlayed).toBe(5)
    expect(chrome.queueToPlay).toBe(13)
    expect(chrome.queueTotal).toBe(13)
    expect(chrome.queueLooping).toBe(false)
  })

  it('Live leftover run counts already-watched posts from this run', () => {
    const leftover = item('new-1')
    const next = item('new-2')
    const watched = Array.from({ length: 11 }, (_, i) => item(`old-${i}`))
    const done = item('done-1')
    const chrome = resolveTheaterChrome({
      isCollectionTab: false,
      personalFinished: false,
      collectionStageTheaterItem: personal,
      waiting: false,
      current: leftover,
      personalDisplayItems: [personal],
      displayItems: [leftover, next, done, ...watched],
      currentKey: 'twitter:new-1',
      personalIsSeen: () => false,
      isSeen: (key) =>
        key === 'twitter:new-1' || key === 'twitter:done-1' || key.startsWith('twitter:old-'),
      seenReady: true,
      freshKeys: new Set(),
      newCount: 0,
      currentIndex: 0,
      unseenCount: 2,
      effectiveRepeatMode: 'off',
      personalIndex: 0,
      canPrev: false,
      canNext: true,
      wasSeenOnEntry: (key) => key.startsWith('twitter:old-'),
    })
    expect(chrome.queuePlayed).toBe(1)
    expect(chrome.queueToPlay).toBe(3)
    expect(chrome.queueTotal).toBe(14)
    expect(chrome.queueLooping).toBe(false)
  })

  it('Keep playing names the pile as looping', () => {
    const chrome = resolveTheaterChrome({
      isCollectionTab: false,
      personalFinished: false,
      collectionStageTheaterItem: personal,
      waiting: false,
      current: live,
      personalDisplayItems: [personal],
      displayItems: [live, item('2'), item('3')],
      currentKey: 'twitter:live-1',
      personalIsSeen: () => false,
      isSeen: () => false,
      seenReady: true,
      freshKeys: new Set(),
      newCount: 0,
      currentIndex: 0,
      unseenCount: 3,
      effectiveRepeatMode: 'all',
      personalIndex: 0,
      canPrev: false,
      canNext: true,
    })
    expect(chrome.queueLooping).toBe(true)
    expect(chrome.queueTotal).toBe(3)
  })
})
