import { describe, it, expect } from 'vitest'
import { stagePhotoSrc, textSizeClass } from '@/components/theater/StageText'

describe('textSizeClass', () => {
  it('renders the largest tier for short posts', () => {
    expect(textSizeClass('hello world')).toBe('text-4xl sm:text-5xl lg:text-6xl')
  })

  it('uses the boundary length inclusively for tier 1 (<=80)', () => {
    expect(textSizeClass('a'.repeat(80))).toBe('text-4xl sm:text-5xl lg:text-6xl')
    expect(textSizeClass('a'.repeat(81))).toBe('text-3xl sm:text-4xl lg:text-5xl')
  })

  it('steps down for medium-length posts', () => {
    expect(textSizeClass('a'.repeat(180))).toBe('text-3xl sm:text-4xl lg:text-5xl')
    expect(textSizeClass('a'.repeat(181))).toBe('text-xl sm:text-2xl lg:text-3xl')
  })

  it('steps down further for long posts', () => {
    expect(textSizeClass('a'.repeat(600))).toBe('text-xl sm:text-2xl lg:text-3xl')
  })

  it('uses a prose-like relaxed tier for very long (>600 char) posts', () => {
    expect(textSizeClass('a'.repeat(601))).toBe('text-lg sm:text-xl leading-relaxed')
    expect(textSizeClass('a'.repeat(3000))).toBe('text-lg sm:text-xl leading-relaxed')
  })

  it('handles empty text', () => {
    expect(textSizeClass('')).toBe('text-4xl sm:text-5xl lg:text-6xl')
  })
})

describe('stagePhotoSrc', () => {
  it('uses the image proxy for Twitter photos, not a raw pbs.twimg.com URL', () => {
    expect(
      stagePhotoSrc({
        platform: 'twitter',
        author: '5Pillarsuk',
        bookmarkId: '2063962309815345268',
        thumbnailUrl: 'https://pbs.twimg.com/media/HKSqyHcXUAArUT8.jpg?name=orig',
      }),
    ).toBe('/api/media/image?author=5Pillarsuk&tweetId=2063962309815345268&index=1')
  })

  it('keeps non-Twitter thumbs as-is', () => {
    expect(
      stagePhotoSrc({
        platform: 'instagram',
        author: 'ladybird',
        bookmarkId: 'abc',
        thumbnailUrl: 'https://example.com/poster.jpg',
      }),
    ).toBe('https://example.com/poster.jpg')
  })
})
