/**
 * @vitest-environment jsdom
 *
 * `CollectionPosterCard` (`@/components/tags/PosterCard.tsx`) — asserts the
 * two link structures the component supports, the adaptive mosaic, the
 * fixed-position footer, and the rank medallion:
 *
 * - default (`/tags` usage): only the mosaic area is a `<Link>`; `badge`/
 *   `children` render in an action row under the mosaic, OUTSIDE that
 *   link, since nesting a button/anchor inside an `<a>` is invalid HTML.
 * - `wholeCardLink` (public profile + leaderboard usage): the entire
 *   card — mosaic + title/badge footer — is a single `<Link>`, with no
 *   nested interactive controls (the rank medallion is non-interactive, so
 *   it's the one "badge" allowed here).
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CollectionPosterCard } from '@/components/tags/PosterCard'

const TILES = [{ thumbnailUrl: 'https://example.com/a.jpg' }, { text: 'a post excerpt' }]

describe('CollectionPosterCard', () => {
  it('/tags variant: renders action controls outside the link, and only the mosaic links out', () => {
    render(
      <CollectionPosterCard
        tag="cool-stuff"
        count={2}
        tiles={TILES}
        href="/?tag=cool-stuff"
        badge={<span data-testid="badge">Public</span>}
      >
        <button type="button" data-testid="copy-btn">
          Copy
        </button>
      </CollectionPosterCard>,
    )

    const link = screen.getByRole('link', { name: 'View #cool-stuff' })
    expect(link).toHaveAttribute('href', '/?tag=cool-stuff')

    // The action button must NOT be nested inside the anchor.
    const button = screen.getByTestId('copy-btn')
    expect(link.contains(button)).toBe(false)

    // The badge is also outside the anchor.
    const badge = screen.getByTestId('badge')
    expect(link.contains(badge)).toBe(false)

    // Title still renders; the count is now an icon badge showing just the
    // number (the word "posts" moved to the badge's title/aria-label).
    expect(screen.getByText('#cool-stuff')).toBeInTheDocument()
    expect(screen.getByTitle('2 posts')).toBeInTheDocument()
    expect(screen.getByTitle('2 posts')).toHaveTextContent('2')

    // Title/stats sit on the mosaic and must not eat clicks.
    const footer = screen.getByText('#cool-stuff').parentElement?.parentElement
    expect(footer?.className).toContain('pointer-events-none')
    // Actions live in the row under the mosaic, still outside the link.
    expect(button.closest('.border-t')).not.toBeNull()
    expect(badge.closest('.border-t')).not.toBeNull()
  })

  it('profile variant (wholeCardLink): the entire card is one link with no nested controls', () => {
    render(
      <CollectionPosterCard
        tag="cool-stuff"
        count={2}
        tiles={TILES}
        href="/t/curator/cool-stuff"
        wholeCardLink
      />,
    )

    const link = screen.getByRole('link', { name: 'View #cool-stuff' })
    expect(link).toHaveAttribute('href', '/t/curator/cool-stuff')

    // Title and count are inside the single link.
    expect(link).toHaveTextContent('#cool-stuff')
    expect(link.querySelector('[title="2 posts"]')).not.toBeNull()

    // No nested interactive elements (buttons/anchors) inside the card link.
    expect(link.querySelectorAll('a, button')).toHaveLength(0)
  })

  it('profile variant applies featured scaling classes for the single-collection showcase', () => {
    render(
      <CollectionPosterCard
        tag="solo"
        count={3}
        tiles={TILES}
        href="/t/curator/solo"
        wholeCardLink
        featured
      />,
    )

    const title = screen.getByText('#solo')
    expect(title.className).toContain('text-[26px]')
  })

  it('the post-count badge always renders, even with no other stats (fixed footer geometry)', () => {
    render(<CollectionPosterCard tag="bare" count={0} tiles={[]} href="/?tag=bare" tilesLoading />)
    expect(screen.getByTitle('0 posts')).toBeInTheDocument()
  })

  describe('adaptive mosaic', () => {
    it('renders a single filled placeholder cell for 0 tiles', () => {
      const { container } = render(
        <CollectionPosterCard tag="empty" count={0} tiles={[]} href="/?tag=empty" />,
      )
      const grid = container.querySelector('.grid')!
      expect(grid.className).toContain('grid-cols-1')
      expect(grid.children).toHaveLength(1)
    })

    it('renders a single tile filling the whole card for 1 tile', () => {
      const { container } = render(
        <CollectionPosterCard
          tag="one"
          count={1}
          tiles={[{ text: 'only post' }]}
          href="/?tag=one"
        />,
      )
      const grid = container.querySelector('.grid')!
      expect(grid.className).toContain('grid-cols-1')
      expect(grid.children).toHaveLength(1)
      expect(screen.getByText('only post')).toBeInTheDocument()
    })

    it('renders two full-height columns for 2 tiles', () => {
      const { container } = render(
        <CollectionPosterCard tag="two" count={2} tiles={TILES} href="/?tag=two" />,
      )
      const grid = container.querySelector('.grid')!
      expect(grid.className).toContain('grid-cols-2')
      expect(grid.className).toContain('grid-rows-1')
      expect(grid.children).toHaveLength(2)
    })

    it('spans the 3rd tile across both columns on the bottom row for 3 tiles', () => {
      const threeTiles = [...TILES, { text: 'third excerpt' }]
      const { container } = render(
        <CollectionPosterCard tag="three" count={3} tiles={threeTiles} href="/?tag=three" />,
      )
      const grid = container.querySelector('.grid')!
      expect(grid.className).toContain('grid-cols-2')
      expect(grid.className).toContain('grid-rows-2')
      expect(grid.children).toHaveLength(3)
      expect(grid.children[2]!.className).toContain('col-span-2')
    })

    it('renders a plain 2x2 for exactly 4 tiles when the collection has no more posts', () => {
      const fourTiles = [...TILES, { text: 'third' }, { text: 'fourth' }]
      const { container } = render(
        <CollectionPosterCard tag="four" count={4} tiles={fourTiles} href="/?tag=four" />,
      )
      const grid = container.querySelector('.grid')!
      expect(grid.children).toHaveLength(4)
      expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument()
    })

    it('turns the 4th cell into a "+N" overflow when the collection has more posts than tiles', () => {
      const fourTiles = [...TILES, { text: 'third' }, { text: 'fourth' }]
      render(<CollectionPosterCard tag="many" count={9} tiles={fourTiles} href="/?tag=many" />)
      // N = count - 3 (the 3 real tiles still shown alongside the overflow cell).
      expect(screen.getByText('+6')).toBeInTheDocument()
    })

    it('shows the pulsing skeleton mosaic when tilesLoading, ignoring the real tile count', () => {
      const { container } = render(
        <CollectionPosterCard
          tag="loading"
          count={5}
          tiles={[]}
          href="/?tag=loading"
          tilesLoading
        />,
      )
      const grid = container.querySelector('.grid')!
      expect(grid.children).toHaveLength(4)
      expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4)
    })
  })

  describe('rank medallion', () => {
    it('renders no medallion when rank is omitted', () => {
      const { container } = render(
        <CollectionPosterCard tag="norank" count={1} tiles={TILES} href="/?tag=norank" />,
      )
      expect(container.querySelector('.top-3.left-3')).toBeNull()
    })

    it('renders the gold treatment for rank 1', () => {
      const { container } = render(
        <CollectionPosterCard
          tag="first"
          count={1}
          tiles={TILES}
          href="/t/curator/first"
          wholeCardLink
          rank={1}
        />,
      )
      const medallion = container.querySelector('.left-3.top-3')
      expect(medallion?.className).toContain('shadow-glow')
      expect(medallion).toHaveTextContent('1')
    })

    it('renders a clay circle for ranks 2-3', () => {
      const { container } = render(
        <CollectionPosterCard
          tag="second"
          count={1}
          tiles={TILES}
          href="/t/curator/second"
          wholeCardLink
          rank={2}
        />,
      )
      const medallion = container.querySelector('.left-3.top-3')
      expect(medallion?.className).toContain('bg-clay-grad')
      expect(medallion).toHaveTextContent('2')
    })

    it('renders a glass circle for rank 4+', () => {
      const { container } = render(
        <CollectionPosterCard
          tag="fourth"
          count={1}
          tiles={TILES}
          href="/t/curator/fourth"
          wholeCardLink
          rank={7}
        />,
      )
      const medallion = container.querySelector('.left-3.top-3')
      expect(medallion?.className).toContain('bg-black/55')
      expect(medallion).toHaveTextContent('7')
    })

    it('is safe to combine with wholeCardLink (non-interactive, unlike badge/children)', () => {
      render(
        <CollectionPosterCard
          tag="cool-stuff"
          count={1}
          tiles={TILES}
          href="/t/curator/cool-stuff"
          wholeCardLink
          rank={3}
        />,
      )
      const link = screen.getByRole('link', { name: 'View #cool-stuff' })
      expect(link.querySelectorAll('a, button')).toHaveLength(0)
    })
  })

  describe('Discovery stats (docs/specs/discovery-leaderboards.md §6)', () => {
    it('renders the view/save counts and a "#N" clay rank chip when charting', () => {
      render(
        <CollectionPosterCard
          tag="cool-stuff"
          count={2}
          tiles={TILES}
          href="/?tag=cool-stuff"
          stats={{ viewCount: 42, cloneCount: 5, rank: 3 }}
        />,
      )

      expect(screen.getByTitle('42 views')).toBeInTheDocument()
      expect(screen.getByTitle('5 saves')).toBeInTheDocument()
      expect(screen.getByText('#3')).toBeInTheDocument()
      // No "views"/"saves"/"posts" words rendered as visible text.
      expect(screen.queryByText(/this week/)).not.toBeInTheDocument()
    })

    it('omits the rank chip when stats has no rank (not charting)', () => {
      render(
        <CollectionPosterCard
          tag="cool-stuff"
          count={2}
          tiles={TILES}
          href="/?tag=cool-stuff"
          stats={{ viewCount: 42, cloneCount: 5, rank: null }}
        />,
      )

      expect(screen.getByTitle('42 views')).toBeInTheDocument()
      expect(screen.queryByText(/^#\d/)).not.toBeInTheDocument()
    })

    it('renders neither stat badges nor a "Private" note by default (byte-compatible with existing callers)', () => {
      render(
        <CollectionPosterCard tag="cool-stuff" count={2} tiles={TILES} href="/?tag=cool-stuff" />,
      )

      expect(screen.queryByText('Private')).not.toBeInTheDocument()
      expect(screen.queryByTitle(/views|saves/)).not.toBeInTheDocument()
      // The post-count badge is still there — row 2 is always rendered.
      expect(screen.getByTitle('2 posts')).toBeInTheDocument()
    })
  })

  describe('curator badge (leaderboard usage)', () => {
    it('renders a top-right User-icon badge with the handle when curator is passed', () => {
      render(
        <CollectionPosterCard
          tag="cool-stuff"
          count={1}
          tiles={TILES}
          href="/t/alice/cool-stuff"
          wholeCardLink
          curator="alice"
        />,
      )

      expect(screen.getByText('alice')).toBeInTheDocument()
    })

    it('is non-interactive and safe to combine with wholeCardLink', () => {
      render(
        <CollectionPosterCard
          tag="cool-stuff"
          count={1}
          tiles={TILES}
          href="/t/alice/cool-stuff"
          wholeCardLink
          curator="alice"
        />,
      )

      const link = screen.getByRole('link', { name: 'View #cool-stuff' })
      expect(link.querySelectorAll('a, button')).toHaveLength(0)
    })

    it('badge wins over curator when both are passed', () => {
      render(
        <CollectionPosterCard
          tag="cool-stuff"
          count={1}
          tiles={TILES}
          href="/?tag=cool-stuff"
          badge={<span data-testid="badge">Public</span>}
          curator="alice"
        />,
      )

      expect(screen.getByTestId('badge')).toBeInTheDocument()
      expect(screen.queryByText('alice')).not.toBeInTheDocument()
    })

    it('renders no top-right overlay when neither badge nor curator is passed', () => {
      render(
        <CollectionPosterCard tag="cool-stuff" count={1} tiles={TILES} href="/?tag=cool-stuff" />,
      )

      expect(screen.queryByTestId('badge')).not.toBeInTheDocument()
    })
  })
})
