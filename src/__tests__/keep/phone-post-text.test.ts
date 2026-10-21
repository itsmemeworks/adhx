import { describe, expect, it, vi } from 'vitest'
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
