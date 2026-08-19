import { describe, it, expect } from 'vitest'
import {
  splitTextParts,
  displayUrl,
  cleanDisplayUrl,
  resolveLink,
  isTrailingLink,
  buildRenderSegments,
} from '@/components/theater/TheaterText'
import type { TextLinkRef } from '@/components/theater/types'

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

describe('cleanDisplayUrl', () => {
  it('strips the protocol', () => {
    expect(cleanDisplayUrl('https://example.com/path')).toBe('example.com/path')
    expect(cleanDisplayUrl('http://example.com/path')).toBe('example.com/path')
  })

  it('strips a leading www.', () => {
    expect(cleanDisplayUrl('https://www.example.com/path')).toBe('example.com/path')
  })

  it('truncates to 40 chars + ellipsis after cleaning', () => {
    const long = `https://www.example.com/${'a'.repeat(60)}`
    const out = cleanDisplayUrl(long)
    expect(out.endsWith('...')).toBe(true)
    expect(out.length).toBe(43)
    expect(out.startsWith('example.com/')).toBe(true)
  })

  it('leaves a short bare host untouched', () => {
    expect(cleanDisplayUrl('https://example.com')).toBe('example.com')
  })
})

const externalLink: TextLinkRef = {
  shortUrl: 'https://t.co/ext1',
  expandedUrl: 'https://www.somesite.com/a-real-article-with-a-long-slug-here',
  linkType: 'link',
}

const tweetLink: TextLinkRef = {
  shortUrl: 'https://t.co/tw1',
  expandedUrl: 'https://x.com/someuser/status/1234567890',
  linkType: 'tweet',
}

const inferredTweetLink: TextLinkRef = {
  shortUrl: 'https://t.co/tw2',
  expandedUrl: 'https://twitter.com/otheruser/status/999',
  // linkType omitted — must be inferred from the expandedUrl shape.
}

describe('resolveLink', () => {
  it('resolves a known external link to its expanded, cleaned href', () => {
    const res = resolveLink('https://t.co/ext1', [externalLink], false, false)
    expect(res).toEqual({
      kind: 'anchor',
      href: externalLink.expandedUrl,
      label: cleanDisplayUrl(externalLink.expandedUrl),
      tail: '',
    })
  })

  it('keeps a known tweet link expanded when hideTweetLinks is not set', () => {
    const res = resolveLink('https://t.co/tw1', [tweetLink], false, false)
    expect(res).toEqual({
      kind: 'anchor',
      href: tweetLink.expandedUrl,
      label: cleanDisplayUrl(tweetLink.expandedUrl),
      tail: '',
    })
  })

  it('strips a known tweet link when hideTweetLinks is set', () => {
    const res = resolveLink('https://t.co/tw1', [tweetLink], true, false)
    expect(res).toEqual({ kind: 'strip', tail: '' })
  })

  it('infers a tweet link from the expandedUrl shape when linkType is absent', () => {
    const res = resolveLink('https://t.co/tw2', [inferredTweetLink], true, false)
    expect(res).toEqual({ kind: 'strip', tail: '' })
  })

  it('strips an unresolved trailing t.co only when hideTweetLinks is set and it is trailing', () => {
    expect(resolveLink('https://t.co/unknown', [], true, true)).toEqual({ kind: 'strip', tail: '' })
    expect(resolveLink('https://t.co/unknown', [], false, true)).toEqual({
      kind: 'anchor',
      href: 'https://t.co/unknown',
      label: displayUrl('https://t.co/unknown'),
      tail: '',
    })
  })

  it('never strips an unresolved t.co that is not trailing, even with hideTweetLinks', () => {
    const res = resolveLink('https://t.co/unknown', [], true, false)
    expect(res).toEqual({
      kind: 'anchor',
      href: 'https://t.co/unknown',
      label: displayUrl('https://t.co/unknown'),
      tail: '',
    })
  })

  it('does not touch a non-t.co unresolved trailing link even with hideTweetLinks', () => {
    const res = resolveLink('https://example.com/page', [], true, true)
    expect(res.kind).toBe('anchor')
  })

  it('handles empty/absent links exactly like an unresolved URL', () => {
    expect(resolveLink('https://t.co/abc123', undefined, false, false)).toEqual({
      kind: 'anchor',
      href: 'https://t.co/abc123',
      label: displayUrl('https://t.co/abc123'),
      tail: '',
    })
  })

  describe('punctuation-tail handling', () => {
    it('matches a known shortUrl through a single trailing punctuation char', () => {
      const res = resolveLink('https://t.co/ext1.', [externalLink], false, false)
      expect(res).toEqual({
        kind: 'anchor',
        href: externalLink.expandedUrl,
        label: cleanDisplayUrl(externalLink.expandedUrl),
        tail: '.',
      })
    })

    it('matches through multiple trailing punctuation chars, finding the longest matching prefix', () => {
      const res = resolveLink('https://t.co/ext1).', [externalLink], false, false)
      expect(res).toEqual({
        kind: 'anchor',
        href: externalLink.expandedUrl,
        label: cleanDisplayUrl(externalLink.expandedUrl),
        tail: ').',
      })
    })

    it('carries the tail through a strip too', () => {
      const res = resolveLink('https://t.co/tw1!', [tweetLink], true, false)
      expect(res).toEqual({ kind: 'strip', tail: '!' })
    })

    it('leaves an unknown href with punctuation untouched (no matching base found)', () => {
      const res = resolveLink('https://t.co/unknown.', [externalLink], false, false)
      expect(res).toEqual({
        kind: 'anchor',
        href: 'https://t.co/unknown.',
        label: displayUrl('https://t.co/unknown.'),
        tail: '',
      })
    })
  })
})

