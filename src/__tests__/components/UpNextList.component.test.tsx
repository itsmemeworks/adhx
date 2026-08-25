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
    expect(screen.getByText('Up next')).toBeInTheDocument()
    expect(screen.getByText('Watched earlier')).toBeInTheDocument()
    // Each heading carries its own count. Read them off the separators so a
    // bare "1" elsewhere in the row markup can't satisfy the assertion.
    const headings = screen
      .getAllByRole('separator')
      .map((el) => el.textContent?.replace(/\s+/g, ' ').trim())
    // (textContent has no gap between the label and count spans; the visual
    // gap is flex `gap-2`.)
    // Counts are what's still PENDING for the two live groups (nothing is
    // watched yet here) and the total for the watched-earlier block.
    expect(headings).toEqual(['New since you opened1', 'Up next2', 'Watched earlier1'])
    // Counts live in those headings — "show a fact once", so no duplicate
    // summary line above them.
    expect(screen.queryByText(/to watch/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
  })

  /**
   * The list never states caught-up in words — owner, on a preview page whose
   * only sections were "Shared post" and "Watched earlier 19": "I don't think
   * there's a need for [the caught-up line], just additional text. I don't
   * think there's any point." The headings already carry it: no unwatched
   * section IS nothing left to watch. The end-of-queue STAGE still says it.
   */
  it('never states caught-up in words — the headings carry it', () => {
    const { rerender } = render(
      <UpNextList {...base} items={[post('a', 1), post('b', 2)]} wasSeenOnEntry={() => false} />,
    )
    expect(screen.getByText('Up next')).toBeInTheDocument()
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()

    // Everything watched: still no line, and no "Up next" heading to imply
    // otherwise — the only section left is the watched block.
    rerender(
      <UpNextList {...base} items={[post('a', 1), post('b', 2)]} wasSeenOnEntry={() => true} />,
    )
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
    expect(screen.getAllByRole('separator').map((el) => el.textContent)).toEqual([
      'Watched earlier2',
    ])
  })

  it('renders no headings at all in playlist/shared mode (ungrouped queue)', () => {
    render(<UpNextList {...base} items={[post('a', 1), post('b', 2)]} />)
    expect(screen.queryByText('Up next')).not.toBeInTheDocument()
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
  })
})

/**
 * Owner: a watched row should leave Up next / New and land in Watched
 * earlier. The playing row stays put so dwell does not yank it mid-watch.
 */
describe('UpNextList — watching a row moves it to Watched earlier', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
  const post = (id: string, addedHoursAgo: number) =>
    item({ bookmarkId: id, url: `/alice/status/${id}`, addedAt: hoursAgo(addedHoursAgo) })
  const items = [post('a', 1), post('b', 2)]
  const wasSeenOnEntry = () => false

  it('keeps the playing row in Up next, and moves a finished row to Watched', () => {
    const { rerender } = render(
      <UpNextList {...base} items={items} currentKey="twitter:a" wasSeenOnEntry={wasSeenOnEntry} />,
    )
    const order = () => screen.getAllByRole('separator').map((el) => el.textContent)
    expect(order()).toEqual(['Up next2'])

    rerender(
      <UpNextList
        {...base}
        items={items}
        currentKey="twitter:b"
        isSeen={(k) => k === 'twitter:a'}
        wasSeenOnEntry={wasSeenOnEntry}
      />,
    )
    expect(order()).toEqual(['Up next1', 'Watched earlier1'])
    expect(screen.queryByText('next ↓')).not.toBeInTheDocument()
  })

  it('puts every finished row under Watched earlier once nothing is current', () => {
    render(
      <UpNextList {...base} items={items} isSeen={() => true} wasSeenOnEntry={wasSeenOnEntry} />,
    )
    expect(screen.getAllByRole('separator').map((el) => el.textContent)).toEqual([
      'Watched earlier2',
    ])
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
  })
})

/**
 * Owner report from a shared preview URL: "if I go to a direct preview URL
 * then I don't get the watched, the different categorizations or sections
 * within the playlist… If I just go straight to the root domain then I do see
 * the different sections. We just need to be always consistent here."
 *
 * Shared mode now groups its queue exactly like home. The shared post itself
 * is the exception: it leads because the visitor followed a link to it, not
 * because it's new or unwatched, so it sits OUTSIDE the grouping under its own
 * heading. Without that carve-out the pinned lead consumed the first group's
 * heading and the real run below it went unlabelled.
 */
describe('UpNextList — the pinned shared post sits outside the groups', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
  const post = (id: string, addedHoursAgo: number) =>
    item({ bookmarkId: id, url: `/alice/status/${id}`, addedAt: hoursAgo(addedHoursAgo) })

  const sharedQueue = [post('shared', 2), post('todo', 1), post('todo2', 3), post('seen', 4)]
  const sharedProps = {
    items: sharedQueue,
    pinnedKey: 'twitter:shared',
    wasSeenOnEntry: (k: string) => k === 'twitter:seen',
  }

  it('gives the shared post its own heading and still labels the queue below it', () => {
    render(<UpNextList {...base} {...sharedProps} />)

    const headings = screen
      .getAllByRole('separator')
      .map((el) => el.textContent?.replace(/\s+/g, ' ').trim())
    // "Shared post" carries no count — it's one post, and the number would
    // read as a queue length. The live groups below keep theirs.
    expect(headings).toEqual(['Shared post', 'Up next2', 'Watched earlier1'])
  })

  it('excludes the shared post from the group counts', () => {
    // 'shared' is unwatched, but "Up next" counts 2 (todo + todo2) — not 3.
    render(<UpNextList {...base} {...sharedProps} />)
    const upNext = screen
      .getAllByRole('separator')
      .find((el) => el.textContent?.includes('Up next'))!
    expect(upNext.textContent?.replace(/\s+/g, ' ').trim()).toBe('Up next2')
  })

  it('does not invent an "Up next" section for the shared post alone', () => {
    // Everything in the live queue is watched; only the pinned post is not.
    // Being caught up is a fact about the FEED — the shared post is why the
    // visitor is here, not something they're behind on — so it must not
    // produce a pending section of its own.
    render(
      <UpNextList
        {...base}
        items={[post('shared', 2), post('seen', 4)]}
        pinnedKey="twitter:shared"
        wasSeenOnEntry={(k) => k === 'twitter:seen'}
      />,
    )
    expect(screen.getAllByRole('separator').map((el) => el.textContent)).toEqual([
      'Shared post',
      'Watched earlier1',
    ])
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
  })

  it('groups normally when there is no pinned post (home)', () => {
    render(<UpNextList {...base} items={sharedQueue} wasSeenOnEntry={sharedProps.wasSeenOnEntry} />)
    const headings = screen
      .getAllByRole('separator')
      .map((el) => el.textContent?.replace(/\s+/g, ' ').trim())
    // No carve-out: 'shared' is just another unwatched post, so 3 are pending.
    expect(headings).toEqual(['Up next3', 'Watched earlier1'])
    expect(screen.queryByText('Shared post')).not.toBeInTheDocument()
  })

  it('renders no headings at all in playlist mode (no wasSeenOnEntry)', () => {
    // A curated tag playlist has one authored order and opts out of grouping —
    // passing pinnedKey alone must not start labelling it.
    render(<UpNextList {...base} items={sharedQueue} pinnedKey="twitter:shared" />)
    expect(screen.queryAllByRole('separator')).toHaveLength(0)
  })
})
