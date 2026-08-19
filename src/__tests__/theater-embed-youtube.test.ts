import { describe, it, expect } from 'vitest'
import { resolveYouTubeVideoId } from '@/components/theater/StageYouTube'

describe('resolveYouTubeVideoId', () => {
  it('accepts a valid 11-char video id', () => {
    expect(resolveYouTubeVideoId({ bookmarkId: 'dQw4w9WgXcQ' })).toBe('dQw4w9WgXcQ')
  })

  it('accepts ids with underscores and hyphens', () => {
    expect(resolveYouTubeVideoId({ bookmarkId: '-wtIMTCHWuI' })).toBe('-wtIMTCHWuI')
    expect(resolveYouTubeVideoId({ bookmarkId: 'a_B-9x0Q1zY' })).toBe('a_B-9x0Q1zY')
  })

  it('rejects a missing bookmarkId', () => {
    expect(resolveYouTubeVideoId({ bookmarkId: undefined })).toBeNull()
    expect(resolveYouTubeVideoId({ bookmarkId: null })).toBeNull()
    expect(resolveYouTubeVideoId({ bookmarkId: '' })).toBeNull()
  })

  it('rejects ids of the wrong length', () => {
    expect(resolveYouTubeVideoId({ bookmarkId: 'short' })).toBeNull()
    expect(resolveYouTubeVideoId({ bookmarkId: 'wayTooLongForAVideoId123' })).toBeNull()
  })

  it('rejects a full URL instead of a bare id', () => {
    expect(resolveYouTubeVideoId({ bookmarkId: 'https://youtu.be/dQw4w9WgXcQ' })).toBeNull()
  })

  it('rejects ids with characters outside the base64url-ish alphabet', () => {
    expect(resolveYouTubeVideoId({ bookmarkId: 'has spaces!' })).toBeNull()
  })
})
