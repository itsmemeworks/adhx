/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UpNextList } from '@/components/theater/UpNextList'
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

/**
 * Owner report: the collection theater rendered "56y" for a saved TikTok
 * whose `createdAt` fell back to an epoch sentinel. The row renders
 * `addedAt` (when the post was first saved to ADHX — never the source
 * platform's own publish date) gated by `hasKnownTimestamp` — a
 * missing/unknown `addedAt` hides the relative-time span but the platform
 * glyph must still render either way.
 */
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

/**
 * Owner report on the live queue's Up-next panel: it said "You're all caught
 * up — Top today" with unwatched rows still in the list, and the time chips
 * ran "14h, 14h, 2h, 2h, 4h" because the queue was ordered by the pulse event
 * time while the chips render `addedAt`. The panel now groups the queue and
 * counts what is actually unwatched.
 */
describe('UpNextList grouping headings', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
  const post = (id: string, addedHoursAgo: number) =>
    item({ bookmarkId: id, url: `/alice/status/${id}`, addedAt: hoursAgo(addedHoursAgo) })

  it('labels the three groups with their counts', () => {
    render(
      <UpNextList
        {...base}
        items={[post('fresh', 1), post('todo', 2), post('todo2', 3), post('seen', 4)]}
        freshKeys={new Set(['twitter:fresh'])}
        wasSeenOnEntry={(k) => k === 'twitter:seen'}
      />,
    )

    expect(screen.getByText('New since you opened')).toBeInTheDocument()
    expect(screen.getByText('Not watched yet')).toBeInTheDocument()
    expect(screen.getByText('Watched')).toBeInTheDocument()
    // Each heading carries its own count. Read them off the separators so a
    // bare "1" elsewhere in the row markup can't satisfy the assertion.
    const headings = screen
      .getAllByRole('separator')
      .map((el) => el.textContent?.replace(/\s+/g, ' ').trim())
    // (textContent has no gap between the label and count spans; the visual
    // gap is flex `gap-2`.)
    expect(headings).toEqual(['New since you opened1', 'Not watched yet2', 'Watched1'])
    // Counts live in those headings — "show a fact once", so no duplicate
    // summary line above them.
    expect(screen.queryByText(/to watch/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
  })

  it('only claims caught-up when nothing is unwatched', () => {
    const { rerender } = render(
      <UpNextList {...base} items={[post('a', 1), post('b', 2)]} wasSeenOnEntry={() => false} />,
    )
    // Two unwatched rows: the old code showed "all caught up" here whenever
    // there was no stored last-visit timestamp.
    expect(screen.getByText('Not watched yet')).toBeInTheDocument()
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()

    rerender(
      <UpNextList {...base} items={[post('a', 1), post('b', 2)]} wasSeenOnEntry={() => true} />,
    )
    expect(screen.getByText('You\u2019re all caught up')).toBeInTheDocument()
  })

  it('renders no headings at all in playlist/shared mode (ungrouped queue)', () => {
    render(<UpNextList {...base} items={[post('a', 1), post('b', 2)]} />)
    expect(screen.queryByText('Not watched yet')).not.toBeInTheDocument()
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
  })
})
