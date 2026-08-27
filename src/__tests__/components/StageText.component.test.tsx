/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/theater/share-tweet', () => ({
  fetchShareTweet: vi.fn().mockResolvedValue(null),
}))
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StageText } from '@/components/theater/StageText'
import {
  STAGE_ARTICLE_UNDER_BAND_PAD,
  STAGE_TEXT_SCROLL_PAD,
  STAGE_TEXT_TOP_PAD,
} from '@/components/theater/stage-primitives'
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
    expect(screen.getByRole('img', { name: 'jack' })).toHaveAttribute(
      'src',
      'https://example.com/jack.jpg',
    )
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

  it('typesets a numbered list as a compact top-aligned document', () => {
    const text = Array.from({ length: 20 }, (_, i) => `${i + 1}. Place (DR ${90 - i})`).join('\n')
    render(<StageText item={textItem({ text })} />)
    const scroller = document.querySelector('.overflow-y-auto')
    const frame = scroller?.firstElementChild
    expect(frame?.className).not.toContain('justify-center')
    const body = scroller?.querySelector('p')
    expect(body?.className).toContain('text-[15px]')
    expect(body?.className).toContain('sm:text-base')
    expect(body?.className).toContain('leading-[1.45]')
    expect(body?.querySelectorAll('br').length).toBe(19)
  })

  it('sits flush under a live video band without the chrome pad or vertical center', () => {
    render(<StageText item={textItem()} flushTop />)
    const scroller = document.querySelector('.overflow-y-auto')
    const frame = scroller?.firstElementChild
    const column = frame?.firstElementChild
    expect(frame?.className).not.toContain('justify-center')
    expect(column?.className).not.toContain(STAGE_TEXT_TOP_PAD)
  })

  it('pads the essay into the video fade and stays transparent so copy can scroll under', () => {
    render(<StageText item={textItem()} flushTop underBand />)
    const scroller = document.querySelector('.overflow-y-auto')
    const frame = scroller?.firstElementChild
    const column = frame?.firstElementChild
    expect(scroller?.className).toContain('bg-transparent')
    expect(scroller?.className).not.toContain('bg-[#08070a]')
    expect(frame?.className).not.toContain('justify-center')
    expect(column?.className).toContain(STAGE_ARTICLE_UNDER_BAND_PAD)
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
          contentType: 'text',
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
          contentType: 'text',
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

  it('renders an off-site link card and strips the URL from the typeset body', () => {
    render(
      <StageText
        item={textItem({
          contentType: 'article',
          text: '👀\n\nhttps://deanpiper.substack.com/p/hayden-panettiere-and-james-blunt',
          thumbnailUrl: 'https://substackcdn.com/image.jpg',
          linkPreview: {
            url: 'https://deanpiper.substack.com/p/hayden-panettiere-and-james-blunt',
            title: 'Hayden Panettiere and James Blunt – An Internet Lynching',
            description: 'In a remarkable turn of events this week.',
            imageUrl: 'https://substackcdn.com/image.jpg',
            domain: 'deanpiper.substack.com',
          },
        })}
      />,
    )
    expect(screen.getByText('👀')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', {
        name: /https:\/\/deanpiper\.substack\.com/,
      }),
    ).not.toBeInTheDocument()
    const card = screen.getByRole('link', {
      name: /Hayden Panettiere and James Blunt/,
    })
    expect(card).toHaveAttribute(
      'href',
      'https://deanpiper.substack.com/p/hayden-panettiere-and-james-blunt',
    )
    expect(screen.getByText('deanpiper.substack.com')).toBeInTheDocument()
    expect(document.querySelectorAll('img[src="https://substackcdn.com/image.jpg"]')).toHaveLength(
      1,
    )
  })
})

describe('StageText photo album', () => {
  it('cycles a saved six-image Instagram carousel from the direct preview', () => {
    render(
      <StageText
        item={textItem({
          platform: 'instagram',
          author: 'ravecultur',
          bookmarkId: 'DcgAGt4ijQr',
          contentType: 'photo',
          thumbnailUrl: '/api/media/instagram/thumbnail?id=DcgAGt4ijQr',
          photoCount: 6,
          url: 'https://www.instagram.com/p/DcgAGt4ijQr/',
        })}
        photo
        photoCaption={false}
      />,
    )

    expect(screen.getByLabelText('Photos, 6')).toBeInTheDocument()
    const slides = document.querySelectorAll('[aria-label="Photos, 6"] img')
    expect([...slides].map((slide) => slide.getAttribute('src'))).toEqual(
      Array.from(
        { length: 6 },
        (_, index) => `/api/media/instagram/thumbnail?id=DcgAGt4ijQr&index=${index + 1}`,
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Next photo, 1 of 6' }))
    expect(screen.getByRole('button', { name: 'Next photo, 2 of 6' })).toBeInTheDocument()
  })

  it('shows every photo on a multi-image tweet, not just the first', async () => {
    const { fetchShareTweet } = await import('@/lib/theater/share-tweet')
    vi.mocked(fetchShareTweet).mockResolvedValueOnce({
      media: {
        photos: [
          { url: 'https://pbs.twimg.com/one.jpg' },
          { url: 'https://pbs.twimg.com/two.jpg' },
        ],
      },
    } as never)

    render(
      <StageText
        item={textItem({
          author: 'StreetFashion01',
          bookmarkId: '2091475617438957808',
          contentType: 'photo',
          thumbnailUrl: 'https://pbs.twimg.com/one.jpg',
        })}
        photo
        photoCaption={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Photos, 2')).toBeInTheDocument()
    })
    const srcs = [...document.querySelectorAll('img')].map((el) => el.getAttribute('src') ?? '')
    expect(srcs.some((s) => s.includes('index=1'))).toBe(true)
    expect(srcs.some((s) => s.includes('index=2'))).toBe(true)
    const slides = document.querySelectorAll('[aria-label="Photos, 2"] > div')
    expect(slides).toHaveLength(2)
    expect(slides[0]?.className).toContain('min-w-full')
    const pager = screen.getByRole('button', { name: 'Next photo, 1 of 2' })
    expect(pager.parentElement?.style.bottom).toBe('12px')
    expect(pager.parentElement?.className).not.toContain('4.25rem')
    expect(pager.className).toContain('bg-black/40')
    expect(pager.className).not.toContain('lg:bg-black/80')
    fireEvent.click(pager)
    expect(screen.getByRole('button', { name: 'Next photo, 2 of 2' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next photo, 2 of 2' }))
    expect(screen.getByRole('button', { name: 'Next photo, 1 of 2' })).toBeInTheDocument()
  })

  it('stacks every photo in the typeset reader from photoCount', () => {
    render(
      <StageText
        item={textItem({
          author: 'StreetFashion01',
          bookmarkId: '2091475617438957808',
          contentType: 'photo',
          text: 'the loafers',
          thumbnailUrl: 'https://pbs.twimg.com/one.jpg',
          photoCount: 3,
        })}
      />,
    )
    const srcs = [...document.querySelectorAll('img')].map((el) => el.getAttribute('src') ?? '')
    expect(srcs.filter((s) => s.includes('index=')).sort()).toEqual([
      '/api/media/image?author=StreetFashion01&tweetId=2091475617438957808&index=1',
      '/api/media/image?author=StreetFashion01&tweetId=2091475617438957808&index=2',
      '/api/media/image?author=StreetFashion01&tweetId=2091475617438957808&index=3',
    ])
    expect(screen.queryByLabelText('Photos, 3')).not.toBeInTheDocument()
  })
})
