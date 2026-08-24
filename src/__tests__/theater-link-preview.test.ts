import { describe, it, expect } from 'vitest'
import {
  domainFromUrl,
  isOffsiteHttpUrl,
  isExternalLinkPreview,
  stripPreviewUrls,
  visibleTextForSizing,
  linkPreviewFromExternal,
  linkPreviewFromArticlePreview,
} from '@/lib/theater/link-preview'

describe('isOffsiteHttpUrl', () => {
  it('treats substack as off-site', () => {
    expect(
      isOffsiteHttpUrl('https://deanpiper.substack.com/p/hayden-panettiere-and-james-blunt'),
    ).toBe(true)
  })

  it('treats x.com and twitter.com as on-site', () => {
    expect(isOffsiteHttpUrl('https://x.com/foo/article/1')).toBe(false)
    expect(isOffsiteHttpUrl('https://twitter.com/foo/status/1')).toBe(false)
    expect(isOffsiteHttpUrl('https://mobile.twitter.com/foo')).toBe(false)
  })
})

describe('stripPreviewUrls', () => {
  const preview = {
    url: 'https://deanpiper.substack.com/p/hayden-panettiere-and-james-blunt',
  }

  it('drops the expanded URL so only the tweet prose remains', () => {
    expect(
      stripPreviewUrls(
        '👀\n\nhttps://deanpiper.substack.com/p/hayden-panettiere-and-james-blunt',
        preview,
      ),
    ).toBe('👀')
  })

  it('also drops the matching t.co short link', () => {
    expect(
      stripPreviewUrls('👀 https://t.co/abc', preview, [
        { shortUrl: 'https://t.co/abc', expandedUrl: preview.url },
      ]),
    ).toBe('👀')
  })
})

describe('visibleTextForSizing', () => {
  it('ignores URLs', () => {
    expect(visibleTextForSizing('👀 https://example.com/long-path')).toBe('👀')
    expect(visibleTextForSizing('https://example.com/only')).toBe('')
  })
})

describe('linkPreviewFromExternal', () => {
  it('builds a card from FxTwitter external OG', () => {
    expect(
      linkPreviewFromExternal({
        url: 'https://t.co/x',
        expanded_url: 'https://deanpiper.substack.com/p/hayden',
        display_url: 'deanpiper.substack.com',
        title: 'Hayden Panettiere and James Blunt',
        description: 'In a remarkable turn of events',
        thumbnail_url: 'https://substackcdn.com/image.jpg',
      }),
    ).toEqual({
      url: 'https://deanpiper.substack.com/p/hayden',
      title: 'Hayden Panettiere and James Blunt',
      description: 'In a remarkable turn of events',
      imageUrl: 'https://substackcdn.com/image.jpg',
      domain: 'deanpiper.substack.com',
    })
  })

  it('skips X Article URLs', () => {
    expect(
      linkPreviewFromExternal({
        expanded_url: 'https://x.com/foo/article/1',
        title: 'An X Article',
      }),
    ).toBeUndefined()
  })

  it('skips empty OG', () => {
    expect(linkPreviewFromExternal({ expanded_url: 'https://example.com' })).toBeUndefined()
  })
})

describe('linkPreviewFromArticlePreview', () => {
  it('maps an off-site collection preview', () => {
    expect(
      linkPreviewFromArticlePreview({
        url: 'https://example.com/post',
        title: 'A title',
        domain: 'example.com',
      }),
    ).toMatchObject({ url: 'https://example.com/post', title: 'A title' })
  })

  it('skips x.com article URLs so StageArticle keeps them', () => {
    expect(
      linkPreviewFromArticlePreview({
        url: 'https://x.com/foo/article/1',
        title: 'Army',
      }),
    ).toBeUndefined()
  })
})

describe('isExternalLinkPreview', () => {
  it('is true for an off-site card', () => {
    expect(isExternalLinkPreview({ linkPreview: { url: 'https://example.com/a' } })).toBe(true)
  })

  it('is false without a card', () => {
    expect(isExternalLinkPreview({})).toBe(false)
  })
})

describe('domainFromUrl', () => {
  it('strips www', () => {
    expect(domainFromUrl('https://www.example.com/x')).toBe('example.com')
  })
})
