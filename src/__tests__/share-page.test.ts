/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseShareUrl,
  extractSharedUrl,
  isSafeInternalPath,
  navigateToPastedLink,
  type PastedLinkRouter,
} from '@/lib/utils/parse-share-url'
import { peekPreviewOpenIntent } from '@/lib/theater/autosave-shared'

/**
 * Share Page URL Parsing Tests
 *
 * Tests the URL parsing utility used by the PWA Share Target /share page,
 * plus `navigateToPastedLink` — the shared navigation sink every "paste a
 * link" surface (LandingPage, PasteLinkButton) routes
 * through. jsdom is needed here (not the file's original `node` default)
 * because that helper touches `window.location.href` for the TikTok
 * short-link hard-navigation branch.
 */

describe('parseShareUrl — X / Twitter', () => {
  it('parses x.com and twitter.com', () => {
    expect(parseShareUrl('https://x.com/elonmusk/status/1234567890')).toEqual({
      path: '/elonmusk/status/1234567890',
    })
    expect(parseShareUrl('https://twitter.com/jack/status/9876543210')).toEqual({
      path: '/jack/status/9876543210',
    })
  })

  it('handles no-protocol, www, query params, trailing segments, whitespace, case', () => {
    expect(parseShareUrl('x.com/user/status/111')).toEqual({ path: '/user/status/111' })
    expect(parseShareUrl('https://www.x.com/user/status/111')).toEqual({ path: '/user/status/111' })
    expect(parseShareUrl('https://x.com/user/status/111?s=20&t=abc')).toEqual({
      path: '/user/status/111',
    })
    expect(parseShareUrl('https://x.com/user/status/111/photo/1')).toEqual({
      path: '/user/status/111',
    })
    expect(parseShareUrl('  https://x.com/my_user_name/status/111  ')).toEqual({
      path: '/my_user_name/status/111',
    })
    expect(parseShareUrl('https://X.COM/user/status/111')).toEqual({ path: '/user/status/111' })
  })
})

describe('parseShareUrl — Instagram', () => {
  it('maps Reels to /reels and image-capable posts to /p', () => {
    expect(parseShareUrl('https://www.instagram.com/reels/DXVsqQ7CSXw')).toEqual({
      path: '/reels/DXVsqQ7CSXw',
    })
    expect(parseShareUrl('https://instagram.com/reel/DXVsqQ7CSXw/')).toEqual({
      path: '/reels/DXVsqQ7CSXw',
    })
    expect(
      parseShareUrl(
        'https://www.instagram.com/p/DcHXej3lt5W/?utm_source=ig_web_copy_link&igsi=abc',
      ),
    ).toEqual({ path: '/p/DcHXej3lt5W' })
  })
})

describe('parseShareUrl — TikTok', () => {
  it('maps @user/video/{id} to /@user/video/{id}', () => {
    expect(parseShareUrl('https://www.tiktok.com/@sophieraiin/video/7619017281691045134')).toEqual({
      path: '/@sophieraiin/video/7619017281691045134',
    })
  })

  it('routes short links (the native share format) through the resolver', () => {
    // TikTok's share sheet gives a vm./vt. short link, not the canonical URL.
    expect(parseShareUrl('https://vm.tiktok.com/ZMABcd123/')).toEqual({
      path: '/api/tiktok/resolve?url=https%3A%2F%2Fvm.tiktok.com%2FZMABcd123&go=1',
    })
    expect(parseShareUrl('https://vt.tiktok.com/ZSxyz789')).toEqual({
      path: '/api/tiktok/resolve?url=https%3A%2F%2Fvt.tiktok.com%2FZSxyz789&go=1',
    })
    expect(parseShareUrl('https://www.tiktok.com/t/ZTRkAbc/')).toEqual({
      path: '/api/tiktok/resolve?url=https%3A%2F%2Fwww.tiktok.com%2Ft%2FZTRkAbc&go=1',
    })
    expect(parseShareUrl('https://vm.tiktok.com/ZMABcd123/?is_from_webapp=1')).toEqual({
      path: '/api/tiktok/resolve?url=https%3A%2F%2Fvm.tiktok.com%2FZMABcd123&go=1',
    })
  })

  it('routes encoded canonical handles to the preview path', () => {
    expect(parseShareUrl('https://m.tiktok.com/%40sophieraiin/video/7619017281691045134')).toEqual({
      path: '/@sophieraiin/video/7619017281691045134',
    })
  })
})

