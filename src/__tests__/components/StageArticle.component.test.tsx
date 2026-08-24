/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { StageArticle } from '@/components/theater/StageArticle'
import { STAGE_TEXT_SCROLL_PAD } from '@/components/theater/stage-primitives'
import type { TheaterItem } from '@/components/theater/types'

vi.mock('@/lib/theater/article-body', () => ({
  fetchArticleMarkdown: vi.fn().mockResolvedValue(null),
}))

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
})
