import { describe, it, expect } from 'vitest'
import { decodeHtmlEntities } from '@/lib/utils/html-entities'

/**
 * `decodeHtmlEntities` decodes in a single regex pass over the original
 * string, so it can't double-unescape (js/double-escaping): a literal
 * `&amp;lt;` in the source must decode to the text `&lt;`, never all the way
 * to `<`, because that would require re-scanning output the decoder itself
 * produced.
 */
describe('decodeHtmlEntities', () => {
  it('decodes the common named and numeric entities', () => {
    expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry')
    expect(decodeHtmlEntities('&lt;div&gt;')).toBe('<div>')
    expect(decodeHtmlEntities('&quot;quoted&quot;')).toBe('"quoted"')
    expect(decodeHtmlEntities('&#39;s and &#x27;s')).toBe("'s and 's")
    expect(decodeHtmlEntities('a&#x2F;b')).toBe('a/b')
    expect(decodeHtmlEntities('&apos;apostrophe&apos;')).toBe("'apostrophe'")
    expect(decodeHtmlEntities('&#x22;alt-quote&#x22;')).toBe('"alt-quote"')
    expect(decodeHtmlEntities('&#34;alt-quote-2&#34;')).toBe('"alt-quote-2"')
    expect(decodeHtmlEntities('a&nbsp;b')).toBe('a b')
  })

  it('does not double-decode a literal escaped entity', () => {
    // The source text is a literal, escaped "&lt;" — i.e. someone wanted the
    // reader to see the text "&lt;", not a "<". A chained/ordered decode that
    // resolves &amp; before &lt; turns this into "<" by mistake.
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;')
    expect(decodeHtmlEntities('&amp;amp;')).toBe('&amp;')
    expect(decodeHtmlEntities('&amp;#39;')).toBe('&#39;')
  })

  it('is case-insensitive for hex entities', () => {
    expect(decodeHtmlEntities('a&#X2F;b')).toBe('a/b')
  })

  it('leaves unrecognised entities untouched', () => {
    expect(decodeHtmlEntities('&foo;bar')).toBe('&foo;bar')
  })
})
