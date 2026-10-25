import { expect, it } from 'vitest'
import { buildPostDocument } from '@/lib/semantic/documents'
import type { FeedItemResponse } from '@/lib/feed/build-item'

it('keeps all model hashes stable across the browser cache URL upgrade', () => {
  const post = (query: string) =>
    ({
      id: '1',
      platform: 'twitter',
      author: 'author',
      text: 'A useful clip',
      media: [
        {
          mediaType: 'video',
          url: `/api/files/twitter/1/video-1?a=author${query}`,
          thumbnailUrl: `/api/files/twitter/1/poster?a=author${query}`,
          durationMs: 10000,
        },
      ],
    }) as FeedItemResponse
  const before = buildPostDocument(post(''))
  const after = buildPostDocument(post('&v=2'))
  expect(after.video!.url).toContain('&v=2')
  for (const kind of ['image', 'video', 'speech', 'screen'] as const)
    expect(after[kind]!.hash, kind).toBe(before[kind]!.hash)
  expect(after.textHash).toBe(before.textHash)
})

it('still invalidates media identity when the actual retained slot changes', () => {
  const doc = (slot: string) =>
    buildPostDocument({
      id: '1',
      platform: 'twitter',
      text: 'clip',
      media: [{ mediaType: 'video', url: `/api/files/twitter/1/${slot}?v=2` }],
    } as FeedItemResponse)
  expect(doc('video-1').video!.hash).not.toBe(doc('video-2').video!.hash)
})
