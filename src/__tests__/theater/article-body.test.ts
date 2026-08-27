import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  articleSharePath,
  composeArticleCopy,
  fetchArticleDetails,
  fetchArticleMarkdown,
  resetArticleMarkdownCache,
} from '@/lib/theater/article-body'

afterEach(() => {
  resetArticleMarkdownCache()
  vi.unstubAllGlobals()
})

describe('composeArticleCopy', () => {
  it('prefixes the title when the body does not start with it', () => {
    expect(
      composeArticleCopy('How to get rich', '# Why an army\n\nOne account has a ceiling.'),
    ).toBe('How to get rich\n\n# Why an army\n\nOne account has a ceiling.')
  })

  it('does not repeat the title when the markdown already opens with it', () => {
    expect(
      composeArticleCopy('How to get rich', '# How to get rich\n\nOne account has a ceiling.'),
    ).toBe('# How to get rich\n\nOne account has a ceiling.')
  })

  it('returns whichever side is present', () => {
    expect(composeArticleCopy('', '# Body only')).toBe('# Body only')
    expect(composeArticleCopy('Title only', '  ')).toBe('Title only')
  })
})

describe('fetchArticleMarkdown', () => {
  it('keeps article title and cover metadata with the shared body fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        article: {
          title: 'A useful article',
          coverImageUrl: 'https://pbs.twimg.com/media/cover.jpg',
          content: '# Intro\n\nHello.',
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchArticleDetails('writer', '123')).resolves.toEqual({
      title: 'A useful article',
      coverImageUrl: 'https://pbs.twimg.com/media/cover.jpg',
      content: '# Intro\n\nHello.',
    })
    await expect(fetchArticleMarkdown('writer', '123')).resolves.toBe('# Intro\n\nHello.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reads article.content from the share tweet API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ article: { content: '# Intro\n\nHello.' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchArticleMarkdown('adriamatz', '123')).resolves.toBe('# Intro\n\nHello.')
    expect(fetchMock).toHaveBeenCalledWith(
      articleSharePath('adriamatz', '123'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('coalesces concurrent fetches for the same article', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ article: { content: 'body' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const [a, b] = await Promise.all([
      fetchArticleMarkdown('bob', '2'),
      fetchArticleMarkdown('bob', '2'),
    ])
    expect(a).toBe('body')
    expect(b).toBe('body')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null when the payload has no article body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ article: { title: 'Just a title' } }),
      }),
    )
    await expect(fetchArticleMarkdown('bob', '2')).resolves.toBeNull()
  })
})
