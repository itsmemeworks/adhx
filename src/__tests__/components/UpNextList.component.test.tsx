/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UpNextList } from '@/components/theater/UpNextList'
import { QUEUE_NOW_PLAYING, QUEUE_NEXT, QUEUE_SEEN } from '@/components/theater/theater-math'
import type { TheaterItem } from '@/components/theater/types'

function item(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '1',
    author: 'alice',
    authorName: 'Alice',
    text: 'a caption for the post',
    thumbnailUrl: null,
    authorAvatarUrl: null,
    url: '/alice/status/1',
    createdAt: '2026-08-18T00:00:00Z',
    saveCount: 1,
    trendCount: 1,
    contentType: 'text',
    ...overrides,
  } as TheaterItem
}

const base = {
  currentKey: null as string | null,
  isSeen: () => false,
  seenReady: true,
  freshKeys: new Set<string>(),
  onSelect: vi.fn(),
}

describe('UpNextList row: hides the time text for an unknown addedAt', () => {
  it('omits the relative-time span but keeps the platform glyph when addedAt is null', () => {
    render(<UpNextList {...base} items={[item({ addedAt: null })]} />)
    const row = screen.getByText('a caption for the post').closest('button')!
    expect(row.querySelector('svg')).toBeInTheDocument()
    expect(row.querySelector('span.font-mono')).not.toBeInTheDocument()
  })

  it('omits the relative-time span when addedAt is the epoch sentinel', () => {
    render(<UpNextList {...base} items={[item({ addedAt: new Date(0).toISOString() })]} />)
    const row = screen.getByText('a caption for the post').closest('button')!
    expect(row.querySelector('span.font-mono')).not.toBeInTheDocument()
  })

  it('shows the relative-time span for a real addedAt', () => {
    render(<UpNextList {...base} items={[item({ addedAt: '2026-08-18T00:00:00Z' })]} />)
    const row = screen.getByText('a caption for the post').closest('button')!
    expect(row.querySelector('span.font-mono')).toBeInTheDocument()
  })
})

describe('UpNextList Now playing / Next', () => {
  const post = (id: string, text = id) =>
    item({ bookmarkId: id, url: `/alice/status/${id}`, text, addedAt: '2026-08-18T00:00:00Z' })

  it('labels the current row Now playing and the next row Next', () => {
    render(
      <UpNextList
        {...base}
        items={[post('a', 'playing'), post('b', 'upcoming'), post('c', 'later')]}
        currentKey="twitter:a"
      />,
    )
    const headings = screen.getAllByRole('separator').map((el) => el.textContent?.trim())
    expect(headings).toEqual([QUEUE_NOW_PLAYING, QUEUE_NEXT])
    expect(screen.getByText('playing').closest('button')).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByText('New since you opened')).not.toBeInTheDocument()
    expect(screen.queryByText('Watched earlier')).not.toBeInTheDocument()
    expect(screen.queryByText('This post')).not.toBeInTheDocument()
  })

  it('does not invent leftover section headings', () => {
    render(<UpNextList {...base} items={[post('a'), post('b')]} />)
    expect(screen.queryByText('New since you opened')).not.toBeInTheDocument()
    expect(screen.queryByText('Watched earlier')).not.toBeInTheDocument()
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
  })

  it('Repeat off labels Seen after Now / Next', () => {
    render(
      <UpNextList
        {...base}
        items={[post('a', 'playing'), post('b', 'upcoming'), post('c', 'watched')]}
        currentKey="twitter:a"
        isSeen={(key) => key === 'twitter:c'}
        seenStartIndex={2}
      />,
    )
    const headings = screen.getAllByRole('separator').map((el) => el.textContent?.trim())
    expect(headings).toEqual([QUEUE_NOW_PLAYING, QUEUE_NEXT, QUEUE_SEEN])
  })

  it('Repeat does not show Seen', () => {
    render(
      <UpNextList
        {...base}
        items={[post('a', 'playing'), post('b', 'upcoming'), post('c', 'later')]}
        currentKey="twitter:a"
        isSeen={(key) => key === 'twitter:c'}
      />,
    )
    expect(screen.queryByText(QUEUE_SEEN)).not.toBeInTheDocument()
  })
})
