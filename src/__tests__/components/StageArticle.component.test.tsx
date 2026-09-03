/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { StageArticle } from '@/components/theater/StageArticle'
import { STAGE_TEXT_SCROLL_PAD } from '@/components/theater/stage-primitives'
import type { TheaterItem } from '@/components/theater/types'

vi.mock('@/lib/theater/article-body', () => ({
  fetchArticleDetails: vi.fn().mockResolvedValue(null),
}))

import { fetchArticleDetails } from '@/lib/theater/article-body'

function articleItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '2062117744519057466',
    author: 'adriamatz',
    authorName: 'Adrià Martinez',
    authorAvatarUrl: 'https://example.com/adria.jpg',
    text: 'How You Can Build Your Own Army of AI Influencers to Promote Your App',
    thumbnailUrl: 'https://example.com/cover.jpg',
    url: '/adriamatz/status/2062117744519057466',
    createdAt: '2026-08-18T00:00:00Z',
    saveCount: 1,
    trendCount: 1,
    contentType: 'article',
    ...overrides,
  } as TheaterItem
}

describe('StageArticle splash', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchArticleDetails).mockResolvedValue(null)
  })

  it('shows the author avatar and username instead of an Article type chip', async () => {
    render(<StageArticle item={articleItem()} />)
    expect(screen.getByRole('img', { name: 'adriamatz' })).toBeInTheDocument()
    expect(screen.getByText('Adrià Martinez')).toBeInTheDocument()
    expect(screen.getByText('@adriamatz')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'How You Can Build Your Own Army of AI Influencers to Promote Your App',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Article')).not.toBeInTheDocument()
    expect(document.querySelector('.lucide-file-text')).toBeNull()
    const profile = screen.getByTitle('View @adriamatz on X')
    expect(profile).toHaveAttribute('href', 'https://x.com/adriamatz')
    expect(profile).toHaveAttribute('target', '_blank')
    expect(profile.parentElement?.children).toHaveLength(1)
    await waitFor(() => {
      expect(screen.getByText(/Couldn't load the full article here/)).toBeInTheDocument()
    })
  })

  it('pads the reader so the last lines can scroll above the action row', async () => {
    render(<StageArticle item={articleItem()} />)
    const scroller = document.querySelector('.overflow-y-auto')
    expect(scroller?.className).toContain(STAGE_TEXT_SCROLL_PAD)
    await waitFor(() => {
      expect(screen.getByText(/Couldn't load the full article here/)).toBeInTheDocument()
    })
  })

  it('repairs a sparse seed with the title and cover returned by the article API', async () => {
    vi.mocked(fetchArticleDetails).mockResolvedValue({
      title: 'The actual article headline',
      coverImageUrl: 'https://pbs.twimg.com/media/cover.jpg',
      content: 'The article body.',
    })
    const { container } = render(
      <StageArticle item={articleItem({ text: 'https://t.co/wrapper', thumbnailUrl: null })} />,
    )

    expect(
      await screen.findByRole('heading', { name: 'The actual article headline' }),
    ).toBeInTheDocument()
    expect(
      container.querySelector('img[src="https://pbs.twimg.com/media/cover.jpg"]'),
    ).not.toBeNull()
    expect(await screen.findByText('The article body.')).toBeInTheDocument()
  })
})
