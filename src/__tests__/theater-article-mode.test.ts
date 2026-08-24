import { describe, expect, it } from 'vitest'
import {
  canQuoteArticleMode,
  isArticleReader,
  isQuoteReader,
  offerArticleMode,
  parentHasStageMedia,
} from '@/components/theater/types'
import type { TheaterItem } from '@/components/theater/types'

function item(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '1',
    author: 'alice',
    url: '/alice/status/1',
    createdAt: '2026-08-23T00:00:00Z',
    ...overrides,
  } as TheaterItem
}

describe('offerArticleMode', () => {
  it('is always on for video/photo + quote', () => {
    const videoQuote = item({ contentType: 'video', quote: { author: 'bob', text: 'q' } })
    expect(parentHasStageMedia(videoQuote)).toBe(true)
    expect(canQuoteArticleMode(videoQuote)).toBe(true)
    expect(offerArticleMode(videoQuote, false)).toBe(true)
  })

  it('appears for a long media caption once it overflows two lines', () => {
    const video = item({ contentType: 'video', text: 'a long caption' })
    expect(offerArticleMode(video, false)).toBe(false)
    expect(offerArticleMode(video, true)).toBe(true)
  })

  it('stays on in article mode after the clamped caption unmounts', () => {
    const video = item({ contentType: 'video', text: 'a long caption' })
    expect(offerArticleMode(video, false, true)).toBe(true)
  })

  it('is off for text-only posts', () => {
    expect(offerArticleMode(item({ contentType: 'text', text: 'hello' }), true)).toBe(false)
  })

  it('appears for an overflowing photo caption with no quote', () => {
    const photo = item({ contentType: 'photo', text: 'a long photo caption' })
    expect(offerArticleMode(photo, false)).toBe(false)
    expect(offerArticleMode(photo, true)).toBe(true)
    expect(isArticleReader(photo, true)).toBe(true)
  })

  it('is on for Instagram and YouTube video once article mode is set', () => {
    const ig = item({ platform: 'instagram', contentType: 'video', text: 'reel caption' })
    const yt = item({ platform: 'youtube', contentType: 'video', text: 'short caption' })
    expect(offerArticleMode(ig, true)).toBe(true)
    expect(offerArticleMode(yt, true)).toBe(true)
    expect(isArticleReader(ig, true)).toBe(true)
    expect(isArticleReader(yt, true)).toBe(true)
    expect(isQuoteReader(ig, false)).toBe(false)
    expect(isQuoteReader(yt, false)).toBe(false)
  })
})

describe('isArticleReader vs isQuoteReader', () => {
  it('text-only quotes always use the stacked reader', () => {
    const quote = item({ contentType: 'quote', quote: { author: 'bob', text: 'q' } })
    expect(isQuoteReader(quote, false)).toBe(true)
    expect(isArticleReader(quote, false)).toBe(true)
  })

  it('video+quote is not a reader until article mode, and stays a playing video', () => {
    const videoQuote = item({ contentType: 'video', quote: { author: 'bob', text: 'q' } })
    expect(isQuoteReader(videoQuote, false)).toBe(false)
    expect(isArticleReader(videoQuote, false)).toBe(false)
    expect(isQuoteReader(videoQuote, true)).toBe(true)
    expect(isArticleReader(videoQuote, true)).toBe(true)
  })
})
