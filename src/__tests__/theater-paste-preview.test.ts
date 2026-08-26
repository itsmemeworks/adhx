import { describe, it, expect } from 'vitest'
import { resolvePastedLink } from '@/lib/theater/paste-preview'

describe('resolvePastedLink', () => {
  it('maps an X status URL to its preview path', () => {
    expect(resolvePastedLink('https://x.com/naval/status/2064012969239859490')).toBe(
      '/naval/status/2064012969239859490',
    )
  })

  it('maps an Instagram reel URL', () => {
    expect(resolvePastedLink('https://www.instagram.com/reels/DaigXfxAkrE/')).toBe(
      '/reels/DaigXfxAkrE',
    )
  })

  it('maps a TikTok video URL', () => {
    expect(resolvePastedLink('https://www.tiktok.com/@user/video/7648011069385919752')).toBe(
      '/@user/video/7648011069385919752',
    )
  })

  it('maps a YouTube short URL', () => {
    expect(resolvePastedLink('https://youtube.com/shorts/aqz-KE-bpKQ')).toBe('/shorts/aqz-KE-bpKQ')
  })

  it('routes a TikTok short link through the resolver redirect', () => {
    const path = resolvePastedLink('https://vm.tiktok.com/ZMabc123/')
    expect(path).toMatch(/^\/api\/tiktok\/resolve\?url=/)
    expect(path).toContain('go=1')
  })

  it('pulls a URL embedded in caption text', () => {
    expect(resolvePastedLink('check this out https://x.com/naval/status/123 so good')).toBe(
      '/naval/status/123',
    )
  })

  it('returns null for plain text, unsupported links, and regular YouTube videos', () => {
    expect(resolvePastedLink('the modern struggle')).toBeNull()
    expect(resolvePastedLink('https://example.com/watch?v=abc')).toBeNull()
    expect(resolvePastedLink('https://youtu.be/Y9aytLYBajw')).toBeNull()
    expect(resolvePastedLink('https://www.youtube.com/watch?v=Y9aytLYBajw')).toBeNull()
    expect(resolvePastedLink('')).toBeNull()
  })
})