describe('extractSharedUrl — picks the link out of the share payload', () => {
  it('prefers a clean url field', () => {
    expect(extractSharedUrl('https://x.com/u/status/1', null, null)).toBe(
      'https://x.com/u/status/1',
    )
  })

  it('extracts a URL embedded in the text field (TikTok caption + link)', () => {
    expect(
      extractSharedUrl(null, 'check this out 😂 https://vm.tiktok.com/ZMABcd123/', 'TikTok'),
    ).toBe('https://vm.tiktok.com/ZMABcd123/')
  })

  it('falls back across fields and returns null when there is no URL', () => {
    expect(extractSharedUrl(null, null, 'https://youtu.be/Y9aytLYBajw')).toBe(
      'https://youtu.be/Y9aytLYBajw',
    )
    expect(extractSharedUrl(null, 'just a caption, no link', null)).toBeNull()
    expect(extractSharedUrl(null, null, null)).toBeNull()
  })

  it('feeds the TikTok short-link flow end to end', () => {
    const url = extractSharedUrl(null, 'omg watch https://vm.tiktok.com/ZMABcd123/', null)
    expect(url).not.toBeNull()
    expect(parseShareUrl(url!)).toEqual({
      path: '/api/tiktok/resolve?url=https%3A%2F%2Fvm.tiktok.com%2FZMABcd123&go=1',
    })
  })

  it('requires caption text to be extracted before parsing', () => {
    const caption = 'omg watch https://vt.tiktok.com/ZSxyz789/'
    expect(parseShareUrl(caption)).toBeNull()

    const extracted = extractSharedUrl(null, caption, null)
    expect(parseShareUrl(extracted!)).toEqual({
      path: '/api/tiktok/resolve?url=https%3A%2F%2Fvt.tiktok.com%2FZSxyz789&go=1',
    })
  })
})

describe('parseShareUrl — YouTube', () => {
  it('maps a Shorts URL to /shorts/{id}', () => {
    expect(parseShareUrl('https://youtube.com/shorts/Y9aytLYBajw?si=abc')).toEqual({
      path: '/shorts/Y9aytLYBajw',
    })
  })

  it('rejects watch / youtu.be — those are regular videos', () => {
    expect(parseShareUrl('https://youtu.be/Y9aytLYBajw')).toBeNull()
    expect(parseShareUrl('https://www.youtube.com/watch?v=Y9aytLYBajw&t=5s')).toBeNull()
  })
})

describe('parseShareUrl — rejections', () => {
  it('returns null for unsupported / malformed URLs', () => {
    expect(parseShareUrl('https://google.com')).toBeNull()
    expect(parseShareUrl('https://x.com/user')).toBeNull()
    expect(parseShareUrl('https://x.com/user/status/abc')).toBeNull()
    expect(parseShareUrl('https://youtube.com/feed/subscriptions')).toBeNull()
    expect(parseShareUrl('not a url at all')).toBeNull()
    expect(parseShareUrl('')).toBeNull()
  })

  it('rejects platform-looking content on an unrelated or deceptive host', () => {
    expect(parseShareUrl('https://evil.example/x.com/user/status/111')).toBeNull()
    expect(
      parseShareUrl('https://evil.example/@user/video/123456?next=https://tiktok.com'),
    ).toBeNull()
    expect(
      parseShareUrl('https://evil.example/?next=https://youtube.com/shorts/Y9aytLYBajw'),
    ).toBeNull()
    expect(parseShareUrl('https://x.com.evil.example/user/status/111')).toBeNull()
    expect(parseShareUrl('https://x.com@evil.example/user/status/111')).toBeNull()
  })

  it('rejects nested TikTok short links on unrelated top-level URLs', () => {
    expect(parseShareUrl('https://evil.example/?next=https://vm.tiktok.com/ZMABcd123/')).toBeNull()
    expect(parseShareUrl('https://evil.example/https://vt.tiktok.com/ZSxyz789')).toBeNull()
    expect(parseShareUrl('https://evil.example/?next=https://www.tiktok.com/t/ZTRkAbc')).toBeNull()
  })

  it('rejects unsafe schemes while preserving valid mobile hosts', () => {
    expect(parseShareUrl('javascript://x.com/user/status/111')).toBeNull()
    expect(parseShareUrl('ftp://instagram.com/reel/DXVsqQ7CSXw')).toBeNull()
    expect(parseShareUrl('//x.com/user/status/111')).toBeNull()
    expect(parseShareUrl('https://mobile.twitter.com/user/status/111')).toEqual({
      path: '/user/status/111',
    })
    expect(parseShareUrl('https://m.youtube.com/shorts/Y9aytLYBajw')).toEqual({
      path: '/shorts/Y9aytLYBajw',
    })
  })
})

describe('isSafeInternalPath — guards window.location assignment', () => {
  it('accepts real preview/resolver paths', () => {
    expect(isSafeInternalPath('/elonmusk/status/1234567890')).toBe(true)
    expect(isSafeInternalPath('/reels/DXVsqQ7CSXw')).toBe(true)
    expect(isSafeInternalPath('/@sophieraiin/video/7619017281691045134')).toBe(true)
    expect(
      isSafeInternalPath('/api/tiktok/resolve?url=https%3A%2F%2Fvm.tiktok.com%2Fabc&go=1'),
    ).toBe(true)
  })

  it('rejects a javascript: scheme smuggled into the "path"', () => {
    expect(isSafeInternalPath('javascript:alert(1)')).toBe(false)
  })

  it('rejects a protocol-relative URL (silent redirect off-site)', () => {
    expect(isSafeInternalPath('//evil.com/phish')).toBe(false)
  })

  it('rejects an absolute URL to another host', () => {
    expect(isSafeInternalPath('https://evil.com/phish')).toBe(false)
  })

  it('rejects a path that is missing the leading slash', () => {
    expect(isSafeInternalPath('elonmusk/status/1')).toBe(false)
  })
})

