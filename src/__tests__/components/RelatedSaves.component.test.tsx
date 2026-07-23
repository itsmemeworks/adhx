/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RelatedSaves } from '@/components/RelatedSaves'

vi.mock('@/lib/related/query', () => ({
  getRelatedSaves: vi.fn(),
}))

import { getRelatedSaves } from '@/lib/related/query'

/**
 * `RelatedSaves` is an async server component — call it directly (it's just
 * an async function returning JSX) and render the resolved element, mirroring
 * how Next.js itself awaits server components before handing them to React.
 */
async function renderRelatedSaves(props: Parameters<typeof RelatedSaves>[0]) {
  const element = await RelatedSaves(props)
  render(element as React.ReactElement)
}

describe('RelatedSaves', () => {
  it('renders nothing when there are no related items', async () => {
    vi.mocked(getRelatedSaves).mockResolvedValue([])
    const { container } = render(
      (await RelatedSaves({
        platform: 'twitter',
        bookmarkId: '1',
        authorHandle: 'alice',
      })) as React.ReactElement | null,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a card per related item, linking to its on-ADHX preview path', async () => {
    vi.mocked(getRelatedSaves).mockResolvedValue([
      {
        platform: 'twitter',
        bookmarkId: '2',
        author: 'bob',
        authorName: 'Bob',
        authorAvatarUrl: null,
        text: 'A great post about tea',
        thumbnailUrl: null,
        contentType: 'text',
        url: '/bob/status/2',
      },
    ])

    await renderRelatedSaves({ platform: 'twitter', bookmarkId: '1', authorHandle: 'alice' })

    const link = screen.getByRole('link', { name: /A great post about tea/i })
    expect(link).toHaveAttribute('href', '/bob/status/2')
  })

  it('links "More from @author" to the author-hub contract path', async () => {
    vi.mocked(getRelatedSaves).mockResolvedValue([
      {
        platform: 'twitter',
        bookmarkId: '2',
        author: 'bob',
        text: 'hi',
        url: '/bob/status/2',
      },
    ])

    await renderRelatedSaves({ platform: 'twitter', bookmarkId: '1', authorHandle: '@alice' })

    const authorLink = screen.getByRole('link', { name: /More from @alice/i })
    expect(authorLink).toHaveAttribute('href', '/alice')
  })
})
