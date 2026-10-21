// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { FeedItem, MediaItem } from '@/components/feed/types'
import {
  AdhxFace,
  AdhxLoader,
  ArticleStage,
  ArticleTile,
  GobShape,
  NextTile,
  NxAvatar,
  PasteToast,
  PhotoTile,
  PostStage,
  PostTile,
  Shimmer,
  StageSkeleton,
  TallVideoStage,
  VideoTile,
  WideMediaStage,
  articleLede,
  displayUrl,
  faceColour,
  faceInitial,
  isTallMedia,
  mediaImageSrc,
  nextPostKind,
  postText,
} from '@/components/next'

function media(partial: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'm1',
    mediaType: 'video',
    width: 720,
    height: 1280,
    durationMs: 41_000,
    url: '/api/files/twitter/1/video-1?a=a',
    thumbnailUrl: 'https://pbs.twimg.com/thumb.jpg',
    shareUrl: '',
    ...partial,
  }
}

function item(partial: Partial<FeedItem> = {}): FeedItem {
  return {
    id: '1001',
    author: 'JamesMelville',
    authorName: 'James Melville',
    authorProfileImageUrl: null,
    text: 'Squirrels gorge on caramel wafers https://t.co/abc123',
    tweetUrl: 'https://x.com/JamesMelville/status/1001',
    processedAt: '2026-10-16T09:00:00.000Z',
    isArchived: false,
    media: null,
    links: null,
    tags: [],
    ...partial,
  }
}

const tallVideo = item({ media: [media()] })
const wideVideo = item({ id: '1002', media: [media({ width: 1920, height: 1080 })] })
const gif = item({ id: '1003', media: [media({ mediaType: 'animated_gif', durationMs: null })] })
const album = item({
  id: '1004',
  text: '400g skyr + chocolate',
  media: [1, 2, 3].map((n) => media({ id: `p${n}`, mediaType: 'photo', durationMs: null })),
})
const post = item({
  id: '1005',
  text: 'How did I not know about transitions.dev?',
  links: [{ id: 1, bookmarkId: '1005', expandedUrl: 'https://transitions.dev/', domain: null }],
})
const article = item({
  id: '1006',
  text: 'https://t.co/xyz',
  category: 'article',
  articlePreview: {
    title: 'Why You Waste Your Evenings',
    description: 'You are on the sofa &amp; cannot move.',
    imageUrl: 'https://example.com/cover.jpg',
    url: 'https://example.com/evenings',
  },
})

/**
 * Translation safety (docs/specs/translation-safety.md): no element may hold
 * a non-blank text node alongside an element child.
 */
function mixedTextParents(root: HTMLElement): string[] {
  const offenders: string[] = []
  for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
    const nodes = Array.from(el.childNodes)
    const hasText = nodes.some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
    const hasElement = nodes.some((n) => n.nodeType === Node.ELEMENT_NODE)
    if (hasText && hasElement) offenders.push(el.outerHTML.slice(0, 120))
  }
  return offenders
}

describe('post helpers', () => {
  it('classifies the five kinds', () => {
    expect(nextPostKind(tallVideo)).toBe('video')
    expect(nextPostKind(gif)).toBe('gif')
    expect(nextPostKind(album)).toBe('photo')
    expect(nextPostKind(post)).toBe('post')
    expect(nextPostKind(article)).toBe('article')
  })

  it('reads orientation from media size, and assumes tall for vertical-first platforms', () => {
    expect(isTallMedia(tallVideo)).toBe(true)
    expect(isTallMedia(wideVideo)).toBe(false)
    const tiktok = item({ platform: 'tiktok', media: [media({ width: null, height: null })] })
    expect(isTallMedia(tiktok)).toBe(true)
  })

  it('routes X photos per index through kept files and keeps video thumbnails as-is', () => {
    expect(mediaImageSrc(album, 1)).toBe('/api/files/twitter/1004/photo-2?a=JamesMelville')
    expect(mediaImageSrc(tallVideo)).toBe('https://pbs.twimg.com/thumb.jpg')
  })

  it('drops t.co links and decodes entities', () => {
    expect(postText(tallVideo)).toBe('Squirrels gorge on caramel wafers')
    expect(articleLede(article)).toBe('You are on the sofa & cannot move.')
  })
})

