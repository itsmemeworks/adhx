/**
 * @vitest-environment jsdom
 */
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPublicTagCollection: vi.fn(),
  fetchWithAllowlistedRedirects: vi.fn(),
  readResponseBodyWithLimit: vi.fn(),
}))

vi.mock('@/lib/tags/query', () => ({
  getPublicTagCollection: mocks.getPublicTagCollection,
}))

vi.mock('@/lib/media/proxy', () => ({
  fetchWithAllowlistedRedirects: mocks.fetchWithAllowlistedRedirects,
  readResponseBodyWithLimit: mocks.readResponseBodyWithLimit,
}))

vi.mock('next/og', () => ({
  ImageResponse: class MockImageResponse {
    element: ReactElement
    options: Record<string, unknown>

    constructor(element: ReactElement, options: Record<string, unknown>) {
      this.element = element
      this.options = options
    }
  },
}))

function item(
  id: string,
  overrides: Partial<{
    platform: string
    author: string
    authorName: string | null
    text: string | null
    thumbnailUrl: string | null
    contentType: 'video' | 'photo' | 'text' | 'article'
  }> = {},
) {
  return {
    bookmarkId: id,
    platform: 'twitter',
    author: `author${id}`,
    authorName: `Author ${id}`,
    authorAvatarUrl: null,
    text: `Post ${id} verbatim text`,
    thumbnailUrl: `https://pbs.twimg.com/media/${id}.jpg`,
    extraMediaCount: 0,
    contentType: 'photo' as const,
    createdAt: '2026-08-27T12:00:00.000Z',
    addedAt: '2026-08-27T12:00:00.000Z',
    url: `/author${id}/status/${id}`,
    externalUrl: `https://x.com/author${id}/status/${id}`,
    ...overrides,
  }
}

function collection(items: ReturnType<typeof item>[]) {
  return {
    status: 'ok' as const,
    data: {
      tag: 'good-stuff',
      username: 'curator',
      items,
      tweetCount: items.length,
    },
  }
}

async function renderRoute(username = 'curator', tag = 'good-stuff') {
  const { GET } = await import('@/app/api/og/playlist/[username]/[tag]/route')
  const result = (await GET(
    {
      nextUrl: new URL(
        `https://adhx.com/api/og/playlist/${encodeURIComponent(username)}/${encodeURIComponent(tag)}`,
      ),
    } as never,
    {
      params: Promise.resolve({ username, tag }),
    },
  )) as unknown as { element: ReactElement; options: Record<string, unknown> }
  return {
    html: renderToStaticMarkup(result.element),
    options: result.options,
  }
}

describe('playlist social-card route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    )
    mocks.fetchWithAllowlistedRedirects.mockImplementation(async (url: string) => {
      return new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'Content-Type': 'image/png', 'X-Test-URL': url },
      })
    })
    mocks.readResponseBodyWithLimit.mockResolvedValue(new Uint8Array([1, 2, 3]))
  })

  it('renders the five-tile public mosaic, video badge, overflow chip, and brand bar', async () => {
    const items = [
      item('1', { contentType: 'video' }),
      item('2'),
      item('3'),
      item('4'),
      item('5'),
      item('6'),
      item('7'),
    ]
    mocks.getPublicTagCollection.mockResolvedValue({
      ...collection(items),
      data: { ...collection(items).data, tweetCount: 7 },
    })

    const { html, options } = await renderRoute()

    expect(html.match(/data:image\/png;base64/g)).toHaveLength(5)
    expect(html).toContain('+2 more')
    expect(html).toContain('#good-stuff')
    expect(html).toContain('curated by @curator · 7 posts')
    expect(html).toContain('Watch playlist')
    expect(options).toMatchObject({
      width: 1200,
      height: 630,
      fonts: [{ name: 'Indie Flower', weight: 400 }],
    })
  })

  it('uses verbatim typographic tiles when no usable thumbnails exist', async () => {
    mocks.getPublicTagCollection.mockResolvedValue(
      collection([
        item('1', {
          thumbnailUrl: null,
          text: 'Exact article title',
          contentType: 'article',
        }),
        item('2', {
          thumbnailUrl: null,
          text: 'Exact post body',
          platform: 'instagram',
          contentType: 'text',
        }),
      ]),
    )

    const { html } = await renderRoute()

    expect(html).toContain('Exact article title')
    expect(html).toContain('Exact post body')
    expect(html).toContain('ARTICLE')
    expect(html).toContain('IG')
    expect(mocks.fetchWithAllowlistedRedirects).toHaveBeenCalledTimes(1)
    expect(mocks.fetchWithAllowlistedRedirects.mock.calls[0]![0]).toContain(
      'raw.githubusercontent.com/google/fonts/',
    )
  })

  it('rejects recursive same-origin OG URLs as thumbnail candidates', async () => {
    mocks.getPublicTagCollection.mockResolvedValue(
      collection([
        item('1', {
          thumbnailUrl: 'https://adhx.com/api/og/playlist/curator/good-stuff',
          text: 'Safe text fallback',
          contentType: 'text',
        }),
      ]),
    )

    const { html } = await renderRoute()
    const requestedUrls = mocks.fetchWithAllowlistedRedirects.mock.calls.map(([url]) => url)

    expect(html).toContain('Safe text fallback')
    expect(requestedUrls).toHaveLength(1)
    expect(requestedUrls[0]).toContain('raw.githubusercontent.com/google/fonts/')
  })

  it('renders an identified paper fallback for an empty public playlist', async () => {
    mocks.getPublicTagCollection.mockResolvedValue(collection([]))

    const { html } = await renderRoute()

    expect(html).toContain('#good-stuff')
    expect(html).toContain('curated by @curator · 0 posts')
    expect(html).toContain('background-color:#e4dac8')
  })

  it.each([{ status: 'private' }, { status: 'not_found' }])(
    'renders a fully generic card for $status playlists',
    async (result) => {
      mocks.getPublicTagCollection.mockResolvedValue(result)

      const { html } = await renderRoute('secret-owner', 'secret-tag')

      expect(html).toContain('Save it. Lose it. Find it.')
      expect(html).toContain('adhx.com')
      expect(html).not.toContain('secret-owner')
      expect(html).not.toContain('secret-tag')
    },
  )

  it('forces the constant generic-card URL to stay anonymous even if its slug is claimed', async () => {
    mocks.getPublicTagCollection.mockResolvedValue(collection([item('1')]))
    const { GET } = await import('@/app/api/og/playlist/[username]/[tag]/route')
    const result = (await GET(
      {
        nextUrl: new URL('https://adhx.com/api/og/playlist/brand/card?generic=1'),
      } as never,
      {
        params: Promise.resolve({ username: 'brand', tag: 'card' }),
      },
    )) as unknown as { element: ReactElement }
    const html = renderToStaticMarkup(result.element)

    expect(html).toContain('Save it. Lose it. Find it.')
    expect(html).not.toContain('good-stuff')
    expect(html).not.toContain('curator')
    expect(mocks.getPublicTagCollection).not.toHaveBeenCalled()
  })
})
