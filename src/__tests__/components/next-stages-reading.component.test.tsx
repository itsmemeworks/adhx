// @vitest-environment jsdom
/**
 * The redesign's text stages honour Settings → Watching and reading: Bionic
 * Reading on post, quote and article-summary text, and the reading font on
 * reading-sized text (short posts keep the poster serif unless Bionic is on).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { FeedItem } from '@/components/feed/types'
import { ArticleStage, PostStage } from '@/components/next'
import { READING_LENGTH } from '@/components/next/stages'

const prefs = vi.hoisted(() => ({
  current: null as null | {
    preferences: { bionicReading: boolean; bodyFont: string; soundOn: boolean }
    loading: boolean
  },
}))
vi.mock('@/lib/preferences-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/preferences-context')>()),
  usePreferencesOptional: () => prefs.current,
}))

function item(partial: Partial<FeedItem>): FeedItem {
  return {
    id: '1',
    platform: 'twitter',
    author: 'frog',
    authorName: 'Frog',
    authorProfileImageUrl: null,
    text: '',
    tweetUrl: 'https://x.com/frog/status/1',
    processedAt: '2026-10-16T09:00:00.000Z',
    isArchived: false,
    media: null,
    links: null,
    tags: [],
    ...partial,
  }
}

const SHORT = 'Frogs sing at night'
const LONG = `${'Frogs sing at night when the pond is warm. '.repeat(6)}`.trim()

function choose(settings: { bionicReading?: boolean; bodyFont?: string }) {
  prefs.current = {
    preferences: { bionicReading: false, bodyFont: 'ibm-plex', soundOn: false, ...settings },
    loading: false,
  }
}

/** The post's words: paragraphs inside one block that carries the type. */
function words(container: HTMLElement): HTMLElement {
  return container.querySelector('p')!.parentElement as HTMLElement
}

describe('reading settings on the redesign stages', () => {
  beforeEach(() => {
    prefs.current = null
  })

  it('keeps the poster serif on short posts, whatever the font', () => {
    choose({ bodyFont: 'lexend' })
    const { container } = render(<PostStage item={item({ text: SHORT })} />)
    const p = words(container)
    expect(p).toHaveTextContent(SHORT)
    expect(p).toHaveClass('font-nx-serif')
    expect(p.style.fontFamily).toBe('')
  })

  it('uses the reading font on long posts', () => {
    expect(LONG.length).toBeGreaterThan(READING_LENGTH)
    choose({ bodyFont: 'lexend' })
    const { container } = render(<PostStage item={item({ text: LONG })} />)
    const p = words(container)
    expect(p).toHaveTextContent(LONG)
    expect(p).not.toHaveClass('font-nx-serif')
    expect(p.style.fontFamily).toBe('var(--font-lexend)')
  })

  it('keeps the design fonts without a preferences provider', () => {
    const { container } = render(<PostStage item={item({ text: LONG })} />)
    expect(words(container)).toHaveClass('font-nx-serif')
  })

  it('bolds the start of each word with Bionic Reading, quotes included', () => {
    choose({ bionicReading: true, bodyFont: 'atkinson' })
    const { container } = render(
      <PostStage
        item={item({
          text: SHORT,
          isQuote: true,
          quoteContext: { author: 'toad', text: 'Toads hum too' } as FeedItem['quoteContext'],
        })}
      />,
    )
    const bolds = Array.from(container.querySelectorAll('strong')).map((s) => s.textContent)
    expect(bolds).toEqual(['Fr', 'si', 'a', 'ni', 'To', 'h', 't'])
    expect(container.querySelector('p')).toHaveTextContent(SHORT)
    // The poster serif has no bold, so Bionic Reading switches to the reading font.
    expect(words(container)).not.toHaveClass('font-nx-serif')
    expect(words(container).style.fontFamily).toBe('var(--font-atkinson)')
    // Translation safety: no element mixes a text node with element children.
    for (const el of Array.from(container.querySelectorAll('*'))) {
      const nodes = Array.from(el.childNodes)
      const text = nodes.some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
      expect(text && nodes.some((n) => n.nodeType === Node.ELEMENT_NODE)).toBe(false)
    }
    const quote = container.querySelector('span.line-clamp-3') as HTMLElement
    expect(quote).toHaveTextContent('Toads hum too')
    expect(quote.style.fontFamily).toBe('var(--font-atkinson)')
  })

  it('leaves text plain when Bionic Reading is off', () => {
    choose({ bionicReading: false })
    const { container } = render(<PostStage item={item({ text: SHORT })} />)
    expect(container.querySelector('p strong')).toBeNull()
  })

  it('applies both to the article summary, not the headline', () => {
    choose({ bionicReading: true, bodyFont: 'inter' })
    const { container } = render(
      <ArticleStage
        item={item({
          text: 'https://t.co/xyz',
          category: 'article',
          articlePreview: {
            title: 'Why frogs sing',
            description: 'Warm evenings bring the chorus.',
            imageUrl: null,
            url: 'https://example.com/frogs',
          },
        })}
      />,
    )
    const heading = screen.getByRole('heading', { name: 'Why frogs sing' })
    expect(heading.querySelector('strong')).toBeNull()
    const lede = container.querySelector('p') as HTMLElement
    expect(lede).toHaveTextContent('Warm evenings bring the chorus.')
    expect(lede.querySelector('strong')).not.toBeNull()
    expect(lede.style.fontFamily).toBe('var(--font-inter)')
  })
})
