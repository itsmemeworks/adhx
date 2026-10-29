import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import type { MetadataRoute } from 'next'
import { createTestDb, type TestDbInstance } from './api/setup'

/**
 * Google's robots.txt matching for a single User-agent group: the longest
 * matching Allow/Disallow path wins. Query strings are ignored. We only
 * exercise the `User-agent: *` group, unless asked for another.
 *
 * https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
 */
function googleAllows(robotsTxt: string, urlPath: string, agent = '*'): boolean {
  const pathOnly = urlPath.split('?')[0]
  const starGroup = robotsTxt
    .split(/User-agent:\s*/i)
    .find((block) => block.split('\n')[0].trim() === agent)
  if (!starGroup) return true

  const rules: { allow: boolean; prefix: string }[] = []
  for (const line of starGroup.split('\n')) {
    const trimmed = line.trim()
    const allow = /^Allow:\s*(\S+)/i.exec(trimmed)
    const disallow = /^Disallow:\s*(\S+)/i.exec(trimmed)
    if (allow) rules.push({ allow: true, prefix: allow[1] })
    else if (disallow) rules.push({ allow: false, prefix: disallow[1] })
  }

  let best: { allow: boolean; prefix: string } | null = null
  for (const rule of rules) {
    if (rule.prefix === '/') {
      // Allow: / matches everything; Disallow: / matches everything.
      if (!best || rule.prefix.length > best.prefix.length) best = rule
      continue
    }
    if (!pathOnly.startsWith(rule.prefix) && pathOnly !== rule.prefix.replace(/\/$/, '')) {
      continue
    }
    if (!best || rule.prefix.length > best.prefix.length) best = rule
    else if (best && rule.prefix.length === best.prefix.length && rule.allow) best = rule
  }
  return best ? best.allow : true
}

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

/** robots.txt as Next writes it: one group per user agent. */
function toText(robots: MetadataRoute.Robots): string {
  const list = <T>(v: T | T[] | undefined): T[] =>
    v === undefined ? [] : Array.isArray(v) ? v : [v]
  const lines: string[] = []
  for (const rule of list(robots.rules)) {
    for (const agent of list(rule.userAgent)) {
      lines.push(`User-agent: ${agent}`)
      for (const path of list(rule.allow)) lines.push(`Allow: ${path}`)
      for (const path of list(rule.disallow)) lines.push(`Disallow: ${path}`)
      lines.push('')
    }
  }
  for (const sitemap of list(robots.sitemap)) lines.push(`Sitemap: ${sitemap}`)
  return lines.join('\n')
}

async function robotsTxt(): Promise<string> {
  ;(await import('@/lib/settings/extras')).__resetExtrasCache()
  const { default: robots } = await import('@/app/robots')
  return toText(robots())
}

beforeEach(() => {
  testInstance = createTestDb()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://friends.example')
})

afterEach(() => {
  testInstance.close()
  vi.unstubAllEnvs()
})

describe('robots.txt on a new server (search engines off)', () => {
  beforeEach(() => vi.stubEnv('PUBLIC_PAGES', ''))

  it('turns every crawler away and names no sitemap', async () => {
    const txt = await robotsTxt()
    for (const path of ['/', '/now', '/t/alice/cats', '/alice/status/1', '/p/abc', '/privacy']) {
      expect(googleAllows(txt, path)).toBe(false)
    }
    expect(txt).not.toMatch(/Sitemap:/)
  })

  it('still lets link-preview bots fetch a shared post and its card', async () => {
    const txt = await robotsTxt()
    for (const bot of ['Twitterbot', 'facebookexternalhit', 'Slackbot-LinkExpanding']) {
      expect(googleAllows(txt, '/alice/status/1', bot)).toBe(true)
      expect(googleAllows(txt, '/api/og/playlist/alice/cats', bot)).toBe(true)
      expect(googleAllows(txt, '/api/feed', bot)).toBe(false)
    }
  })
})

describe('robots.txt with search engines on — Google video thumbnails', () => {
  beforeEach(() => vi.stubEnv('PUBLIC_PAGES', 'on'))

  it('names the sitemap at this server’s own address, never adhx.com', async () => {
    const txt = await robotsTxt()
    expect(txt).toMatch(/^Sitemap: https:\/\/friends\.example\/sitemap\.xml$/m)
    expect(txt).not.toMatch(/adhx\.com/)
  })

  it('allows the Instagram and TikTok poster URLs used in VideoObject JSON-LD', async () => {
    const txt = await robotsTxt()
    expect(googleAllows(txt, '/api/media/instagram/thumbnail?id=DYP6_iUlDzp')).toBe(true)
    expect(
      googleAllows(txt, '/api/media/tiktok/thumbnail?username=user&id=7123456789012345678'),
    ).toBe(true)
  })

  it('allows the MP4 streams advertised as VideoObject contentUrl', async () => {
    const txt = await robotsTxt()
    expect(googleAllows(txt, '/api/media/instagram/video?id=DYP6_iUlDzp')).toBe(true)
    expect(googleAllows(txt, '/api/media/tiktok/video?username=user&id=7123456789012345678')).toBe(
      true,
    )
  })

  it('still blocks session-gated API routes', async () => {
    const txt = await robotsTxt()
    expect(googleAllows(txt, '/api/feed')).toBe(false)
    expect(googleAllows(txt, '/api/sync')).toBe(false)
    expect(googleAllows(txt, '/api/bookmarks/add')).toBe(false)
    expect(googleAllows(txt, '/api/auth/twitter/status')).toBe(false)
  })

  it('keeps public share JSON and tag pages crawlable', async () => {
    const txt = await robotsTxt()
    expect(googleAllows(txt, '/api/share/tweet/foo/123')).toBe(true)
    expect(googleAllows(txt, '/t/weedauwl/claude-cod')).toBe(true)
    expect(googleAllows(txt, '/settings')).toBe(false)
  })
})