describe('tiles', () => {
  it('VideoTile (tall) shows cover, duration, caption on the scrim', () => {
    const { container } = render(<VideoTile item={tallVideo} />)
    expect(screen.getByText('0:41')).toBeInTheDocument()
    expect(screen.queryByText('Playing')).not.toBeInTheDocument()
    const caption = screen.getByText('Squirrels gorge on caramel wafers')
    expect(caption.closest('.nx-scrim')).toHaveClass('nx-text-shadow')
    expect(container.querySelector('img[src="https://pbs.twimg.com/thumb.jpg"]')).not.toBeNull()
    expect(container.querySelector('article')).toHaveStyle({
      width: `calc(var(--nx-tile-h, 340px) * ${(200 / 340).toFixed(4)})`,
    })
  })

  it('VideoTile shows the Playing chip, and wide videos get the stacked layout', () => {
    render(<VideoTile item={tallVideo} playing />)
    expect(screen.getByText('Playing')).toBeInTheDocument()
    const { container } = render(<VideoTile item={wideVideo} />)
    expect(container.querySelector('article')).toHaveStyle({
      width: `calc(var(--nx-tile-h, 340px) * ${(260 / 340).toFixed(4)})`,
    })
  })

  it('PhotoTile counts the album and draws stacked edges', () => {
    const { container } = render(<PhotoTile item={album} />)
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(container.querySelectorAll('span.rounded-t-\\[14px\\]')).toHaveLength(2)
    expect(screen.getByText('@JamesMelville')).toBeInTheDocument()
  })

  it('PhotoTile with one photo has no count or edges', () => {
    const single = item({ media: [media({ mediaType: 'photo' })] })
    render(<PhotoTile item={single} />)
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument()
  })

  it('PostTile sets the text in serif on cream with name, handle and link domain', () => {
    const { container } = render(<PostTile item={post} />)
    expect(screen.getByText('How did I not know about transitions.dev?')).toHaveClass(
      'font-nx-serif',
    )
    expect(screen.getByText('James Melville')).toBeInTheDocument()
    expect(screen.getByText('@JamesMelville')).toBeInTheDocument()
    expect(screen.getByText('transitions.dev')).toBeInTheDocument()
    expect(container.querySelector('article')).toHaveClass('bg-nx-cream')
  })

  it('ArticleTile has the yellow label, serif headline and first lines', () => {
    render(<ArticleTile item={article} />)
    expect(screen.getByText('Article')).toHaveClass('text-nx-accent', 'uppercase')
    expect(screen.getByText('Why You Waste Your Evenings')).toHaveClass('font-nx-serif')
    expect(screen.getByText('You are on the sofa & cannot move.')).toBeInTheDocument()
  })

  it('NextTile picks the right tile per kind', () => {
    render(<NextTile item={gif} />)
    expect(screen.getByText('GIF · loops')).toBeInTheDocument()
  })

  it('becomes one labelled button when clickable', () => {
    const onClick = vi.fn()
    render(<NextTile item={post} onClick={onClick} />)
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-label')).toContain('James Melville')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('swaps to the fallback image once, then gives up quietly', () => {
    const withFallback = item({
      media: [media({ originalUrl: 'https://pbs.twimg.com/original.jpg' })],
    })
    const { container } = render(<VideoTile item={withFallback} />)
    fireEvent.error(container.querySelector('img[src="https://pbs.twimg.com/thumb.jpg"]')!)
    const fallback = container.querySelector('img[src="https://pbs.twimg.com/original.jpg"]')
    expect(fallback).not.toBeNull()
    fireEvent.error(fallback!)
    expect(container.querySelector('img[src*="pbs.twimg.com/original"]')).toBeNull()
  })
})

