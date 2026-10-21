import { describe, expect, it, vi } from 'vitest'
import { decodeHtmlEntities } from '@/lib/feed/post-body'
import type { FeedItemResponse } from '@/lib/feed/build-item'

vi.mock('@/lib/db', () => ({ db: {}, runInTransaction: (fn: () => unknown) => fn() }))

const { toPhonePost } = await import('@/lib/app/phone-post')

describe('phone post words', () => {
  it('swaps t.co links for where they go, so the apps can open them', () => {
    const post = {
      platform: 'twitter',
      id: '1',
      author: 'ana',
      authorName: 'Ana',
      authorProfileImageUrl: null,
      text: 'thank me later &amp; read this https://t.co/abc123 and https://t.co/gone99',
      createdAt: null,
      processedAt: null,
      category: 'tweet',
      tweetUrl: null,
      media: [],
      links: [{ originalUrl: 'https://t.co/abc123', expandedUrl: 'https://example.com/post' }],
      savers: [],
      isPrivate: false,
    } as unknown as FeedItemResponse
    const phone = toPhonePost({ post, saved: true, matched: [], strength: 'good' }, false)
    expect(phone.text).toBe('thank me later & read this https://example.com/post and')
  })
})

describe('numeric HTML entities', () => {
  it.each([
    '&#1114112;',
    '&#x110000;',
    '&#999999999999999999999999999999999999999;',
    '&#0;',
    '&#xD800;',
  ])('replaces invalid Unicode without throwing: %s', (input) => {
    expect(decodeHtmlEntities(`before ${input} after`)).toBe('before \uFFFD after')
  })
  it('keeps valid Unicode and decodes only once as plain text', () => {
    expect(decodeHtmlEntities('&#128514; &#x1f602; &#39; &amp; &lt;b&gt;')).toBe("😂 😂 ' & <b>")
    expect(decodeHtmlEntities('&amp;#1114112;')).toBe('&#1114112;')
  })
})
