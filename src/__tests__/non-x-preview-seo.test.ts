import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getInstagramMetadataStatus: vi.fn(),
  getTikTokMetadataStatus: vi.fn(),
  getYouTubeMetadataStatus: vi.fn(),
  getSavedPreviewDisplay: vi.fn(),
  readPostModeration: vi.fn(),
}))

vi.mock('@/lib/media/instafix', () => ({
  getInstagramMetadataStatus: mocks.getInstagramMetadataStatus,
  isValidInstagramId: (id: string) => /^[A-Za-z0-9_-]{5,20}$/.test(id),
}))

vi.mock('@/lib/media/tnktok', () => ({
  getTikTokMetadataStatus: mocks.getTikTokMetadataStatus,
  isValidUsername: (username: string) => /^[A-Za-z0-9._]{1,30}$/.test(username),
  isValidVideoId: (id: string) => /^\d{6,25}$/.test(id),
}))

vi.mock('@/lib/media/youtube', () => ({
  getYouTubeMetadataStatus: mocks.getYouTubeMetadataStatus,
  isValidVideoId: (id: string) => /^[A-Za-z0-9_-]{11}$/.test(id),
  youtubeThumbnail: (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
}))

vi.mock('@/lib/theater/saved-preview', () => ({
  getSavedPreviewDisplay: mocks.getSavedPreviewDisplay,
}))

vi.mock('@/lib/admin/moderation', () => ({
  readPostModeration: mocks.readPostModeration,
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn().mockResolvedValue(null),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('@/lib/theater/shared-seed', () => ({
  stubReelTheaterItem: vi.fn(),
  stubInstagramPostTheaterItem: vi.fn(),
  stubTikTokTheaterItem: vi.fn(),
  stubYouTubeTheaterItem: vi.fn(),
}))

vi.mock('@/lib/theater/resolve-shared-preview', () => ({
  resolveInstagramShared: vi.fn(),
  resolveTikTokShared: vi.fn(),
  resolveYouTubeShared: vi.fn(),
}))

vi.mock('@/lib/theater/shared-preview', () => ({
  MODERATED_PAGE_METADATA: {
    title: 'Post removed - ADHX',
    description: 'This post was removed from ADHX.',
    robots: { index: false },
  },
  SharedPreviewPage: () => null,
  sharedPreviewSeed: vi.fn(),
}))

vi.mock('@/lib/routes/base-url', () => ({
  PUBLIC_BASE_URL: 'https://adhx.com',
}))

const REEL_ID = 'Cwnj8o6pKbn'
const TIKTOK_ID = '7619017281691045134'
const YOUTUBE_ID = 'Y9aytLYBajw'

describe('non-X preview metadata status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readPostModeration.mockReturnValue({ ok: true, value: false })
    mocks.getSavedPreviewDisplay.mockReturnValue(null)
  })

  describe('Instagram Reel', () => {
    it('noindexes a confirmed permanent miss without fabricated media claims', async () => {
      mocks.getInstagramMetadataStatus.mockResolvedValue({ kind: 'permanent-miss' })
      const { generateMetadata } = await import('@/app/reels/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: REEL_ID }) })

      expect(metadata).toMatchObject({
        title: 'Instagram Reel unavailable - ADHX',
        robots: { index: false },
        alternates: { canonical: `https://adhx.com/reels/${REEL_ID}` },
      })
      expect(metadata.openGraph).toBeNull()
      expect(metadata.twitter).toBeNull()
    })

    it('noindexes a transient failure without claiming unresolved media', async () => {
      mocks.getInstagramMetadataStatus.mockResolvedValue({ kind: 'transient-failure' })
      const { generateMetadata } = await import('@/app/reels/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: REEL_ID }) })

      expect(metadata.robots).toEqual({ index: false })
      expect(metadata.openGraph).toBeNull()
      expect(metadata.twitter).toBeNull()
      expect(metadata.alternates).toEqual({ canonical: `https://adhx.com/reels/${REEL_ID}` })
    })

    it('indexes resolved Instagram metadata with rich preview claims', async () => {
      mocks.getInstagramMetadataStatus.mockResolvedValue({
        kind: 'resolved',
        metadata: {
          imageUrl: 'https://scontent.cdninstagram.com/thumb.jpg',
          caption: 'Resolved Reel',
          author: '@creator',
        },
      })
      const { generateMetadata } = await import('@/app/reels/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: REEL_ID }) })

      expect(metadata.robots).toBeUndefined()
      expect(metadata.openGraph).toMatchObject({
        type: 'video.other',
        description: metadata.description,
        images: [{ url: expect.stringContaining('/api/media/instagram/thumbnail') }],
        videos: [{ url: expect.stringContaining('/api/media/instagram/video') }],
      })
      expect(metadata.description).not.toContain('Resolved Reel')
    })

    it('uses saved content as a rich fallback without calling Instagram', async () => {
      mocks.getSavedPreviewDisplay.mockReturnValue({
        author: '@creator',
        authorName: 'Creator',
        text: 'Saved Reel',
        category: 'video',
        mediaCount: 1,
      })
      const { generateMetadata } = await import('@/app/reels/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: REEL_ID }) })

      expect(metadata.robots).toBeUndefined()
      expect(metadata.openGraph).toMatchObject({
        type: 'video.other',
        images: [{ url: expect.stringContaining('/api/media/instagram/thumbnail') }],
        videos: [{ url: expect.stringContaining('/api/media/instagram/video') }],
      })
      expect(mocks.getInstagramMetadataStatus).not.toHaveBeenCalled()
    })
  })

  describe('Instagram image post', () => {
    it('uses the thumbnail proxy for saved posts with legacy empty media rows', async () => {
      const postId = 'DcgAGt4ijQr'
      mocks.getSavedPreviewDisplay.mockReturnValue({
        author: '@ravecultur',
        authorName: 'Rave Cultur',
        text: 'A saved Instagram image',
        category: 'photo',
        mediaCount: 0,
      })
      const { generateMetadata } = await import('@/app/p/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: postId }) })

      expect(metadata.openGraph).toMatchObject({
        type: 'article',
        images: [{ url: `https://adhx.com/api/media/instagram/thumbnail?id=${postId}` }],
      })
      expect(metadata.twitter).toMatchObject({
        images: [`https://adhx.com/api/media/instagram/thumbnail?id=${postId}`],
      })
      expect(mocks.getInstagramMetadataStatus).not.toHaveBeenCalled()
    })

    it('publishes every carousel image in order without a video claim', async () => {
      const postId = 'DcHXej3lt5W'
      mocks.getInstagramMetadataStatus.mockResolvedValue({
        kind: 'resolved',
        metadata: {
          imageUrl: 'https://scontent.cdninstagram.com/1.jpg',
          caption: 'An image carousel',
          author: '@creator',
          contentType: 'photo',
          media: Array.from({ length: 3 }, (_, index) => ({
            type: 'photo',
            imageUrl: `https://scontent.cdninstagram.com/${index + 1}.jpg`,
          })),
        },
      })
      const { generateMetadata } = await import('@/app/p/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: postId }) })

      expect(metadata.alternates).toEqual({ canonical: `https://adhx.com/p/${postId}` })
      expect(metadata.openGraph).toMatchObject({
        type: 'article',
        description: metadata.description,
        images: [
          { url: `https://adhx.com/api/media/instagram/thumbnail?id=${postId}&index=1` },
          { url: `https://adhx.com/api/media/instagram/thumbnail?id=${postId}&index=2` },
          { url: `https://adhx.com/api/media/instagram/thumbnail?id=${postId}&index=3` },
        ],
      })
      expect(metadata.description).not.toContain('An image carousel')
      expect(metadata.openGraph).not.toHaveProperty('videos')
      expect(metadata.twitter).toMatchObject({
        images: [
          `https://adhx.com/api/media/instagram/thumbnail?id=${postId}&index=1`,
          `https://adhx.com/api/media/instagram/thumbnail?id=${postId}&index=2`,
          `https://adhx.com/api/media/instagram/thumbnail?id=${postId}&index=3`,
        ],
      })
    })
  })

  describe('TikTok video', () => {
    const params = Promise.resolve({ username: '@creator', id: TIKTOK_ID })

    it('noindexes a transient mirror miss without claiming unresolved media', async () => {
      mocks.getTikTokMetadataStatus.mockResolvedValue({ kind: 'transient-failure' })
      const { generateMetadata } = await import('@/app/[username]/video/[id]/page')

      const metadata = await generateMetadata({ params })

      expect(metadata.robots).toEqual({ index: false })
      expect(metadata.openGraph).toBeNull()
      expect(metadata.twitter).toBeNull()
      expect(metadata.alternates).toEqual({
        canonical: `https://adhx.com/@creator/video/${TIKTOK_ID}`,
      })
    })

    it('noindexes a permanent TikTok miss without fabricated media claims', async () => {
      mocks.getTikTokMetadataStatus.mockResolvedValue({ kind: 'permanent-miss' })
      const { generateMetadata } = await import('@/app/[username]/video/[id]/page')

      const metadata = await generateMetadata({ params })

      expect(metadata.robots).toEqual({ index: false })
      expect(metadata.openGraph).toBeNull()
      expect(metadata.twitter).toBeNull()
    })

    it('indexes resolved TikTok metadata with rich preview claims', async () => {
      mocks.getTikTokMetadataStatus.mockResolvedValue({
        kind: 'resolved',
        metadata: {
          videoUrl: `https://tnktok.com/generate/video/${TIKTOK_ID}.mp4`,
          title: 'Resolved TikTok',
          author: '@creator',
        },
      })
      const { generateMetadata } = await import('@/app/[username]/video/[id]/page')

      const metadata = await generateMetadata({ params })

      expect(metadata.robots).toBeUndefined()
      expect(metadata.openGraph).toMatchObject({
        type: 'video.other',
        description: metadata.description,
        images: [{ url: expect.stringContaining('/api/media/tiktok/thumbnail') }],
        videos: [{ url: expect.stringContaining('/api/media/tiktok/video') }],
      })
      expect(metadata.description).not.toContain('Resolved TikTok')
    })

    it('uses saved content as a rich fallback without calling TikTok', async () => {
      mocks.getSavedPreviewDisplay.mockReturnValue({
        author: '@creator',
        authorName: 'Creator',
        text: 'Saved TikTok',
      })
      const { generateMetadata } = await import('@/app/[username]/video/[id]/page')

      const metadata = await generateMetadata({ params })

      expect(metadata.robots).toBeUndefined()
      expect(metadata.openGraph).toMatchObject({
        type: 'video.other',
        images: [{ url: expect.stringContaining('/api/media/tiktok/thumbnail') }],
        videos: [{ url: expect.stringContaining('/api/media/tiktok/video') }],
      })
      expect(mocks.getTikTokMetadataStatus).not.toHaveBeenCalled()
    })
  })

  describe('YouTube Short', () => {
    it('noindexes a confirmed oEmbed 400/404/410 miss without media claims', async () => {
      mocks.getYouTubeMetadataStatus.mockResolvedValue({ kind: 'permanent-miss' })
      const { generateMetadata } = await import('@/app/shorts/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: YOUTUBE_ID }) })

      expect(metadata).toMatchObject({
        title: 'YouTube Short unavailable - ADHX',
        robots: { index: false },
        alternates: { canonical: `https://adhx.com/shorts/${YOUTUBE_ID}` },
      })
      expect(metadata.openGraph).toBeNull()
      expect(metadata.twitter).toBeNull()
    })

    it('noindexes a transient failure without claiming unresolved media', async () => {
      mocks.getYouTubeMetadataStatus.mockResolvedValue({ kind: 'transient-failure' })
      const { generateMetadata } = await import('@/app/shorts/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: YOUTUBE_ID }) })

      expect(metadata.robots).toEqual({ index: false })
      expect(metadata.openGraph).toBeNull()
      expect(metadata.twitter).toBeNull()
      expect(metadata.alternates).toEqual({
        canonical: `https://adhx.com/shorts/${YOUTUBE_ID}`,
      })
    })

    it('indexes resolved YouTube metadata with rich preview claims', async () => {
      mocks.getYouTubeMetadataStatus.mockResolvedValue({
        kind: 'resolved',
        metadata: {
          videoId: YOUTUBE_ID,
          title: 'Resolved Short',
          author: '@creator',
          thumbnailUrl: `https://i.ytimg.com/vi/${YOUTUBE_ID}/hqdefault.jpg`,
        },
      })
      const { generateMetadata } = await import('@/app/shorts/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: YOUTUBE_ID }) })

      expect(metadata.robots).toBeUndefined()
      expect(metadata.openGraph).toMatchObject({
        type: 'video.other',
        description: metadata.description,
        images: [{ url: `https://i.ytimg.com/vi/${YOUTUBE_ID}/hqdefault.jpg` }],
      })
      expect(metadata.description).not.toContain('Resolved Short')
    })

    it('uses saved content as a rich fallback without calling YouTube', async () => {
      mocks.getSavedPreviewDisplay.mockReturnValue({
        author: '@creator',
        authorName: 'Creator',
        text: 'Saved Short',
      })
      const { generateMetadata } = await import('@/app/shorts/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: YOUTUBE_ID }) })

      expect(metadata.robots).toBeUndefined()
      expect(metadata.openGraph).toMatchObject({
        type: 'video.other',
        images: [{ url: `https://i.ytimg.com/vi/${YOUTUBE_ID}/hqdefault.jpg` }],
      })
      expect(mocks.getYouTubeMetadataStatus).not.toHaveBeenCalled()
    })
  })
})
