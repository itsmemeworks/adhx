/**
 * @vitest-environment jsdom
 *
 * "My Collection is just a different playlist in that same theater" (owner
 * directive, reversing the earlier "videos never auto-advance in triage's
 * Collection tab" rule): TriageStage now forwards an `onEnded` prop through
 * to every video-capable stage variant it dispatches to, so those players'
 * own end-of-playback signal reaches `TheaterShell.triageAdvanceOnEnded`
 * (pure queue navigation — Done/Later/Delete still decide read state). This
 * stubs every stage component so it can assert purely on the dispatch +
 * prop-forwarding logic, not real playback.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { TriageStage } from '@/components/theater/TriageStage'
import type { FeedItem } from '@/components/feed/types'

vi.mock('@/components/theater/StageVideo', () => ({
  StageVideo: (props: { onEnded?: () => void }) => (
    <div data-testid="stage-video" data-has-onended={String(!!props.onEnded)} />
  ),
}))
vi.mock('@/components/theater/StageInstagram', () => ({
  StageInstagram: (props: { onEnded?: () => void }) => (
    <div data-testid="stage-instagram" data-has-onended={String(!!props.onEnded)} />
  ),
}))
vi.mock('@/components/theater/StageYouTube', () => ({
  StageYouTube: (props: { onEnded?: () => void }) => (
    <div data-testid="stage-youtube" data-has-onended={String(!!props.onEnded)} />
  ),
}))
vi.mock('@/components/theater/StageText', () => ({
  StageText: () => <div data-testid="stage-text" />,
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

describe('TriageStage: onEnded wiring to the video-capable stages', () => {
  it('forwards onEnded to StageVideo for a twitter video item', () => {
    const { getByTestId } = render(
      <TriageStage
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
      <TriageStage
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

  it('forwards onEnded to StageInstagram', () => {
    const { getByTestId } = render(
      <TriageStage
        feedItem={feedItem({ platform: 'instagram' })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={vi.fn()}
      />,
    )
    expect(getByTestId('stage-instagram').dataset.hasOnended).toBe('true')
  })

  it('forwards onEnded to StageYouTube', () => {
    const { getByTestId } = render(
      <TriageStage
        feedItem={feedItem({ platform: 'youtube' })}
        muted
        onRequestUnmute={vi.fn()}
        onEnded={vi.fn()}
      />,
    )
    expect(getByTestId('stage-youtube').dataset.hasOnended).toBe('true')
  })

  it("renders StageVideo WITHOUT onEnded when the prop is omitted (e.g. triage's Live tab, which never passes it)", () => {
    const { getByTestId } = render(
      <TriageStage
        feedItem={feedItem({ media: [{ mediaType: 'video' }] as FeedItem['media'] })}
        muted
        onRequestUnmute={vi.fn()}
      />,
    )
    expect(getByTestId('stage-video').dataset.hasOnended).toBe('false')
  })

  it('a text-only item ignores onEnded (StageText has no such affordance) and still renders', () => {
    expect(() =>
      render(
        <TriageStage
          feedItem={feedItem({ text: 'just words, no media' })}
          muted
          onRequestUnmute={vi.fn()}
          onEnded={vi.fn()}
        />,
      ),
    ).not.toThrow()
  })
})
