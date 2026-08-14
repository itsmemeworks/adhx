import { describe, it, expect } from 'vitest'
import { buildTweetTitle, buildTweetSeoDescription } from '@/lib/utils/tweet-metadata'
import type { FxTwitterResponse } from '@/lib/media/fxembed'

type Tweet = NonNullable<FxTwitterResponse['tweet']>

function stub(partial: Record<string, unknown>): Tweet {
  return {
    text: '',
    likes: 0,
    retweets: 0,
    author: { screen_name: 'someone', name: 'Someone' },
    ...partial,
  } as unknown as Tweet
}

describe('tweet SERP closer', () => {
  it('tells video tweets they can watch and send without the X app', () => {
    const tweet = stub({
      text: 'check this clip',
      media: { videos: [{ url: 'https://video.twimg.com/x.mp4' }] },
    })
    const title = buildTweetTitle(tweet, 'someone')
    const description = buildTweetSeoDescription(tweet, 'someone', title)
    expect(description.endsWith('Watch and send it — no X app needed.')).toBe(true)
  })

  it('keeps the read-without-login closer for text posts', () => {
    const tweet = stub({ text: 'just a thought' })
    const title = buildTweetTitle(tweet, 'someone')
    const description = buildTweetSeoDescription(tweet, 'someone', title)
    expect(description.endsWith('Read the full post — no X account needed.')).toBe(true)
  })
})
