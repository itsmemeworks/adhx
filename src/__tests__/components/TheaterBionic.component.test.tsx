/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { TheaterLinkedText } from '@/components/theater/TheaterText'
import { TheaterCaption } from '@/components/theater/TheaterCaption'
import { StageText } from '@/components/theater/StageText'
import { StageArticle } from '@/components/theater/StageArticle'
import type { TheaterItem } from '@/components/theater/types'

const prefs = { bionicReading: true, bodyFont: 'ibm-plex' as const, avatarSource: 'x' as const }

vi.mock('@/lib/preferences-context', () => ({
  usePreferences: () => ({
    preferences: prefs,
    updatePreference: vi.fn(),
    loading: false,
  }),
  PreferencesProvider: ({ children }: { children: React.ReactNode }) => children,
  FONT_OPTIONS: {},
}))

vi.mock('@/lib/theater/article-body', () => ({
  fetchArticleMarkdown: vi.fn(),
}))

vi.mock('@/lib/theater/share-tweet', () => ({
  fetchShareTweet: vi.fn().mockResolvedValue(null),
}))

import { fetchArticleMarkdown } from '@/lib/theater/article-body'

function textItem(overrides: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '20',
    author: 'jack',
    authorName: 'jack',
    authorAvatarUrl: 'https://example.com/jack.jpg',
    text: 'just setting up my twttr',
    thumbnailUrl: null,
    url: '/jack/status/20',
    createdAt: '2006-03-21T00:00:00Z',
    saveCount: 1,
    trendCount: 1,
    contentType: 'text',
    ...overrides,
  } as TheaterItem
}

function articleItem(): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '2062117744519057466',
    author: 'adriamatz',
    authorName: 'Adrià Martinez',
    text: 'How You Can Build Your Own Army',
    thumbnailUrl: 'https://example.com/cover.jpg',
    url: '/adriamatz/status/2062117744519057466',
    createdAt: '2026-08-18T00:00:00Z',
    saveCount: 1,
    trendCount: 1,
    contentType: 'article',
  } as TheaterItem
}

describe('theater Bionic Reading', () => {
  beforeEach(() => {
    prefs.bionicReading = true
    vi.mocked(fetchArticleMarkdown).mockReset()
    vi.mocked(fetchArticleMarkdown).mockResolvedValue(null)
  })

  it('bolds the first part of each word in Read-mode typeset text', () => {
    const { container } = render(<StageText item={textItem()} />)
    const body = container.querySelector('p')
    expect(body?.textContent).toBe('just setting up my twttr')
    expect(body?.querySelector('strong')).not.toBeNull()
    expect(body?.querySelector('[aria-label="just setting up my twttr"]')).not.toBeNull()
  })

  it('bolds words in a quoted tweet inside the reader', () => {
    const { container } = render(
      <StageText
        item={textItem({
          contentType: 'quote',
          quote: {
            author: 'mark_k',
            authorName: 'Mark',
            text: 'wonderful prophecy',
          },
        })}
      />,
    )
    const quote = [...container.querySelectorAll('p')].find(
      (p) => p.textContent === 'wonderful prophecy',
    )
    expect(quote?.querySelector('strong')).not.toBeNull()
  })

  it('leaves the two-line media caption overlay unstyled', () => {
    const { container } = render(
      createElement(TheaterCaption, {
        captionRef: { current: null },
        platform: 'twitter',
        text: 'just setting up my twttr',
      }),
    )
    expect(container.querySelector('strong')).toBeNull()
    expect(container.textContent).toBe('just setting up my twttr')
  })

  it('can be forced off even when the preference is on', () => {
    const { container } = render(
      <TheaterLinkedText text="just setting up my twttr" platform="twitter" bionic={false} />,
    )
    expect(container.querySelector('strong')).toBeNull()
  })

  it('does not bold when the preference is off', () => {
    prefs.bionicReading = false
    render(<StageText item={textItem()} />)
    const body = screen.getByText('just setting up my twttr')
    expect(body.querySelector('strong')).toBeNull()
  })

  it('bolds the article headline and body when the preference is on', async () => {
    vi.mocked(fetchArticleMarkdown).mockResolvedValue(
      'The quick brown fox jumps over the lazy dog.',
    )
    render(<StageArticle item={articleItem()} />)

    const heading = screen.getByRole('heading', { name: 'How You Can Build Your Own Army' })
    expect(heading.querySelector('strong')).not.toBeNull()

    await waitFor(() => {
      expect(
        screen.getByLabelText('The quick brown fox jumps over the lazy dog.'),
      ).toBeInTheDocument()
    })
    const para = screen.getByLabelText('The quick brown fox jumps over the lazy dog.')
    expect(para.querySelector('strong')).not.toBeNull()
    expect(para.querySelector('strong')?.closest('a')).toBeNull()
  })

  it('does not nest bionic bold inside markdown bold', async () => {
    vi.mocked(fetchArticleMarkdown).mockResolvedValue('a **bold** word')
    render(<StageArticle item={articleItem()} />)
    await waitFor(() => {
      expect(screen.getByText(/bold/)).toBeInTheDocument()
    })
    const markdownBold = screen.getByText('bold').closest('strong')
    expect(markdownBold).not.toBeNull()
    expect(markdownBold?.querySelector('strong')).toBeNull()
  })
})