describe('faces', () => {
  it('NxAvatar is Gob shaped: a 38% rounded square tilted −4°, the photo upright inside', () => {
    const { container } = render(
      <NxAvatar
        author={{ avatarUrl: 'https://pbs.twimg.com/ana.jpg', handle: 'ana', name: 'Ana' }}
        size={40}
        className="border-2"
      />,
    )
    const frame = container.querySelector('[data-shape="gob"]') as HTMLElement
    expect(frame.className).toContain('rounded-[38%]')
    expect(frame.className).toContain('-rotate-[4deg]')
    expect(frame.className).toContain('overflow-hidden')
    expect(frame.className).toContain('border-2')
    expect(frame.className).not.toContain('rounded-full')
    expect(frame.style.width).toBe('40px')
    const img = frame.querySelector('img')!
    expect(img.parentElement!.className).toContain('rotate-[4deg]')
    expect(img.getAttribute('src')).toBe('https://pbs.twimg.com/ana.jpg')
  })

  it('falls back to their initial on their colour, upright in the frame', () => {
    const { container } = render(
      <NxAvatar author={{ avatarUrl: null, handle: 'ana', name: 'Ana' }} size={30} />,
    )
    expect(container.querySelector('img')).toBeNull()
    const face = container.querySelector('[data-face="initial"]') as HTMLElement
    expect(face).toHaveAttribute('data-initial', 'A')
    expect(face.style.background).toBe('rgb(255, 143, 163)') // Ana is pink, as on the boards
    expect(face.parentElement!.className).toContain('rotate-[4deg]')
  })

  it('gives the boards’ people the boards’ colours, from the username alone', () => {
    expect(['ana', 'ben', 'mum', 'jo', 'pete'].map(faceColour)).toEqual([
      '#ff8fa3',
      '#7fd1ae',
      '#ffb35c',
      '#c4a7ff',
      '#6b8cff',
    ])
    expect(faceColour('@Ana')).toBe(faceColour('ana'))
    expect(faceInitial('You', 'pete')).toBe('P')
    expect(faceInitial('Ana', 'ana')).toBe('A')
  })

  it('GobShape takes its size from the caller', () => {
    const { container } = render(
      <GobShape className="h-14 w-14">
        <span />
      </GobShape>,
    )
    const frame = container.querySelector('[data-shape="gob"]') as HTMLElement
    expect(frame.className).toContain('h-14')
    expect(frame.style.width).toBe('')
  })
})

