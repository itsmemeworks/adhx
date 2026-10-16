import { describe, expect, it, vi } from 'vitest'
import { buildSearchDocuments, documentInput, splitPassages } from './documents'
import { normalizedVector, rankDocuments, SearchIndex } from './engine'
import { loadSearchCorpus } from './corpus'
import type { FeedItem } from '@/components/feed/types'

const item = (overrides: Partial<FeedItem> = {}): FeedItem => ({
  id: '1',
  platform: 'twitter',
  author: 'author',
  text: 'A saved post',
  tweetUrl: 'https://x.com/author/status/1',
  processedAt: '2026-10-16',
  isArchived: false,
  media: null,
  links: null,
  tags: [],
  ...overrides,
})
const vector = (axis = 0) => Array.from({ length: 768 }, (_, i) => (i === axis ? 1 : 0))

describe('context search content and ranking', () => {
  it('indexes article bodies, quote context, link previews, alt text and tags without raw JSON', () => {
    const documents = buildSearchDocuments([
      item({
        articleContent: {
          blocks: [{ key: 'a', type: 'unstyled', text: 'A buried article detail' }],
        },
        quoteContext: { tweetId: '2', author: 'other', text: 'Quoted context' },
        links: [
          {
            id: 1,
            bookmarkId: '1',
            expandedUrl: 'https://example.com',
            previewTitle: 'Link title',
            previewDescription: 'A useful preview',
          },
        ],
        media: [
          {
            id: 'm',
            mediaType: 'photo',
            url: '',
            thumbnailUrl: '',
            shareUrl: '',
            altText: 'Visible text in a screenshot',
          },
        ],
        tags: ['reference'],
      }),
    ])
    for (const expected of [
      'A buried article detail',
      'Quoted context',
      'A useful preview',
      'Visible text in a screenshot',
      'reference',
    ]) {
      expect(documents.some((document) => document.text.includes(expected))).toBe(true)
    }
    expect(documents.every((document) => document.key === 'twitter:1')).toBe(true)
    expect(documentInput(documents[0])).toMatch(/^title: .+ \| text: /)
  })

  it('preserves a detail at a passage boundary and reaches the end of long content', () => {
    const text = `${'word '.repeat(235)}the remembered detail ${'tail '.repeat(700)}end-marker`
    const passages = splitPassages(text)
    expect(passages.some((passage) => passage.includes('the remembered detail'))).toBe(true)
    expect(passages.at(-1)).toContain('end-marker')
    expect(passages.every((passage) => passage.length <= 1200)).toBe(true)
  })

  it('collapses passages into one result while keeping platform identities distinct', () => {
    const documents = [
      { key: 'twitter:1', title: 'A', text: 'Weak passage', source: 'Post' },
      { key: 'twitter:1', title: 'A', text: 'Best passage', source: 'Article' },
      { key: 'tiktok:1', title: 'B', text: 'Another platform', source: 'Post' },
    ]
    const matches = rankDocuments(
      documents,
      [vector(1), vector(), vector()],
      'a description',
      vector(),
    )
    expect(matches).toHaveLength(2)
    expect(matches.find((match) => match.key === 'twitter:1')?.text).toBe('Best passage')
  })

  it('keeps precise phrase matches and rejects non-finite embeddings', () => {
    expect(
      rankDocuments(
        [{ key: 'twitter:1', title: 'Shaders', text: 'A tool', source: 'Post' }],
        [vector(1)],
        'shaders',
        vector(),
      ),
    ).toHaveLength(1)
    expect(() => normalizedVector([NaN])).toThrow('invalid')
    expect(() => normalizedVector(Array(768).fill(0))).toThrow('empty')
  })

  it('reuses unchanged passage vectors, reindexes edits, and never ranks deleted passages', async () => {
    const embed = vi.fn(async (texts: string[]) => texts.map(() => vector()))
    const index = new SearchIndex(embed)
    const first = { key: 'twitter:1', title: 'A', text: 'Original', source: 'Post' }
    await index.search([first], 'remember this')
    expect(embed).toHaveBeenCalledTimes(2)
    await index.search([first], 'another query')
    expect(embed).toHaveBeenCalledTimes(3)
    await index.search([{ ...first, text: 'Updated' }], 'another query')
    expect(embed).toHaveBeenCalledTimes(5)
    expect(await index.search([], 'another query')).toEqual([])
  })

  it('discards a superseded query after inference completes', async () => {
    let current = true
    const index = new SearchIndex(async (texts) => {
      current = false
      return texts.map(() => vector())
    })
    expect(
      await index.search(
        [{ key: 'twitter:1', title: 'A', text: 'Text', source: 'Post' }],
        'query',
        undefined,
        () => current,
      ),
    ).toEqual([])
  })
})

describe('context search corpus isolation', () => {
  it('loads every page and includes archived content for explicit filtering', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accountId: 'a', items: [item()], pagination: { totalPages: 2 } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accountId: 'a',
            items: [item({ id: '2', isArchived: true })],
            pagination: { totalPages: 2 },
          }),
        ),
      )
    try {
      expect(await loadSearchCorpus('a', new AbortController().signal)).toHaveLength(2)
      expect(fetcher.mock.calls[1][0]).toContain('page=2&hideArchived=false')
    } finally {
      fetcher.mockRestore()
    }
  })

  it('fails closed when the cookie account changes between pages', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accountId: 'a', items: [item()], pagination: { totalPages: 2 } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accountId: 'b',
            items: [item({ id: 'private' })],
            pagination: { totalPages: 2 },
          }),
        ),
      )
    try {
      await expect(loadSearchCorpus('a', new AbortController().signal)).rejects.toThrow(
        'account changed',
      )
    } finally {
      fetcher.mockRestore()
    }
  })

  it('reports a failed later page instead of searching an incomplete collection', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accountId: 'a', items: [item()], pagination: { totalPages: 2 } }),
        ),
      )
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
    try {
      await expect(loadSearchCorpus('a', new AbortController().signal)).rejects.toThrow(
        'could not be loaded',
      )
    } finally {
      fetcher.mockRestore()
    }
  })
})
