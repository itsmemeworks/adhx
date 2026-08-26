import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SharedResolveResult } from '@/lib/theater/shared-resolve'

const mocks = vi.hoisted(() => ({
  getReelMetadataStatus: vi.fn(),
  getTikTokMetadataStatus: vi.fn(),
  getYouTubeMetadataStatus: vi.fn(),
  getSavedPreviewDisplay: vi.fn(),
  recordHumanPreview: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ 'user-agent': 'Googlebot' })),
}))

vi.mock('@/lib/media/fxembed', () => ({
  fetchTweetData: vi.fn(),
  extractUrlsFromFacets: vi.fn().mockReturnValue([]),
}))

vi.mock('@/lib/utils/og-fetch', () => ({
  fetchOgMetadata: vi.fn(),
}))

vi.mock('@/lib/media/instafix', () => ({
  getReelMetadataStatus: mocks.getReelMetadataStatus,
}))

vi.mock('@/lib/media/tnktok', () => ({
  getTikTokMetadataStatus: mocks.getTikTokMetadataStatus,
}))

vi.mock('@/lib/media/youtube', () => ({
  getYouTubeMetadataStatus: mocks.getYouTubeMetadataStatus,
  youtubeEmbedUrl: (id: string) => `https://www.youtube-nocookie.com/embed/${id}`,
  youtubeThumbnail: (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
}))

vi.mock('@/lib/media/mirrors', () => ({
  resolveInstagramVideo: vi.fn(),
}))

vi.mock('@/lib/theater/shared-seed', () => ({
  buildSharedSeed: vi.fn(),
  reelToTheaterItem: ({
    id,
    author,
    text,
  }: {
    id: string
    author: string
    text: string | null
  }) => ({
    action: 'preview',
    platform: 'instagram',
    bookmarkId: id,
    author,
    text,
    contentType: 'video',
    url: `https://www.instagram.com/reel/${id}/`,
  }),
  tiktokToTheaterItem: ({
    id,
    handle,
    text,
  }: {
    id: string
    handle: string
    text: string | null
  }) => ({
    action: 'preview',
    platform: 'tiktok',
    bookmarkId: id,
    author: handle,
    text,
    contentType: 'video',
    url: `https://www.tiktok.com/@${handle}/video/${id}`,
  }),
  youtubeToTheaterItem: ({
    id,
    author,
    text,
  }: {
    id: string
    author: string
    text: string | null
  }) => ({
    action: 'preview',
    platform: 'youtube',
    bookmarkId: id,
    author,
    text,
    contentType: 'video',
    url: `https://www.youtube.com/shorts/${id}`,
  }),
  tweetToTheaterItem: vi.fn(),
}))

vi.mock('@/lib/theater/record-human-preview', () => ({
  recordHumanPreview: mocks.recordHumanPreview,
}))

vi.mock('@/lib/theater/saved-preview', () => ({
  getSavedPreviewDisplay: mocks.getSavedPreviewDisplay,
}))

vi.mock('@/lib/activity/record', () => ({
  previewPath: (platform: string, author: string, id: string) => `/${platform}/${author}/${id}`,
  recordActivity: vi.fn(),
}))

vi.mock('@/lib/activity/bot', () => ({
  isLikelyBot: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/sentry', () => ({
  metrics: { theaterOpened: vi.fn() },
}))

vi.mock('@/lib/analytics/record', () => ({
  recordAnalytic: vi.fn(),
}))

vi.mock('@/lib/routes/base-url', () => ({
  PUBLIC_BASE_URL: 'https://adhx.com',
}))

vi.mock('@/components/theater/SharedPostStatic', () => ({
  SharedPostStatic: () => <div data-static-post="true" />,
}))

vi.mock('@/components/theater/TheaterShell', () => ({
  TheaterShell: () => null,
}))

vi.mock('@/components/RelatedSaves', () => ({
  RelatedSaves: () => null,
}))

const REEL_ID = 'Cwnj8o6pKbn'
const TIKTOK_ID = '7619017281691045134'
const YOUTUBE_ID = 'Y9aytLYBajw'

const platforms = [
  {
    name: 'Instagram',
    statusMock: mocks.getReelMetadataStatus,
    resolve: async () => {
      const { resolveReelShared } = await import('@/lib/theater/resolve-shared-preview')
      return resolveReelShared(REEL_ID)
    },
    resolvedMetadata: {
      imageUrl: 'https://scontent.cdninstagram.com/thumb.jpg',
      caption: 'Resolved Reel',
      author: '@creator',
    },
    unresolvedKinds: ['permanent-miss', 'transient-failure'],
  },
  {
    name: 'TikTok',
    statusMock: mocks.getTikTokMetadataStatus,
    resolve: async () => {
      const { resolveTikTokShared } = await import('@/lib/theater/resolve-shared-preview')
      return resolveTikTokShared('creator', TIKTOK_ID)
    },
    resolvedMetadata: {
      videoUrl: `https://tnktok.com/generate/video/${TIKTOK_ID}.mp4`,
      title: 'Resolved TikTok',
      author: '@creator',
    },
    unresolvedKinds: ['permanent-miss', 'transient-failure'],
  },
  {
    name: 'YouTube',
    statusMock: mocks.getYouTubeMetadataStatus,
    resolve: async () => {
      const { resolveYouTubeShared } = await import('@/lib/theater/resolve-shared-preview')
      return resolveYouTubeShared(YOUTUBE_ID)
    },
    resolvedMetadata: {
      videoId: YOUTUBE_ID,
      title: 'Resolved Short',
      author: '@creator',
      thumbnailUrl: `https://i.ytimg.com/vi/${YOUTUBE_ID}/hqdefault.jpg`,
    },
    unresolvedKinds: ['permanent-miss', 'transient-failure'],
  },
] as const

describe('non-X shared preview SEO eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSavedPreviewDisplay.mockReturnValue(null)
    mocks.recordHumanPreview.mockResolvedValue(undefined)
  })

  for (const platform of platforms) {
    it.each(platform.unresolvedKinds)(
      `${platform.name} keeps the playable stub but suppresses body SEO for %s`,
      async (kind) => {
        platform.statusMock.mockResolvedValue({ kind })

        const result = await platform.resolve()

        expect(result).toMatchObject({
          ok: true,
          seoEligible: false,
          related: null,
        })
        expect(result).not.toHaveProperty('jsonLd')
        expect(result).not.toHaveProperty('staticPost')
      },
    )

    it(`${platform.name} emits body SEO when upstream metadata resolves`, async () => {
      platform.statusMock.mockResolvedValue({
        kind: 'resolved',
        metadata: platform.resolvedMetadata,
      })

      const result = await platform.resolve()

      expect(result).toMatchObject({ ok: true, seoEligible: true })
      expect(result).toHaveProperty('jsonLd')
      expect(result).toHaveProperty('staticPost')
    })

    it(`${platform.name} uses saved content as an SEO-eligible fallback`, async () => {
      mocks.getSavedPreviewDisplay.mockReturnValue({
        author: '@saved',
        authorName: 'Saved Author',
        text: 'Saved content',
      })

      const result = await platform.resolve()

      expect(result).toMatchObject({ ok: true, seoEligible: true })
      expect(result).toHaveProperty('jsonLd')
      expect(result).toHaveProperty('staticPost')
      expect(platform.statusMock).not.toHaveBeenCalled()
    })
  }
})

describe('ResolvedSharedSeo', () => {
  it('renders nothing for an explicitly suppressed success result', async () => {
    const { ResolvedSharedSeo } = await import('@/lib/theater/shared-preview')
    const result: SharedResolveResult = {
      ok: true,
      seoEligible: false,
      item: {
        action: 'preview',
        platform: 'youtube',
        bookmarkId: YOUTUBE_ID,
        author: 'youtube',
        url: `https://www.youtube.com/shorts/${YOUTUBE_ID}`,
        createdAt: '2026-08-26T00:00:00Z',
        contentType: 'video',
      },
      related: null,
    }

    expect(await ResolvedSharedSeo({ resolve: Promise.resolve(result) })).toBeNull()
  })

  it('renders JSON-LD and static markup for an eligible result', async () => {
    const { ResolvedSharedSeo } = await import('@/lib/theater/shared-preview')
    const eligible = await platforms[2].resolve()
    expect(eligible.ok && eligible.seoEligible).toBe(true)

    const element = await ResolvedSharedSeo({ resolve: Promise.resolve(eligible) })
    const html = renderToStaticMarkup(element)

    expect(html).toContain('application/ld+json')
    expect(html).toContain('data-static-post="true"')
  })
})
