import { describe, it, expect } from 'vitest'
import {
  truncateWordBoundary,
  buildContentTitle,
  buildContentDescription,
} from '@/lib/utils/content-metadata'

describe('truncateWordBoundary', () => {
  it('returns short text unchanged', () => {
    expect(truncateWordBoundary('hello world', 60)).toBe('hello world')
  })

  it('cuts at a word boundary and appends an ellipsis', () => {
    const text = 'This is a long sentence that definitely exceeds sixty characters in total length'
    const result = truncateWordBoundary(text, 60)
    expect(result.length).toBeLessThanOrEqual(61) // 60 + ellipsis
    expect(result.endsWith('…')).toBe(true)
    // Never cuts mid-word: strip the ellipsis and it should end on a word char,
    // not have a partial word glued to the boundary.
    expect(result.slice(0, -1).endsWith(' ')).toBe(false)
    expect(text.startsWith(result.slice(0, -1))).toBe(true)
  })

  it('strips URLs before truncating', () => {
    const result = truncateWordBoundary('Check this out https://example.com/very/long/path', 60)
    expect(result).not.toContain('http')
  })

  it('collapses internal whitespace', () => {
    expect(truncateWordBoundary('hello   \n\n  world', 60)).toBe('hello world')
  })

  it('falls back to a hard cut when there is no reasonable word boundary', () => {
    const text = 'a'.repeat(100)
    const result = truncateWordBoundary(text, 60)
    expect(result).toBe(`${'a'.repeat(60)}…`)
  })
})

describe('buildContentTitle', () => {
  it('brand-suffixes the content', () => {
    expect(buildContentTitle('A great video')).toBe('A great video | ADHX')
  })

  it('truncates long content before suffixing', () => {
    const long = 'A '.repeat(50).trim()
    const title = buildContentTitle(long)
    expect(title.endsWith(' | ADHX')).toBe(true)
    expect(title.length).toBeLessThanOrEqual(60 + ' | ADHX'.length + 1)
  })
})

describe('buildContentDescription', () => {
  it('truncates to ~160 chars with no suffix', () => {
    const long = 'word '.repeat(60).trim()
    const description = buildContentDescription(long)
    expect(description.length).toBeLessThanOrEqual(161)
  })

  it('appends a suffix and reduces the truncation budget accordingly', () => {
    const long = 'word '.repeat(60).trim()
    const suffix = ' (1.4K likes)'
    const description = buildContentDescription(long, suffix)
    expect(description.endsWith(suffix)).toBe(true)
    expect(description.length).toBeLessThanOrEqual(160)
  })

  it('returns short content unchanged when there is no suffix', () => {
    expect(buildContentDescription('short caption')).toBe('short caption')
  })
})
