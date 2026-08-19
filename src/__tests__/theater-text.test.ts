import { describe, it, expect } from 'vitest'
import { splitTextParts, displayUrl } from '@/components/theater/TheaterText'

describe('splitTextParts', () => {
  it('returns a single text part when there are no URLs', () => {
    expect(splitTextParts('just some words')).toEqual([{ type: 'text', value: 'just some words' }])
  })

  it('splits URLs out as link parts', () => {
    expect(splitTextParts('look https://t.co/abc123 wow')).toEqual([
      { type: 'text', value: 'look ' },
      { type: 'link', href: 'https://t.co/abc123' },
      { type: 'text', value: ' wow' },
    ])
  })

  it('handles multiple URLs and http', () => {
    const parts = splitTextParts('a https://x.com/1 b http://y.com/2')
    expect(parts.filter((p) => p.type === 'link').map((p) => (p as { href: string }).href)).toEqual(
      ['https://x.com/1', 'http://y.com/2'],
    )
  })

  it('handles a line that is only a URL', () => {
    expect(splitTextParts('https://example.com/path')).toEqual([
      { type: 'link', href: 'https://example.com/path' },
    ])
  })

  it('does not linkify bare domains or scheme-less text', () => {
    expect(splitTextParts('see example.com now')).toEqual([
      { type: 'text', value: 'see example.com now' },
    ])
  })

  it('handles empty input', () => {
    expect(splitTextParts('')).toEqual([])
  })
})

describe('displayUrl', () => {
  it('passes short URLs through', () => {
    expect(displayUrl('https://t.co/abc')).toBe('https://t.co/abc')
  })

  it('shortens long URLs to 40 chars + ellipsis', () => {
    const long = `https://example.com/${'a'.repeat(60)}`
    const out = displayUrl(long)
    expect(out.endsWith('...')).toBe(true)
    expect(out.length).toBe(43)
  })
})
