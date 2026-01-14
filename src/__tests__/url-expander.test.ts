import { describe, it, expect } from 'vitest'
import { expandUrls, truncateUrl, parseTextWithLinks } from '@/lib/utils/url-expander'

describe('expandUrls', () => {
  it('expands t.co URLs using link mappings', () => {
    const text = 'Check this out https://t.co/abc123'
    const links = [
      { originalUrl: 'https://t.co/abc123', expandedUrl: 'https://example.com/article' }
    ]
    expect(expandUrls(text, links)).toBe('Check this out https://example.com/article')
  })

  it('expands multiple t.co URLs', () => {
    const text = 'Link 1: https://t.co/abc and Link 2: https://t.co/xyz'
    const links = [
      { originalUrl: 'https://t.co/abc', expandedUrl: 'https://example.com/1' },
      { originalUrl: 'https://t.co/xyz', expandedUrl: 'https://example.com/2' }
    ]
    expect(expandUrls(text, links)).toBe('Link 1: https://example.com/1 and Link 2: https://example.com/2')
  })

  it('leaves non-matching URLs unchanged', () => {
    const text = 'Regular URL https://google.com and t.co https://t.co/unknown'
    const links = [
      { originalUrl: 'https://t.co/other', expandedUrl: 'https://example.com' }
    ]
    const result = expandUrls(text, links)
    expect(result).toContain('https://google.com')
  })

  it('handles empty links array', () => {
    const text = 'No links here https://t.co/abc'
    expect(expandUrls(text, [])).toBe(text)
  })

  it('handles null originalUrl in links', () => {
    const text = 'Some text https://t.co/abc'
    const links = [
      { originalUrl: null, expandedUrl: 'https://example.com' }
    ]
    // Should use positional matching for remaining t.co URLs
    expect(expandUrls(text, links)).toBe('Some text https://example.com')
  })

  it('skips tweet status links in positional matching', () => {
    const text = 'Tweet https://t.co/abc'
    const links = [
      { originalUrl: null, expandedUrl: 'https://twitter.com/user/status/123' },
      { originalUrl: null, expandedUrl: 'https://example.com/real-link' }
    ]
    // Should skip the status link and use the real link
    expect(expandUrls(text, links)).toBe('Tweet https://example.com/real-link')
  })
})

describe('truncateUrl', () => {
  it('returns short URLs unchanged', () => {
    expect(truncateUrl('https://example.com', 50)).toBe('example.com/')
  })

  it('truncates long URLs', () => {
    const longUrl = 'https://example.com/very/long/path/that/exceeds/the/limit'
    const result = truncateUrl(longUrl, 30)
    expect(result.length).toBe(30)
    expect(result.endsWith('...')).toBe(true)
  })

  it('handles invalid URLs gracefully', () => {
    expect(truncateUrl('not-a-url', 50)).toBe('not-a-url')
  })

  it('truncates invalid URLs that exceed max length', () => {
    const longString = 'a'.repeat(100)
    const result = truncateUrl(longString, 50)
    expect(result.length).toBe(50)
    expect(result.endsWith('...')).toBe(true)
  })

  it('uses default max length of 50', () => {
    const url = 'https://example.com/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s'
    const result = truncateUrl(url)
    expect(result.length).toBeLessThanOrEqual(50)
  })
})

describe('parseTextWithLinks', () => {
  it('parses text without links', () => {
    const result = parseTextWithLinks('Hello world')
    expect(result).toEqual([{ type: 'text', content: 'Hello world' }])
  })

  it('parses single link', () => {
    const result = parseTextWithLinks('Check https://example.com out')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ type: 'text', content: 'Check ' })
    expect(result[1].type).toBe('link')
    expect(result[1].url).toBe('https://example.com')
    expect(result[2]).toEqual({ type: 'text', content: ' out' })
  })

  it('parses multiple links', () => {
    const result = parseTextWithLinks('First https://a.com then https://b.com end')
    expect(result).toHaveLength(5)
    expect(result.filter(r => r.type === 'link')).toHaveLength(2)
  })

  it('handles link at start of text', () => {
    const result = parseTextWithLinks('https://start.com is the URL')
    expect(result[0].type).toBe('link')
    expect(result[0].url).toBe('https://start.com')
  })

  it('handles link at end of text', () => {
    const result = parseTextWithLinks('The URL is https://end.com')
    const lastItem = result[result.length - 1]
    expect(lastItem.type).toBe('link')
    expect(lastItem.url).toBe('https://end.com')
  })

  it('truncates long URLs in display content', () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(100)
    const result = parseTextWithLinks(`Check ${longUrl}`)
    const linkPart = result.find(r => r.type === 'link')
    expect(linkPart?.url).toBe(longUrl)
    expect(linkPart?.content.length).toBeLessThanOrEqual(50)
  })
})
