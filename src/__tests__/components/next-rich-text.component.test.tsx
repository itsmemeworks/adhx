// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { FeedItem } from '@/components/feed/types'
import { RichText, externalUrl, postBody, withoutCardUrl } from '@/components/next/rich-text'
import { isRealArticle, nextPostKind } from '@/components/next/post'

function post(partial: Partial<FeedItem>): FeedItem {
  return {
    id: '1',
    platform: 'twitter',
    author: 'a',
    authorName: 'A',
    authorProfileImageUrl: null,
    text: '',
    tweetUrl: 'https://x.com/a/status/1',
    processedAt: '2026-10-16T09:00:00.000Z',
    isArchived: false,
    media: null,
    links: null,
    tags: [],
    ...partial,
  } as FeedItem
}

describe('post words', () => {
  it('keeps paragraphs and swaps short links for where they go', () => {
    const item = post({
      text: 'First line.\n\n\n\nSecond   paragraph\nwith a break https://t.co/abc and https://t.co/zzz',
      links: [
        {
          id: 1,
          bookmarkId: '1',
          originalUrl: 'https://t.co/abc',
          expandedUrl: 'https://mkdir.directory',
        },
      ],
    })
    expect(postBody(item)).toBe(
      'First line.\n\nSecond paragraph\nwith a break https://mkdir.directory and',
    )
  })

  it('renders paragraphs with clickable links, mentions and hashtags', () => {
    render(
      <RichText
        text={'Chiming in on @levelsio’s thread.\n\nSee https://mkdir.directory/tools #design'}
      />,
    )
    expect(document.querySelectorAll('p')).toHaveLength(2)
    expect(screen.getByRole('link', { name: '@levelsio' })).toHaveAttribute(
      'href',
      'https://x.com/levelsio',
    )
    expect(screen.getByRole('link', { name: 'mkdir.directory/tools' })).toHaveAttribute(
      'href',
      'https://mkdir.directory/tools',
    )
    expect(screen.getByRole('link', { name: '#design' })).toHaveAttribute(
      'href',
      'https://x.com/hashtag/design',
    )
  })

  it('finds the page a post links to and drops it from the text when the card shows it', () => {
    const text = 'Thank me later -> https://mkdir.directory'
    expect(externalUrl('see https://x.com/a/status/2 and https://example.com/a.')).toBe(
      'https://example.com/a',
    )
    const card = {
      url: 'https://mkdir.directory',
      title: 'mkdir',
      description: null,
      image: null,
      site: 'mkdir.directory',
    }
    expect(withoutCardUrl(text, card)).toBe('Thank me later ->')
    expect(withoutCardUrl(text, null)).toBe(text)
  })
})

describe('what counts as an article', () => {
  it('is a real article only with a body, an X article link or a real preview', () => {
    const blogLink = post({
      category: 'article',
      text: 'Here is how it works https://www.serprecon.com/blog/x',
      articlePreview: {
        title: 'Article by @RyanJones',
        description: null,
        imageUrl: null,
        url: 'https://x.com/RyanJones/article/1',
      },
    } as Partial<FeedItem>)
    expect(isRealArticle(blogLink)).toBe(false)
    expect(nextPostKind(blogLink)).toBe('post')
    const xArticle = post({
      category: 'article',
      text: 'https://x.com/i/article/2110760422609408000',
    } as Partial<FeedItem>)
    expect(isRealArticle(xArticle)).toBe(true)
  })
})
