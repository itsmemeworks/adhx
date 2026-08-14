import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Google's robots.txt matching for a single User-agent group: the longest
 * matching Allow/Disallow path wins. Query strings are ignored. We only
 * exercise the `User-agent: *` group in public/robots.txt.
 *
 * https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
 */
function googleAllows(robotsTxt: string, urlPath: string): boolean {
  const pathOnly = urlPath.split('?')[0]
  const starGroup = robotsTxt.split(/User-agent:\s*/i).find((block) => block.startsWith('*'))
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

const robotsTxt = readFileSync(resolve(process.cwd(), 'public/robots.txt'), 'utf8')

describe('public/robots.txt — Google video thumbnails', () => {
  it('allows the Instagram and TikTok poster URLs used in VideoObject JSON-LD', () => {
    expect(googleAllows(robotsTxt, '/api/media/instagram/thumbnail?id=DYP6_iUlDzp')).toBe(true)
    expect(
      googleAllows(robotsTxt, '/api/media/tiktok/thumbnail?username=user&id=7123456789012345678'),
    ).toBe(true)
  })

  it('allows the MP4 streams advertised as VideoObject contentUrl', () => {
    expect(googleAllows(robotsTxt, '/api/media/instagram/video?id=DYP6_iUlDzp')).toBe(true)
    expect(
      googleAllows(robotsTxt, '/api/media/tiktok/video?username=user&id=7123456789012345678'),
    ).toBe(true)
  })

  it('still blocks session-gated API routes', () => {
    expect(googleAllows(robotsTxt, '/api/feed')).toBe(false)
    expect(googleAllows(robotsTxt, '/api/sync')).toBe(false)
    expect(googleAllows(robotsTxt, '/api/bookmarks/add')).toBe(false)
    expect(googleAllows(robotsTxt, '/api/auth/twitter/status')).toBe(false)
  })

  it('keeps public share JSON and tag pages crawlable', () => {
    expect(googleAllows(robotsTxt, '/api/share/tweet/foo/123')).toBe(true)
    expect(googleAllows(robotsTxt, '/t/weedauwl/claude-cod')).toBe(true)
    expect(googleAllows(robotsTxt, '/settings')).toBe(false)
  })
})