describe('stages', () => {
  it('TallVideoStage covers the stage and captions on the scrim', () => {
    const { container } = render(<TallVideoStage item={tallVideo} progress={0.5} />)
    expect(container.querySelector('img.object-cover')).not.toBeNull()
    expect(screen.getByText('@JamesMelville').closest('.nx-scrim')).not.toBeNull()
  })

  it('WideMediaStage draws a blurred backdrop of itself behind a contained image', () => {
    const { container } = render(<WideMediaStage item={wideVideo} />)
    const imgs = container.querySelectorAll('img[src="https://pbs.twimg.com/thumb.jpg"]')
    expect(imgs).toHaveLength(2)
    expect(imgs[0].className).toContain('blur-')
    expect(imgs[0]).toHaveAttribute('aria-hidden', 'true')
    expect(imgs[1].className).toContain('object-contain')
  })

  it('PostStage is cream with big serif type', () => {
    const { container } = render(<PostStage item={post} progress={0.2} />)
    expect(container.querySelector('section')).toHaveClass('bg-nx-cream')
    expect(
      screen.getByText('How did I not know about transitions.dev?').closest('p'),
    ).not.toBeNull()
  })

  it('ArticleStage offers Read it here (and Skip when asked)', () => {
    const onSkip = vi.fn()
    render(<ArticleStage item={article} onSkip={onSkip} />)
    expect(screen.getByRole('link', { name: 'Read it here' })).toHaveAttribute(
      'href',
      'https://example.com/evenings',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(onSkip).toHaveBeenCalledOnce()
    const onRead = vi.fn()
    render(<ArticleStage item={article} onRead={onRead} />)
    fireEvent.click(screen.getByRole('button', { name: 'Read it here' }))
    expect(onRead).toHaveBeenCalledOnce()
  })
})

describe('loader', () => {
  it('AdhxFace is Gob: busy while loading, blinking at rest, eyes shut when it can’t help', () => {
    const { container } = render(<AdhxFace bounce />)
    const face = container.querySelector('svg.gob') as SVGElement
    expect(face).toHaveAttribute('data-mood', 'busy')
    expect(face.querySelectorAll('.gob-eye')).toHaveLength(2)

    const { container: idle } = render(<AdhxFace />)
    expect(idle.querySelector('svg.gob')).toHaveAttribute('data-mood', 'idle')

    const { container: shut } = render(<AdhxFace mood="shut" />)
    expect(shut.querySelector('svg.gob')).toHaveAttribute('data-mood', 'shut')
    expect(shut.querySelector('.gob-eye')).toBeNull()
  })

  it('AdhxLoader announces "grabbing it" with three animated dots and a shadow', () => {
    render(<AdhxLoader />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('grabbing it...')
    expect(status.querySelectorAll('.animate-nx-dot')).toHaveLength(3)
    expect(status.querySelector('.animate-nx-shadow')).not.toBeNull()
  })

  it('Shimmer and StageSkeleton render placeholders', () => {
    const { container } = render(<Shimmer delayMs={100} className="h-10 w-10" />)
    expect(container.firstElementChild).toHaveClass('nx-shimmer', 'animate-nx-shimmer')
    expect(container.firstElementChild).toHaveStyle({ animationDelay: '100ms' })
    render(<StageSkeleton />)
    expect(screen.getByRole('status', { name: 'Loading post' })).toBeInTheDocument()
  })

  it('PasteToast covers grabbing, saved and can’t-save', () => {
    const { rerender } = render(
      <PasteToast state="grabbing" url="https://www.x.com/JamesMelville/status/2105" />,
    )
    expect(screen.getByText('Grabbing it…')).toBeInTheDocument()
    expect(screen.getByText('x.com/JamesMelville/status/2105')).toBeInTheDocument()

    rerender(<PasteToast state="saved" savedDetail="@JamesMelville · playing now" />)
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('@JamesMelville · playing now')).toBeInTheDocument()

    const onClick = vi.fn()
    rerender(<PasteToast state="saved" action={{ label: 'Add to channel', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add to channel' }))
    expect(onClick).toHaveBeenCalledOnce()

    rerender(<PasteToast state="failed" />)
    expect(screen.getByText('That link isn’t a post we can save')).toBeInTheDocument()
    expect(screen.getByText('Links from most social apps work')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('data-state', 'failed')
  })

  it('displayUrl strips protocol and www', () => {
    expect(displayUrl('https://www.instagram.com/p/abc')).toBe('instagram.com/p/abc')
  })
})

describe('translation safety', () => {
  it.each([
    ['VideoTile tall', <VideoTile key="a" item={tallVideo} playing />],
    ['VideoTile wide', <VideoTile key="b" item={wideVideo} />],
    ['GifTile', <NextTile key="c" item={gif} />],
    ['PhotoTile', <PhotoTile key="d" item={album} />],
    ['PostTile', <PostTile key="e" item={post} />],
    ['ArticleTile', <ArticleTile key="f" item={article} />],
    ['TallVideoStage', <TallVideoStage key="g" item={tallVideo} progress={0.3} />],
    ['WideMediaStage', <WideMediaStage key="h" item={album} />],
    ['PostStage', <PostStage key="i" item={post} />],
    ['ArticleStage', <ArticleStage key="j" item={article} onSkip={() => {}} />],
    ['AdhxLoader', <AdhxLoader key="k" />],
    ['PasteToast', <PasteToast key="l" state="grabbing" url="https://x.com/a/status/1" />],
  ])('%s never mixes bare text with elements', (_name, element) => {
    const { container } = render(element)
    expect(mixedTextParents(container)).toEqual([])
  })
})
