/**
 * @vitest-environment jsdom
 *
 * `CollectionPosterCard` (`@/components/tags/PosterCard.tsx`) — asserts the
 * two link structures the component supports:
 *
 * - default (`/tags` usage): only the mosaic area is a `<Link>`; `badge`/
 *   `children` render as interactive controls OUTSIDE that link, since
 *   nesting a button/anchor inside an `<a>` is invalid HTML.
 * - `wholeCardLink` (public profile usage, `/t/{username}`): the entire
 *   card — mosaic + title/count footer — is a single `<Link>`, with no
 *   nested interactive controls.
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

    // Title/count text still renders, just outside the link.
    expect(screen.getByText('#cool-stuff')).toBeInTheDocument()
    expect(screen.getByText('2 posts')).toBeInTheDocument()
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
    expect(link).toHaveTextContent('2 posts')

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
    expect(title.className).toContain('text-[30px]')
  })
})