describe('isTrailingLink', () => {
  it('is true for the only link in the text', () => {
    const parts = splitTextParts('hello https://t.co/a')
    expect(isTrailingLink(parts, 1)).toBe(true)
  })

  it('is true when only whitespace (including newlines) follows', () => {
    const parts = splitTextParts('hello https://t.co/a  \n ')
    expect(isTrailingLink(parts, 1)).toBe(true)
  })

  it('is false when another link follows', () => {
    const parts = splitTextParts('https://t.co/a https://t.co/b')
    expect(isTrailingLink(parts, 0)).toBe(false)
    expect(isTrailingLink(parts, 2)).toBe(true)
  })

  it('is false when non-whitespace text follows', () => {
    const parts = splitTextParts('https://t.co/a and more')
    expect(isTrailingLink(parts, 0)).toBe(false)
  })
})

describe('buildRenderSegments', () => {
  it('behaves exactly like today when links/hideTweetLinks are absent', () => {
    const segs = buildRenderSegments('look https://t.co/abc123 wow', undefined, undefined)
    expect(segs).toEqual([
      { type: 'text', value: 'look ' },
      { type: 'anchor', href: 'https://t.co/abc123', label: displayUrl('https://t.co/abc123') },
      { type: 'text', value: ' wow' },
    ])
  })

  it('swaps in the expanded, cleaned href for a known external link', () => {
    const segs = buildRenderSegments('check this out https://t.co/ext1 nice', [externalLink], false)
    expect(segs).toEqual([
      { type: 'text', value: 'check this out ' },
      {
        type: 'anchor',
        href: externalLink.expandedUrl,
        label: cleanDisplayUrl(externalLink.expandedUrl),
      },
      { type: 'text', value: ' nice' },
    ])
  })

  it('strips a trailing known tweet link and collapses the doubled whitespace', () => {
    const segs = buildRenderSegments('great point https://t.co/tw1', [tweetLink], true)
    expect(segs).toEqual([{ type: 'text', value: 'great point' }])
  })

  it('strips a mid-text known tweet link and collapses whitespace on both sides', () => {
    const segs = buildRenderSegments('before https://t.co/tw1 after', [tweetLink], true)
    expect(segs).toEqual([{ type: 'text', value: 'before after' }])
  })

  it('strips an unresolved trailing t.co under hideTweetLinks, trimming the edge', () => {
    const segs = buildRenderSegments('quoting this https://t.co/unresolved', [], true)
    expect(segs).toEqual([{ type: 'text', value: 'quoting this' }])
  })

  it('never strips an unresolved mid-text t.co, even under hideTweetLinks', () => {
    const segs = buildRenderSegments('see https://t.co/unresolved for details', [], true)
    expect(segs).toEqual([
      { type: 'text', value: 'see ' },
      {
        type: 'anchor',
        href: 'https://t.co/unresolved',
        label: displayUrl('https://t.co/unresolved'),
      },
      { type: 'text', value: ' for details' },
    ])
  })

  it('keeps a known tweet link expanded (not stripped) when hideTweetLinks is false', () => {
    const segs = buildRenderSegments('quoting this https://t.co/tw1', [tweetLink], false)
    expect(segs).toEqual([
      { type: 'text', value: 'quoting this ' },
      {
        type: 'anchor',
        href: tweetLink.expandedUrl,
        label: cleanDisplayUrl(tweetLink.expandedUrl),
      },
    ])
  })
})
