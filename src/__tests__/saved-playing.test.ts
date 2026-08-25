/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseSavedPlayingKey,
  savedPlayingIndex,
  readSavedPlayingKey,
  writeSavedPlayingKey,
  SAVED_PLAYING_STORAGE_KEY,
} from '@/lib/theater/saved-playing'

describe('savedPlayingIndex', () => {
  it('returns 0 when the key is missing or unknown', () => {
    const items = [
      { id: '1', platform: 'twitter' },
      { id: '2', platform: 'twitter' },
    ]
    expect(savedPlayingIndex(items, null)).toBe(0)
    expect(savedPlayingIndex(items, 'twitter:99')).toBe(0)
  })

  it('finds the matching identity after a prepend shifted the index', () => {
    const items = [
      { id: '99', platform: 'twitter' },
      { id: '1', platform: 'twitter' },
      { id: '2', platform: 'twitter' },
    ]
    expect(savedPlayingIndex(items, 'twitter:2')).toBe(2)
  })
})

describe('parseSavedPlayingKey', () => {
  it('splits platform:id', () => {
    expect(parseSavedPlayingKey('tiktok:abc')).toEqual({ platform: 'tiktok', id: 'abc' })
    expect(parseSavedPlayingKey('')).toBeNull()
    expect(parseSavedPlayingKey('nocolon')).toBeNull()
  })
})

describe('sessionStorage read/write', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('round-trips the playing key', () => {
    writeSavedPlayingKey('twitter:2')
    expect(sessionStorage.getItem(SAVED_PLAYING_STORAGE_KEY)).toBe('twitter:2')
    expect(readSavedPlayingKey()).toBe('twitter:2')
    writeSavedPlayingKey(null)
    expect(readSavedPlayingKey()).toBeNull()
  })
})
