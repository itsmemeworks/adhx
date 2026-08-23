/**
 * @vitest-environment jsdom
 *
 * "My Collection is just a different playlist in that same theater" (owner
 * directive, reversing the earlier "videos never auto-advance in the collection theater's
 * Collection tab" rule): CollectionStage now forwards an `onEnded` prop through
 * to every video-capable stage variant it dispatches to, so those players'
 * own end-of-playback signal reaches `TheaterShell.personalAdvanceOnEnded`
 * (pure queue navigation — Done/Later/Delete still decide read state). This
 * stubs every stage component so it can assert purely on the dispatch +
 * prop-forwarding logic, not real playback.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { CollectionStage } from '@/components/theater/CollectionStage'
import type { FeedItem } from '@/components/feed/types'

vi.mock('@/components/theater/StageVideo', () => ({
  StageVideo: (props: { onEnded?: () => void; repeat?: boolean }) => (
    <div
      data-testid="stage-video"
      data-has-onended={String(!!props.onEnded)}
      data-repeat={String(!!props.repeat)}
    />
  ),
}))
// The probe + auto-advance guards live in `useInstagramStage` now, so that's
// where `onEnded` has to land for an Instagram item; StageInstagram itself is
// presentational (probing poster / embed fallback) and never gets it.
const useInstagramStageSpy = vi.fn(
  (
    _args: unknown,
  ): {
    status: 'probing' | 'ready' | 'embed'
    slow: boolean
    src: string | null
    poster: string | null
  } => ({
    status: 'probing',
    slow: false,
    src: null,
    poster: null,
  }),
)
vi.mock('@/components/theater/StageInstagram', () => ({
  useInstagramStage: (args: unknown) => useInstagramStageSpy(args),
  StageInstagram: () => <div data-testid="stage-instagram" />,
}))
vi.mock('@/components/theater/StageYouTube', () => ({
  StageYouTube: (props: { onEnded?: () => void; repeat?: boolean }) => (
    <div
      data-testid="stage-youtube"
      data-has-onended={String(!!props.onEnded)}
      data-repeat={String(!!props.repeat)}
    />
  ),
}))
vi.mock('@/components/theater/StageText', () => ({
  StageText: (props: { photo?: boolean; photoCaption?: boolean }) => (
    <div
      data-testid="stage-text"
      data-photo={String(!!props.photo)}
      data-photo-caption={String(props.photoCaption)}
    />
  ),
}))
vi.mock('@/components/theater/StageArticle', () => ({
  StageArticle: () => <div data-testid="stage-article" />,
}))

function feedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: '1',
    platform: 'twitter',
    author: 'alice',
    authorName: 'Alice',
    text: 'hello',
    tweetUrl: '/alice/status/1',
    createdAt: '2026-08-20T00:00:00Z',
    processedAt: '2026-08-20T00:00:00Z',
    ...overrides,
  } as FeedItem
}

describe('CollectionStage: onEnded wiring to the video-capable stages', () => {
  it('forwards onEnded to StageVideo for a twitter video item', () => {
    const { getByTestId } = render(
      <CollectionStage
        feedItem={feedItem({ media: [{ mediaType: 'video' }] as FeedItem['media'] })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={vi.fn()}
      />,
    )
    expect(getByTestId('stage-video').dataset.hasOnended).toBe('true')
  })

  it('forwards onEnded to StageVideo for a tiktok video item', () => {
    const { getByTestId } = render(
      <CollectionStage
        feedItem={feedItem({
          platform: 'tiktok',
          media: [{ mediaType: 'video' }] as FeedItem['media'],
        })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={vi.fn()}
      />,
    )
    expect(getByTestId('stage-video').dataset.hasOnended).toBe('true')
  })

  it('forwards onEnded to the Instagram probe hook (which owns the advance guards)', () => {
    useInstagramStageSpy.mockClear()
    const onEnded = vi.fn()
    const { getByTestId } = render(
      <CollectionStage
        feedItem={feedItem({ platform: 'instagram' })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={onEnded}
      />,
    )
    // Still probing, so the presentational stage is what renders...
    expect(getByTestId('stage-instagram')).toBeInTheDocument()
    // ...and the hook got the callback its guards need.
    expect(useInstagramStageSpy).toHaveBeenCalledWith(expect.objectContaining({ onEnded }))
  })

  it('forwards onEnded to StageYouTube', () => {
    const { getByTestId } = render(
      <CollectionStage
        feedItem={feedItem({ platform: 'youtube' })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={vi.fn()}
      />,
    )
    expect(getByTestId('stage-youtube').dataset.hasOnended).toBe('true')
  })

  it("renders StageVideo WITHOUT onEnded when the prop is omitted (e.g. the personal theater's Live tab, which never passes it)", () => {
    const { getByTestId } = render(
      <CollectionStage
        feedItem={feedItem({ media: [{ mediaType: 'video' }] as FeedItem['media'] })}
        muted
        onRequestUnmute={vi.fn()}
      />,
    )
    expect(getByTestId('stage-video').dataset.hasOnended).toBe('false')
  })

  it('forwards repeat to StageVideo so repeat-one can loop the player', () => {
    const { getByTestId } = render(
      <CollectionStage
        feedItem={feedItem({ media: [{ mediaType: 'video' }] as FeedItem['media'] })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={vi.fn()}
        repeat
      />,
    )
    expect(getByTestId('stage-video').dataset.repeat).toBe('true')
  })

  it('a photo item hides the stage caption — the chrome already paints it', () => {
    const { getByTestId } = render(
      <CollectionStage
        feedItem={feedItem({
          media: [
            { mediaType: 'photo', thumbnailUrl: 'https://example.com/p.jpg' },
          ] as FeedItem['media'],
        })}
        muted
        onRequestUnmute={vi.fn()}
      />,
    )
    expect(getByTestId('stage-text').dataset.photo).toBe('true')
    expect(getByTestId('stage-text').dataset.photoCaption).toBe('false')
  })

  it('plays a video+quote item full-bleed by default', () => {
    const { getByTestId, queryByTestId } = render(
      <CollectionStage
        feedItem={feedItem({
          media: [{ mediaType: 'video' }] as FeedItem['media'],
          quotedTweet: {
            id: 'q1',
            author: 'bob',
            text: 'quoted clip',
            media: [{ mediaType: 'video', thumbnailUrl: 'https://example.com/q.jpg' }],
          } as FeedItem,
        })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={vi.fn()}
      />,
    )
    expect(getByTestId('stage-video')).toBeInTheDocument()
    expect(queryByTestId('stage-text')).toBeNull()
  })

  it('opens a photo as the typeset reader in article mode, not the photo variant', () => {
    const { getByTestId } = render(
      <CollectionStage
        feedItem={feedItem({
          media: [
            { mediaType: 'photo', thumbnailUrl: 'https://example.com/p.jpg' },
          ] as FeedItem['media'],
          text: 'a long photo caption',
        })}
        muted
        onRequestUnmute={vi.fn()}
        articleMode
      />,
    )
    expect(getByTestId('stage-text').dataset.photo).toBe('false')
  })

  it('keeps the YouTube iframe slot and stacks the reader in article mode', () => {
    const { getByTestId } = render(
      <CollectionStage
        feedItem={feedItem({
          platform: 'youtube',
          media: [{ mediaType: 'video' }] as FeedItem['media'],
          text: 'a long short caption',
        })}
        muted
        onRequestUnmute={vi.fn()}
        articleMode
      />,
    )
    expect(getByTestId('stage-youtube')).toBeInTheDocument()
    expect(getByTestId('stage-text')).toBeInTheDocument()
  })

  it('keeps a ready Instagram reel playing in article mode', () => {
    useInstagramStageSpy.mockReturnValueOnce({
      status: 'ready' as const,
      slow: false,
      src: 'https://example.com/reel.mp4',
      poster: 'https://example.com/reel.jpg',
    })
    const { getByTestId } = render(
      <CollectionStage
        feedItem={feedItem({
          platform: 'instagram',
          media: [{ mediaType: 'video' }] as FeedItem['media'],
          text: 'a long reel caption',
        })}
        muted
        onRequestUnmute={vi.fn()}
        articleMode
      />,
    )
    expect(getByTestId('stage-video')).toBeInTheDocument()
    expect(getByTestId('stage-text')).toBeInTheDocument()
  })

  it('keeps StageVideo playing in article mode and stacks the reader under it', () => {
    const { getByTestId } = render(
      <CollectionStage
        feedItem={feedItem({
          media: [{ mediaType: 'video' }] as FeedItem['media'],
          quotedTweet: {
            id: 'q1',
            author: 'bob',
            text: 'quoted clip',
            media: [{ mediaType: 'video', thumbnailUrl: 'https://example.com/q.jpg' }],
          } as FeedItem,
        })}
        muted
        onRequestUnmute={vi.fn()}
        articleMode
      />,
    )
    expect(getByTestId('stage-video')).toBeInTheDocument()
    expect(getByTestId('stage-text')).toBeInTheDocument()
  })

  it('a text-only item ignores onEnded (StageText has no such affordance) and still renders', () => {
    expect(() =>
      render(
        <CollectionStage
          feedItem={feedItem({ text: 'just words, no media' })}
          muted
          onRequestUnmute={vi.fn()}
          onEnded={vi.fn()}
        />,
      ),
    ).not.toThrow()
  })
})
