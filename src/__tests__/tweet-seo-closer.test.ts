import { describe, it, expect } from 'vitest'
import {
  buildTweetTitle,
  buildTweetSeoDescription,
  buildTweetOgDescription,
} from '@/lib/utils/tweet-metadata'
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

describe('tweet social description', () => {
  it('does not repeat a short text post already shown in the title', () => {
    const tweet = stub({ text: 'just a thought' })
    const title = buildTweetTitle(tweet, 'someone')
    const description = buildTweetOgDescription(tweet, 'someone', title)

    expect(description).not.toContain('just a thought')
    expect(description).toBe('Read the full post — no X account needed.')
  })

  it('keeps quote and external-link context without restarting from the title', () => {
    const tweet = stub({
      text: 'my take on this',
      quote: {
        text: 'the useful quoted context',
        author: { screen_name: 'quoted' },
      },
      external: { title: 'The linked article' },
    })
    const title = buildTweetTitle(tweet, 'someone')
    const description = buildTweetOgDescription(tweet, 'someone', title)

    expect(description.startsWith('QT @quoted:')).toBe(true)
    expect(description).not.toContain('my take on this')
    expect(description).toContain('QT @quoted: "the useful quoted context"')
    expect(description).toContain('🔗 The linked article')
  })

  it('deduplicates linked titles that repeat the wrapper post title', () => {
    const tweet = stub({
      text: 'The linked article',
      external: { title: 'The linked article' },
    })
    const title = buildTweetTitle(tweet, 'someone')
    const description = buildTweetOgDescription(tweet, 'someone', title)

    expect(description).not.toContain('The linked article')
    expect(description).not.toContain('🔗')
  })

  it('continues a contextual title that starts with the wrapper title', () => {
    const tweet = stub({
      text: 'The linked article',
      external: { title: 'The linked article: explains the remaining details' },
    })
    const title = buildTweetTitle(tweet, 'someone')
    const description = buildTweetOgDescription(tweet, 'someone', title)

    expect(description).not.toContain('The linked article')
    expect(description).toContain('🔗 …explains the remaining details')
    expect(description).not.toContain('…:')
  })

  it('keeps distinct short context that only shares a word prefix with the title', () => {
    const tweet = stub({
      text: 'Artificial intelligence changes everything',
      external: { title: 'Art' },
    })
    const title = buildTweetTitle(tweet, 'someone')
    const description = buildTweetOgDescription(tweet, 'someone', title)

    expect(description).toContain('🔗 Art')
  })

  it('does not repeat an article headline when no preview text is available', () => {
    const tweet = stub({
      article: { title: 'The exact article headline' },
    })
    const title = buildTweetTitle(tweet, 'someone')
    const description = buildTweetOgDescription(tweet, 'someone', title)

    expect(title).toBe('The exact article headline')
    expect(description).not.toContain(title)
    expect(description).toContain('Article')
  })

  it('reserves room for facts and the CTA on a maximally rich post', () => {
    const tweet = stub({
      text: 'Wrapper opening '.repeat(30),
      quote: {
        text: 'Quoted context '.repeat(30),
        author: { screen_name: 'quotedaccount' },
      },
      external: { title: 'External article context '.repeat(20) },
      media: { videos: [{ url: 'one' }, { url: 'two' }] },
      likes: 123_456,
      retweets: 12_345,
    })
    const title = buildTweetTitle(tweet, 'fifteencharuser')
    const description = buildTweetOgDescription(tweet, 'fifteencharuser', title)

    expect(description.length).toBeLessThanOrEqual(500)
    expect(description.startsWith('QT @quotedaccount:')).toBe(true)
    expect(description).toContain('2 videos')
    expect(description).toContain('123.5K likes, 12.3K reposts')
    expect(description.endsWith('Watch and send it — no X app needed.')).toBe(true)
  })
})
