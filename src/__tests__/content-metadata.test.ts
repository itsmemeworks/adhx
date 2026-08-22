import { describe, it, expect } from 'vitest'
import {
  truncateWordBoundary,
  buildContentTitle,
  buildSnippetDescription,
  contentAfterTitle,
  attributionFact,
  previewPageMetadata,
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
    expect(buildContentTitle('A great video')).toBe('A great video')
  })

  it('truncates long content before suffixing', () => {
    const long = 'A '.repeat(50).trim()
    const title = buildContentTitle(long)
    // No brand suffix — the root layout's title template appends '| ADHX'.
    expect(title.includes('| ADHX')).toBe(false)
    expect(title.length).toBeLessThanOrEqual(60 + 1)
  })
})

describe('contentAfterTitle', () => {
  it('returns the text the title cut off', () => {
    const content = 'Introducing Canvas UI, the first ever html-in-canvas component library.'
    const title = 'Introducing Canvas UI, the first ever html-in-canvas…'
    expect(contentAfterTitle(title, content)).toBe('component library.')
  })

  it('ignores a trailing — @handle attribution on the title', () => {
    const content = 'Shipped the new renderer today, here is how it works'
    const title = 'Shipped the new renderer today,… — @davidhdev'
    expect(contentAfterTitle(title, content)).toBe('here is how it works')
  })

  it('returns nothing when the title already showed the whole post', () => {
    expect(contentAfterTitle('gm — @someone', 'gm')).toBe('')
  })

  it('returns the full content when the title is not derived from it', () => {
    const content = 'The body text of the article begins here.'
    expect(contentAfterTitle('An Unrelated Article Headline', content)).toBe(content)
  })

  it('normalizes URLs and whitespace out of the content', () => {
    const remainder = contentAfterTitle('Lead in…', 'Lead in   to https://example.com/x the rest')
    expect(remainder).toBe('to the rest')
  })
})

describe('attributionFact', () => {
  it('is suppressed when the title already names the author', () => {
    expect(attributionFact('Nice post — @jane', '@jane', 'X')).toBeUndefined()
  })

  it('names author and platform when the title does not', () => {
    expect(attributionFact('Nice post', '@jane', 'X')).toBe('@jane on X')
  })

  it('falls back to the bare platform when the author is unknown', () => {
    expect(attributionFact('Nice post', undefined, 'Instagram')).toBe('Instagram')
  })
})

describe('buildSnippetDescription', () => {
  const content =
    'Introducing Canvas UI, the first ever html-in-canvas component library. Your DOM is the render target now. Real-time shaders over live UI, at sixty frames per second.'
  const title = 'Introducing Canvas UI, the first ever html-in-canvas…'

  it('continues past the title instead of restating it', () => {
    const description = buildSnippetDescription({ title, content })
    // The regression this whole helper exists to prevent: a description that
    // re-cuts the same opening text carries no information past the headline.
    expect(description.startsWith('…')).toBe(true)
    expect(description).not.toContain('Introducing Canvas UI')
    expect(description).toContain('component library')
  })

  it('appends facts and the closer as a separated trail', () => {
    const description = buildSnippetDescription({
      title,
      content,
      facts: ['Video', '7.3K likes'],
      closer: 'Read the full post.',
    })
    expect(description).toContain(' · Video · 7.3K likes · Read the full post.')
    expect(description.endsWith('Read the full post.')).toBe(true)
  })

  it('stays within the 160-char budget so the closer is not cut off', () => {
    const description = buildSnippetDescription({
      title,
      content,
      facts: ['@davidhdev on X', 'Video', '7.3K likes, 652 reposts'],
      closer: 'Read the full post — no X account needed.',
    })
    expect(description.length).toBeLessThanOrEqual(160)
    expect(description.endsWith('Read the full post — no X account needed.')).toBe(true)
  })

  it('drops the continuation entirely when the title showed the whole post', () => {
    const description = buildSnippetDescription({
      title: 'gm — @someone',
      content: 'gm',
      facts: ['@someone on X'],
      closer: 'Read the full post.',
    })
    expect(description).toBe('@someone on X · Read the full post.')
  })

  it('drops a continuation too short to be worth showing', () => {
    const description = buildSnippetDescription({
      title: 'Almost all of it…',
      content: 'Almost all of it but tiny',
      closer: 'Read it.',
    })
    expect(description).toBe('Read it.')
  })

  it('leads with the full content when the title is not derived from it', () => {
    const description = buildSnippetDescription({
      title: 'An Article Headline',
      content: 'The body of the article explains the whole approach in detail.',
      facts: ['Article'],
      closer: 'Read it.',
    })
    expect(description.startsWith('The body of the article')).toBe(true)
    expect(description).toBe(
      'The body of the article explains the whole approach in detail. · Article · Read it.',
    )
  })

  it('works with no facts and no closer', () => {
    expect(
      buildSnippetDescription({ title: 'Lead…', content: 'Lead and then some more text' }),
    ).toBe('…and then some more text')
  })

  it('falls back to the trail alone when facts and closer fill the budget', () => {
    const description = buildSnippetDescription({
      title,
      content,
      facts: ['x'.repeat(150)],
      closer: 'Read the full post.',
    })
    expect(description.length).toBeLessThanOrEqual(160)
    expect(description).not.toContain('component library')
  })

  it('never emits an empty description when there is any content at all', () => {
    expect(buildSnippetDescription({ title: '', content: 'Some post text here' })).toBe(
      'Some post text here',
    )
  })
})

describe('previewPageMetadata', () => {
  it('advertises an MP4 as video.other and keeps the canonical', () => {
    const meta = previewPageMetadata({
      title: 'A Reel',
      description: 'Watch it.',
      canonicalUrl: 'https://adhx.com/reels/abc',
      image: 'https://adhx.com/api/media/instagram/thumbnail?id=abc',
      videoUrl: 'https://adhx.com/api/media/instagram/video?id=abc',
    })
    expect(meta).toMatchObject({
      title: 'A Reel',
      description: 'Watch it.',
      openGraph: {
        type: 'video.other',
        url: 'https://adhx.com/reels/abc',
        videos: [
          {
            url: 'https://adhx.com/api/media/instagram/video?id=abc',
            type: 'video/mp4',
            width: 1080,
            height: 1920,
          },
        ],
      },
      twitter: { card: 'summary_large_image' },
      alternates: { canonical: 'https://adhx.com/reels/abc' },
    })
  })

  it('falls back to article when there is no video, unless ogType is set', () => {
    const article = previewPageMetadata({
      title: 'A Reel',
      description: 'Watch it.',
      canonicalUrl: 'https://adhx.com/reels/abc',
      image: 'https://adhx.com/og-logo.png',
    })
    expect(article).toMatchObject({ openGraph: { type: 'article' } })
    expect(
      article.openGraph && 'videos' in article.openGraph ? article.openGraph.videos : undefined,
    ).toBeUndefined()

    const short = previewPageMetadata({
      title: 'A Short',
      description: 'Watch it.',
      canonicalUrl: 'https://adhx.com/shorts/dQw4w9wgXcQ',
      image: 'https://i.ytimg.com/vi/dQw4w9wgXcQ/hqdefault.jpg',
      ogType: 'video.other',
    })
    expect(short).toMatchObject({ openGraph: { type: 'video.other' } })
    expect(
      short.openGraph && 'videos' in short.openGraph ? short.openGraph.videos : undefined,
    ).toBeUndefined()
  })
})
