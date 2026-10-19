import type { FeedItem } from '@/components/feed/types'

/**
 * Signed-out fallback for /dev/next-ui. No media URLs — media tiles show their
 * bare surface — so sign in to review the primitives with real saves.
 */
function sample(partial: Partial<FeedItem> & Pick<FeedItem, 'id' | 'author' | 'text'>): FeedItem {
  return {
    authorName: null,
    authorProfileImageUrl: null,
    tweetUrl: `https://x.com/${partial.author}/status/${partial.id}`,
    processedAt: '2026-10-16T09:00:00.000Z',
    isArchived: false,
    media: null,
    links: null,
    tags: [],
    ...partial,
  }
}

export const SAMPLE_ITEMS: FeedItem[] = [
  sample({
    id: 'sample-video',
    author: 'sample_video',
    authorName: 'A tall video',
    text: 'A portrait clip — sign in to see your own saved videos here.',
    media: [
      {
        id: 'sample-video_1',
        mediaType: 'video',
        width: 720,
        height: 1280,
        durationMs: 41_000,
        url: '',
        thumbnailUrl: '',
        shareUrl: '',
      },
    ],
  }),
  sample({
    id: 'sample-album',
    author: 'sample_photos',
    text: 'Three photos in one post',
    media: [1, 2, 3].map((n) => ({
      id: `sample-album_${n}`,
      mediaType: 'photo',
      width: 1200,
      height: 1500,
      url: '',
      thumbnailUrl: '',
      shareUrl: '',
    })),
    platform: 'instagram',
  }),
  sample({
    id: 'sample-post',
    author: 'sample_writer',
    authorName: 'Someone worth reading',
    text: 'The best posts read like a pull quote: short, a little surprising, and set big enough to feel it.',
    links: [
      {
        id: 1,
        bookmarkId: 'sample-post',
        expandedUrl: 'https://transitions.dev',
        domain: 'transitions.dev',
      },
    ],
  }),
  sample({
    id: 'sample-article',
    author: 'sample_essays',
    authorName: 'Long reads',
    text: '',
    category: 'article',
    articlePreview: {
      title: 'Why you waste your evenings',
      description:
        'You are on the sofa. You know you should get up — exercise, read, cook a real meal — but you cannot make yourself move.',
      url: 'https://example.com/evenings',
      domain: 'example.com',
    },
  }),
]
