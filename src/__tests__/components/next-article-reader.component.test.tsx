// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { FeedItem } from '@/components/feed/types'

const fetchArticleMarkdown = vi.fn(
  async (_author: string, _id: string): Promise<string | null> => null,
)
vi.mock('@/lib/theater/article-body', () => ({
  fetchArticleMarkdown: (author: string, id: string) => fetchArticleMarkdown(author, id),
}))

let bionic = false
vi.mock('@/lib/preferences-context', () => ({
  usePreferencesOptional: () => ({ preferences: { bionicReading: bionic, bodyFont: 'lexend' } }),
}))

import { ArticleReader } from '@/components/next/stages/ArticleReader'

const article = {
  id: '2110793000309985623',
  platform: 'twitter',
  author: 'businessbarista',
  authorName: 'Alex Lieberman',
  authorProfileImageUrl: null,
  text: 'https://x.com/i/article/1',
  tweetUrl: 'https://x.com/businessbarista/status/2110793000309985623',
  processedAt: '2026-10-16T09:00:00.000Z',
  isArchived: false,
  media: null,
  links: null,
  tags: [],
  category: 'article',
  articlePreview: {
    title: 'What Actually Goes Into an AI Strategy?',
    description: 'A grid that scores every initiative.',
    url: 'https://x.com/businessbarista/article/2110793000309985623',
  },
} as unknown as FeedItem

afterEach(() => {
  bionic = false
  vi.clearAllMocks()
})

describe('the article reader', () => {
  it('shows the whole article, not just the opening', async () => {
    fetchArticleMarkdown.mockResolvedValueOnce(
      '# What Actually Goes Into an AI Strategy?\n\nThe TLDR\n\n## The AI Portfolio Grid\n\n- Can we execute it today?\n- How big is the prize?\n\n> Strategy is what you stop doing.\n\nThe last paragraph.',
    )
    const onNext = vi.fn()
    render(<ArticleReader item={article} onClose={() => {}} onNext={onNext} />)
    expect(await screen.findByText('The last paragraph.')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: 'The AI Portfolio Grid' }),
    ).toBeInTheDocument()
    expect(screen.getByText('How big is the prize?')).toBeInTheDocument()
    // The headline isn't repeated from the body.
    expect(screen.getAllByText('What Actually Goes Into an AI Strategy?')).toHaveLength(1)
    expect(fetchArticleMarkdown).toHaveBeenCalledWith('businessbarista', '2110793000309985623')
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(onNext).toHaveBeenCalled()
  })

  it('reads in the chosen font, with Bionic Reading when it is on', async () => {
    bionic = true
    fetchArticleMarkdown.mockResolvedValueOnce('Reading every single word.')
    render(<ArticleReader item={article} onClose={() => {}} />)
    const paragraph = await screen.findByLabelText('Reading every single word.')
    expect(paragraph.querySelectorAll('strong').length).toBeGreaterThan(0)
    expect(paragraph.closest('article')).toHaveStyle({ fontFamily: 'var(--font-lexend)' })
  })

  it('falls back to the summary and a link, and closes on Escape', async () => {
    const onClose = vi.fn()
    render(<ArticleReader item={article} onClose={onClose} />)
    await waitFor(() => expect(screen.getByText(/didn’t load here/)).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Read it on X' })).toHaveAttribute(
      'href',
      'https://x.com/businessbarista/article/2110793000309985623',
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