describe('navigateToPastedLink — the shared paste-a-link navigation sink', () => {
  const makeRouter = (): PastedLinkRouter & { push: ReturnType<typeof vi.fn> } => ({
    push: vi.fn<(href: string) => void>(),
  })

  beforeEach(() => {
    sessionStorage.clear()
    // A plain object standing in for `window.location` — assigning `.href`
    // on the real jsdom Location attempts a navigation and logs a noisy
    // "not implemented" error; this just records the value instead.
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: '' },
      writable: true,
    })
  })

  it('navigates a tweet URL via the router', () => {
    const router = makeRouter()
    expect(navigateToPastedLink(router, 'https://x.com/naval/status/2064012969239859490')).toBe(
      true,
    )
    expect(router.push).toHaveBeenCalledWith('/naval/status/2064012969239859490')
    expect(window.location.href).toBe('')
    expect(peekPreviewOpenIntent()).toBe('paste')
  })

  it('navigates an Instagram reel URL via the router', () => {
    const router = makeRouter()
    expect(navigateToPastedLink(router, 'https://www.instagram.com/reels/DXVsqQ7CSXw')).toBe(true)
    expect(router.push).toHaveBeenCalledWith('/reels/DXVsqQ7CSXw')
  })

  it('navigates a canonical TikTok video URL via the router', () => {
    const router = makeRouter()
    expect(
      navigateToPastedLink(router, 'https://www.tiktok.com/@sophieraiin/video/7619017281691045134'),
    ).toBe(true)
    expect(router.push).toHaveBeenCalledWith('/@sophieraiin/video/7619017281691045134')
  })

  it('navigates a YouTube Short URL via the router', () => {
    const router = makeRouter()
    expect(navigateToPastedLink(router, 'https://youtube.com/shorts/Y9aytLYBajw')).toBe(true)
    expect(router.push).toHaveBeenCalledWith('/shorts/Y9aytLYBajw')
  })

  it('does not navigate a watch or youtu.be URL', () => {
    const router = makeRouter()
    expect(navigateToPastedLink(router, 'https://youtu.be/Y9aytLYBajw')).toBe(false)
    expect(navigateToPastedLink(router, 'https://www.youtube.com/watch?v=Y9aytLYBajw')).toBe(false)
    expect(router.push).not.toHaveBeenCalled()
  })

  it('rebuilds a TikTok short link into a hard navigation instead of router.push', () => {
    const router = makeRouter()
    expect(navigateToPastedLink(router, 'https://vm.tiktok.com/ZMABcd123/')).toBe(true)
    expect(router.push).not.toHaveBeenCalled()
    expect(window.location.href).toBe(
      '/api/tiktok/resolve?url=https%3A%2F%2Fvm.tiktok.com%2FZMABcd123&go=1',
    )
    expect(peekPreviewOpenIntent()).toBe('paste')
  })

  it.each([
    [
      'watch this https://vm.tiktok.com/ZMABcd123/',
      '/api/tiktok/resolve?url=https%3A%2F%2Fvm.tiktok.com%2FZMABcd123&go=1',
    ],
    [
      'TikTok caption 😂 https://vt.tiktok.com/ZSxyz789/',
      '/api/tiktok/resolve?url=https%3A%2F%2Fvt.tiktok.com%2FZSxyz789&go=1',
    ],
  ])('extracts a caption-wrapped TikTok short link', (caption, expectedPath) => {
    const router = makeRouter()
    expect(navigateToPastedLink(router, caption)).toBe(true)
    expect(router.push).not.toHaveBeenCalled()
    expect(window.location.href).toBe(expectedPath)
    expect(peekPreviewOpenIntent()).toBe('paste')
  })

  it('returns false and navigates nowhere for unsupported text', () => {
    const router = makeRouter()
    expect(navigateToPastedLink(router, 'just some ordinary text, no link here')).toBe(false)
    expect(router.push).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
    expect(peekPreviewOpenIntent()).toBeNull()
  })

  it('does not navigate a platform-looking path on an unrelated host', () => {
    const router = makeRouter()
    expect(navigateToPastedLink(router, 'https://evil.example/x.com/user/status/111')).toBe(false)
    expect(router.push).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
    expect(peekPreviewOpenIntent()).toBeNull()
  })

  it.each([
    'https://evil.example/?next=https://vm.tiktok.com/ZMABcd123/',
    'https://evil.example/https://vt.tiktok.com/ZSxyz789/',
  ])('does not hard-navigate a nested TikTok short link: %s', (url) => {
    const router = makeRouter()
    expect(navigateToPastedLink(router, url)).toBe(false)
    expect(router.push).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
    expect(peekPreviewOpenIntent()).toBeNull()
  })

  it('refuses a javascript: URL smuggled in as pasted text', () => {
    const router = makeRouter()
    expect(navigateToPastedLink(router, 'javascript:alert(1)')).toBe(false)
    expect(router.push).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
  })
})
