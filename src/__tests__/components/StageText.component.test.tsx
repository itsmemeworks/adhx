/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/theater/share-tweet', () => ({
  fetchShareTweet: vi.fn().mockResolvedValue(null),
}))
import { render, screen } from '@testing-library/react'
import { StageText } from '@/components/theater/StageText'
import { STAGE_TEXT_SCROLL_PAD, STAGE_TEXT_TOP_PAD } from '@/components/theater/stage-primitives'
import type { TheaterItem } from '@/components/theater/types'

function textItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '20',
    author: 'jack',
    authorName: 'jack',
    authorAvatarUrl: 'https://example.com/jack.jpg',
    text: 'just setting up my twttr',
    thumbnailUrl: null,
    url: '/jack/status/20',
    createdAt: '2006-03-21T00:00:00Z',
    saveCount: 1,
    trendCount: 1,
    contentType: 'text',
    ...overrides,
  } as TheaterItem
}

describe('StageText author row', () => {
  it('links the avatar and username to the author profile', () => {
    render(<StageText item={textItem()} />)
    const profile = screen.getByTitle('View @jack on X')
    expect(profile).toHaveAttribute('href', 'https://x.com/jack')
    expect(profile).toHaveAttribute('target', '_blank')
    expect(profile).toHaveTextContent('jack')
    expect(profile).toHaveTextContent('@jack')
    expect(screen.getByRole('img', { name: 'jack' })).toBeInTheDocument()
  })

  it('renders a plain row when there is no handle', () => {
    render(<StageText item={textItem({ author: '', authorName: undefined })} />)
    expect(screen.queryByTitle(/^View @/)).not.toBeInTheDocument()
    expect(screen.getByText('Saved post')).toBeInTheDocument()
  })

  it('pads the typeset scroll so the last lines can sit above the action row', () => {
    render(<StageText item={textItem()} />)
    const scroller = document.querySelector('.overflow-y-auto')
    expect(scroller?.className).toContain(STAGE_TEXT_SCROLL_PAD)
  })

  it('skips the pad when a parent scroller already clears the actions', () => {
    render(<StageText item={textItem()} scrollPad={false} />)
    const scroller = document.querySelector('.overflow-y-auto')
    expect(scroller?.className).not.toContain(STAGE_TEXT_SCROLL_PAD)
  })

  it('clears the top chrome and vertically centers a short typeset tweet', () => {
    render(<StageText item={textItem()} />)
    const scroller = document.querySelector('.overflow-y-auto')
    const frame = scroller?.firstElementChild
    const column = frame?.firstElementChild
    expect(frame?.className).toContain('min-h-full')
    expect(frame?.className).toContain('justify-center')
    expect(column?.className).toContain(STAGE_TEXT_TOP_PAD)
  })

  it('sits flush under a live video band without the chrome pad or vertical center', () => {
    render(<StageText item={textItem()} flushTop />)
    const scroller = document.querySelector('.overflow-y-auto')
    const frame = scroller?.firstElementChild
    const column = frame?.firstElementChild
    expect(frame?.className).not.toContain('justify-center')
    expect(column?.className).not.toContain(STAGE_TEXT_TOP_PAD)
  })

  it('shows the full quoted tweet, not a four-line clamp', () => {
    const quoted =
      'Did you know Elon Musk was weirdly predicted in a Wernher von Braun book nearly 80 years ago? In his 1948 novel Project Mars, von Braun describes a future Martian government led by a figure called the Elon.'
    render(
      <StageText
        item={textItem({
          author: 'elonmusk',
          authorName: 'Elon Musk',
          text: 'As foretold in the prophecy',
          contentType: 'quote',
          quote: {
            author: 'mark_k',
            authorName: 'Mark Kretschmann',
            text: quoted,
            bookmarkId: '2091609069639315528',
          },
        })}
      />,
    )
    expect(screen.getByText(quoted)).toBeInTheDocument()
    const quoteBody = screen.getByText(quoted).closest('p')
    expect(quoteBody?.className).not.toContain('line-clamp-4')
    expect(screen.getByTitle('View @mark_k on X')).toBeInTheDocument()
  })

  it('renders quoted photos when the quote carries them', () => {
    render(
      <StageText
        item={textItem({
          contentType: 'quote',
          quote: {
            author: 'mark_k',
            text: 'with a photo',
            photoUrls: ['/api/media/image?author=mark_k&tweetId=1&index=1'],
          },
        })}
      />,
    )
    expect(screen.getByTestId('quote-photo')).toHaveAttribute(
      'src',
      '/api/media/image?author=mark_k&tweetId=1&index=1',
    )
  })

  it('plays parent and quoted videos inline in the reader', () => {
    render(
      <StageText
        item={textItem({
          author: 'XRoboHub',
          bookmarkId: '2091399015971864972',
          contentType: 'video',
          text: 'parent essay about the clip',
          thumbnailUrl: 'https://example.com/parent-poster.jpg',
          quote: {
            author: 'XRoboHub',
            text: 'the quoted clip',
            bookmarkId: '2091018327875518851',
            hasVideo: true,
            thumbnailUrl: 'https://example.com/quote-poster.jpg',
          },
        })}
      />,
    )
    expect(screen.getByText('parent essay about the clip')).toBeInTheDocument()
    expect(screen.getByText('the quoted clip')).toBeInTheDocument()
    const parent = screen.getByTestId('parent-inline-video')
    expect(parent).toHaveAttribute(
      'src',
      '/api/media/video?author=XRoboHub&tweetId=2091399015971864972&quality=hd',
    )
    const quoted = screen.getByTestId('quote-inline-video')
    expect(quoted).toHaveAttribute(
      'src',
      '/api/media/video?author=XRoboHub&tweetId=2091018327875518851&quality=hd',
    )
    expect(screen.queryByTestId('quote-photo')).not.toBeInTheDocument()
  })
})
