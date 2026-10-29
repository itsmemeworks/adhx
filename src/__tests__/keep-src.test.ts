import { describe, expect, it } from 'vitest'
import { keptSrc, keptSrcSet, sizedSrc } from '@/lib/keep/src'
import { thumbWidth } from '@/lib/keep/thumb'

describe('smaller copies of kept pictures', () => {
  const photo = keptSrc('twitter', '123', 'photo-1', 'alice')

  it('asks /api/files for a width only on pictures and posters', () => {
    expect(sizedSrc(photo, 320)).toBe('/api/files/twitter/123/photo-1?a=alice&v=2&w=320')
    expect(sizedSrc(keptSrc('youtube', 'x', 'poster'), 640)).toBe(
      '/api/files/youtube/x/poster?v=2&w=640',
    )
    for (const other of [
      keptSrc('twitter', '123', 'video-1', 'alice'),
      keptSrc('twitter', '123', 'photo-1', 'alice', { download: true }),
      '/api/files/avatar/abc',
      'https://example.com/cover.jpg',
      `${photo}&w=160`,
    ]) {
      expect(sizedSrc(other, 320)).toBe(other)
      expect(keptSrcSet(other)).toBeNull()
    }
  })

  it('lists every made width in the srcset', () => {
    expect(keptSrcSet(photo)?.split(', ')).toEqual([
      `${photo}&w=160 160w`,
      `${photo}&w=320 320w`,
      `${photo}&w=640 640w`,
      `${photo}&w=960 960w`,
      `${photo}&w=1280 1280w`,
    ])
  })

  it('snaps an asked width up to a made one', () => {
    expect(thumbWidth('1')).toBe(160)
    expect(thumbWidth('320')).toBe(320)
    expect(thumbWidth('321')).toBe(640)
    expect(thumbWidth('99999')).toBe(1280)
    for (const bad of [null, '', '0', '-5', '1e3', '12.5', 'abc'])
      expect(thumbWidth(bad)).toBeNull()
  })
})
