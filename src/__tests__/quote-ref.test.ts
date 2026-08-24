import { describe, expect, it } from 'vitest'
import { quoteRefFromSource, quoteRefFromStoredContext } from '@/lib/theater/quote-ref'

describe('quoteRefFromSource', () => {
  it('returns undefined when there is no author or text', () => {
    expect(quoteRefFromSource({})).toBeUndefined()
    expect(quoteRefFromSource({ author: { screen_name: '' }, text: '' })).toBeUndefined()
  })

  it('maps FxTwitter quote media onto proxied photo URLs', () => {
    const ref = quoteRefFromSource({
      id: '99',
      text: 'quoted',
      author: { screen_name: 'mark_k', name: 'Mark', avatar_url: 'https://pbs.twimg.com/a.jpg' },
      media: {
        photos: [
          { url: 'https://pbs.twimg.com/media/one.jpg' },
          { url: 'https://pbs.twimg.com/media/two.jpg' },
        ],
      },
    })
    expect(ref).toMatchObject({
      author: 'mark_k',
      authorName: 'Mark',
      text: 'quoted',
      bookmarkId: '99',
    })
    expect(ref?.photoUrls).toEqual([
      '/api/media/image?author=mark_k&tweetId=99&index=1',
      '/api/media/image?author=mark_k&tweetId=99&index=2',
    ])
    expect(ref?.thumbnailUrl).toBe(ref?.photoUrls?.[0])
    expect(ref?.hasVideo).toBeUndefined()
  })

  it('flags a quoted tweet that has a video', () => {
    const ref = quoteRefFromSource({
      id: '88',
      text: 'watch this',
      author: { screen_name: 'bot' },
      media: {
        videos: [{ thumbnail_url: 'https://pbs.twimg.com/ext_tw_video_thumb/1.jpg' }],
      },
    })
    expect(ref?.hasVideo).toBe(true)
    expect(ref?.thumbnailUrl).toBe('https://pbs.twimg.com/ext_tw_video_thumb/1.jpg')
    expect(ref?.photoUrls).toBeUndefined()
  })
})

describe('quoteRefFromStoredContext', () => {
  it('maps saved quoteContext media', () => {
    const ref = quoteRefFromStoredContext({
      tweetId: '55',
      author: 'alice',
      authorName: 'Alice',
      text: 'hello',
      media: { photos: [{ url: 'https://pbs.twimg.com/media/x.jpg' }] },
    })
    expect(ref?.bookmarkId).toBe('55')
    expect(ref?.photoUrls).toEqual(['/api/media/image?author=alice&tweetId=55&index=1'])
  })
})
