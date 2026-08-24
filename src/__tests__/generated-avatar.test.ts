import { describe, it, expect } from 'vitest'
import {
  hashSeed,
  generateAvatarSvg,
  generateAvatarDataUri,
  isPlaceholderAvatarUrl,
  usableAvatarUrl,
  resolveAccountAvatarSrc,
} from '@/lib/avatar/generated-avatar'

describe('generated-avatar', () => {
  it('is deterministic: same seed produces byte-identical output every call', () => {
    const first = generateAvatarSvg('weedauwl')
    const second = generateAvatarSvg('weedauwl')
    expect(first).toBe(second)
    expect(hashSeed('weedauwl')).toBe(hashSeed('weedauwl'))
  })

  it("matches a known output — locks the algorithm so a refactor cannot silently change everyone's avatar", () => {
    expect(hashSeed('weedauwl')).toBe(4240133321)
    expect(generateAvatarSvg('weedauwl')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" role="img" aria-hidden="true">' +
        '<defs><clipPath id="c4240133321"><circle cx="40" cy="40" r="40"/></clipPath></defs>' +
        '<g clip-path="url(#c4240133321)"><rect width="80" height="80" fill="#118AB2"/>' +
        '<circle cx="38.5" cy="47.1" r="35.8" fill="#073B4C" fill-opacity="0.89"/>' +
        '<circle cx="57.2" cy="49.2" r="31.0" fill="#06D6A0" fill-opacity="0.77"/>' +
        '<circle cx="33.8" cy="43.6" r="28.6" fill="#073B4C" fill-opacity="0.63"/></g></svg>',
    )
  })

  it('different seeds produce different output', () => {
    const a = generateAvatarSvg('alice')
    const b = generateAvatarSvg('bob')
    expect(a).not.toBe(b)
    expect(hashSeed('alice')).not.toBe(hashSeed('bob'))
  })

  it('handles empty and undefined seeds without throwing, falling back to the same anonymous icon', () => {
    expect(() => generateAvatarSvg('')).not.toThrow()
    expect(() => generateAvatarSvg(undefined)).not.toThrow()
    expect(() => generateAvatarSvg(null)).not.toThrow()
    // Empty/undefined/null all collapse to the same fallback seed.
    expect(generateAvatarSvg('')).toBe(generateAvatarSvg(undefined))
    expect(generateAvatarSvg(undefined)).toBe(generateAvatarSvg(null))
  })

  it('produces inert markup: no <script> tags and no event-handler attributes', () => {
    const seeds = [
      'weedauwl',
      'alice',
      'bob',
      '',
      'a "; onerror=alert(1)//',
      '<script>alert(1)</script>',
    ]
    for (const seed of seeds) {
      const svg = generateAvatarSvg(seed)
      expect(svg.toLowerCase()).not.toContain('<script')
      expect(svg).not.toMatch(/\son\w+\s*=/i)
      expect(svg.startsWith('<svg ')).toBe(true)
    }
  })

  it('produces a valid data: URI usable directly as an <img src>', () => {
    const uri = generateAvatarDataUri('weedauwl')
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true)
    expect(decodeURIComponent(uri.slice('data:image/svg+xml,'.length))).toBe(
      generateAvatarSvg('weedauwl'),
    )
  })
})

/**
 * A platform's own "no photo" placeholder is a real, successfully-loading
 * image, so neither a null check nor `onError` catches it — those accounts
 * kept showing an anonymous grey silhouette instead of a generated icon
 * (found on @weedauwl's own profile during the live check).
 */
describe('isPlaceholderAvatarUrl / usableAvatarUrl', () => {
  it("treats X's default-profile images as no avatar at all", () => {
    const placeholders = [
      'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
      'https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png',
      'https://abs.twimg.com/sticky/default_profile_images/default_profile_6_normal.png',
      'https://abs.twimg.com/sticky/default_profile_images/default_profile.png',
    ]
    for (const url of placeholders) {
      expect(isPlaceholderAvatarUrl(url)).toBe(true)
      expect(usableAvatarUrl(url)).toBeNull()
    }
  })

  it('leaves a real uploaded avatar alone', () => {
    const real = 'https://pbs.twimg.com/profile_images/1234567890/photo_normal.jpg'
    expect(isPlaceholderAvatarUrl(real)).toBe(false)
    expect(usableAvatarUrl(real)).toBe(real)
  })

  it("does not over-match a user's own file that merely contains the words", () => {
    // The pattern is anchored to a path-segment boundary, so only the
    // platform's real placeholder filename matches — an uploaded image that
    // happens to be named similarly is still that user's avatar.
    const uploads = [
      'https://pbs.twimg.com/profile_images/9/my_default_profile_pic_normal.jpg',
      'https://pbs.twimg.com/profile_images/9/defaults_normal.jpg',
      'https://pbs.twimg.com/profile_images/9/default_profiles_normal.jpg',
    ]
    for (const url of uploads) {
      expect(isPlaceholderAvatarUrl(url)).toBe(false)
      expect(usableAvatarUrl(url)).toBe(url)
    }
  })

  it('handles null/undefined/empty', () => {
    expect(isPlaceholderAvatarUrl(null)).toBe(false)
    expect(isPlaceholderAvatarUrl(undefined)).toBe(false)
    expect(usableAvatarUrl(null)).toBeNull()
    expect(usableAvatarUrl('')).toBeNull()
  })
})

describe('resolveAccountAvatarSrc', () => {
  const xPhoto = 'https://pbs.twimg.com/profile_images/1/me.jpg'
  const generated = generateAvatarDataUri('tester')

  it('uses the X photo when source is x and the URL is usable', () => {
    expect(
      resolveAccountAvatarSrc({
        avatarSource: 'x',
        xAvatarUrl: xPhoto,
        username: 'tester',
      }),
    ).toBe(xPhoto)
  })

  it('uses the generated icon when the user picked generated, even with an X photo', () => {
    expect(
      resolveAccountAvatarSrc({
        avatarSource: 'generated',
        xAvatarUrl: xPhoto,
        username: 'tester',
      }),
    ).toBe(generated)
  })

  it('falls back to generated when X is disconnected or the photo is a placeholder', () => {
    expect(
      resolveAccountAvatarSrc({
        avatarSource: 'x',
        xAvatarUrl: null,
        username: 'tester',
      }),
    ).toBe(generated)
    expect(
      resolveAccountAvatarSrc({
        avatarSource: 'x',
        xAvatarUrl:
          'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
        username: 'tester',
      }),
    ).toBe(generated)
  })
})
