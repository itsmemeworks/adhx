/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseSavedPlayingKey,
  savedPlayingIndex,
  savedStartIndex,
  readSavedPlayingKey,
  writeSavedPlayingKey,
  readPlayedSavedKeys,
  writePlayedSavedKeys,
  SAVED_PLAYING_STORAGE_KEY,
  SAVED_PLAYED_STORAGE_KEY,
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

describe('savedStartIndex', () => {
  it('does not resume past leftover rows', () => {
    expect(
      savedStartIndex(4, {
        playingIndex: 3,
        isLeftover: () => true,
      }),
    ).toBe(0)
  })

  it('resumes when every earlier leftover has been left', () => {
    expect(
      savedStartIndex(4, {
        playingIndex: 3,
        isLeftover: (i) => i >= 3,
      }),
    ).toBe(3)
  })

  it('picks the first leftover matching the type filter, not the next after the cursor', () => {
    // Videos at 0,1,2,4 — cursor on a text row at 3. Walk-forward used to
    // start on 4 and All Clear while 0–2 sat unchecked.
    expect(
      savedStartIndex(5, {
        playingIndex: 3,
        isLeftover: () => true,
        matches: (i) => i !== 3,
      }),
    ).toBe(0)
  })

  it('All Clears when nothing matching is leftover', () => {
    expect(
      savedStartIndex(3, {
        playingIndex: 3,
        isLeftover: () => false,
        matches: () => true,
      }),
    ).toBe(3)
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

  it('round-trips played Saved keys', () => {
    writePlayedSavedKeys(['twitter:a', 'twitter:b'])
    expect(sessionStorage.getItem(SAVED_PLAYED_STORAGE_KEY)).toBeTruthy()
    expect([...readPlayedSavedKeys()]).toEqual(['twitter:a', 'twitter:b'])
  })
})
