import { describe, it, expect } from 'vitest'
import {
  albumIndexFromTap,
  ALBUM_DOTS_PAD_PX,
  nextAlbumIndex,
  objectContainBottomPx,
} from '@/components/theater/StageAlbumChrome'
import { parseTweetMediaIndex } from '@/lib/media/proxy'

describe('nextAlbumIndex', () => {
  it('wraps from the last clip to the first', () => {
    expect(nextAlbumIndex(0, 2)).toBe(1)
    expect(nextAlbumIndex(1, 2)).toBe(0)
  })
})

describe('albumIndexFromTap', () => {
  it('maps the left and right thirds, and leaves the center alone', () => {
    expect(albumIndexFromTap(10, 0, 100, 1, 2)).toBe(0)
    expect(albumIndexFromTap(80, 0, 100, 0, 2)).toBe(1)
    expect(albumIndexFromTap(50, 0, 100, 0, 2)).toBeNull()
  })
})

describe('objectContainBottomPx', () => {
  it('falls back to the pad when the picture size is unknown', () => {
    expect(
      objectContainBottomPx({
        parentBottom: 844,
        mediaBottom: 844,
        mediaWidth: 390,
        mediaHeight: 844,
        intrinsicWidth: 0,
        intrinsicHeight: 0,
      }),
    ).toBe(ALBUM_DOTS_PAD_PX)
  })

  it('keeps the last inset while the next clip has no size yet', () => {
    expect(
      objectContainBottomPx({
        parentBottom: 844,
        mediaBottom: 844,
        mediaWidth: 390,
        mediaHeight: 844,
        intrinsicWidth: 0,
        intrinsicHeight: 0,
        previousPx: 324,
      }),
    ).toBe(324)
  })

  it('hugs a letterboxed landscape clip instead of the stage bottom', () => {
    // 390×220 picture in a 390×844 stage (the mobile Watch case).
    expect(
      objectContainBottomPx({
        parentBottom: 844,
        mediaBottom: 844,
        mediaWidth: 390,
        mediaHeight: 844,
        intrinsicWidth: 390,
        intrinsicHeight: 220,
      }),
    ).toBe(312 + ALBUM_DOTS_PAD_PX)
  })

  it('uses the pad when a portrait clip fills the stage', () => {
    expect(
      objectContainBottomPx({
        parentBottom: 844,
        mediaBottom: 844,
        mediaWidth: 390,
        mediaHeight: 844,
        intrinsicWidth: 390,
        intrinsicHeight: 844,
      }),
    ).toBe(ALBUM_DOTS_PAD_PX)
  })

  it('uses the pad when the picture fills the box', () => {
    expect(
      objectContainBottomPx({
        parentBottom: 321,
        mediaBottom: 321,
        mediaWidth: 390,
        mediaHeight: 321,
        intrinsicWidth: 390,
        intrinsicHeight: 321,
      }),
    ).toBe(ALBUM_DOTS_PAD_PX)
  })
})

describe('parseTweetMediaIndex', () => {
  it("defaults to 1 and clamps to Twitter's 4-media cap", () => {
    expect(parseTweetMediaIndex(null)).toBe(1)
    expect(parseTweetMediaIndex('2')).toBe(2)
    expect(parseTweetMediaIndex('0')).toBe(1)
    expect(parseTweetMediaIndex('9')).toBe(1)
  })
})
