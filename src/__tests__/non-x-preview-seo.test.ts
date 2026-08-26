import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getReelMetadataStatus: vi.fn(),
  getTikTokMetadataStatus: vi.fn(),
  getYouTubeMetadataStatus: vi.fn(),
  getSavedPreviewDisplay: vi.fn(),
  readPostModeration: vi.fn(),
}))

vi.mock('@/lib/media/instafix', () => ({
  getReelMetadataStatus: mocks.getReelMetadataStatus,
  isValidReelId: (id: string) => /^[A-Za-z0-9_-]{5,20}$/.test(id),
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
  stubTikTokTheaterItem: vi.fn(),
  stubYouTubeTheaterItem: vi.fn(),
}))

vi.mock('@/lib/theater/resolve-shared-preview', () => ({
  resolveReelShared: vi.fn(),
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
      mocks.getReelMetadataStatus.mockResolvedValue({ kind: 'permanent-miss' })
      const { generateMetadata } = await import('@/app/reels/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: REEL_ID }) })

      expect(metadata).toMatchObject({
        title: 'Instagram Reel unavailable - ADHX',
        robots: { index: false },
        alternates: { canonical: `https://adhx.com/reels/${REEL_ID}` },
      })
      expect(metadata.openGraph).toBeUndefined()
      expect(metadata.twitter).toBeUndefined()
    })

    it('keeps transient failures indexable without claiming unresolved media', async () => {
      mocks.getReelMetadataStatus.mockResolvedValue({ kind: 'transient-failure' })
      const { generateMetadata } = await import('@/app/reels/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: REEL_ID }) })

      expect(metadata.robots).toBeUndefined()
      expect(metadata.openGraph).toBeUndefined()
      expect(metadata.alternates).toEqual({ canonical: `https://adhx.com/reels/${REEL_ID}` })
    })

    it('uses saved content as a rich fallback without calling Instagram', async () => {
      mocks.getSavedPreviewDisplay.mockReturnValue({
        author: '@creator',
        authorName: 'Creator',
        text: 'Saved Reel',
      })
      const { generateMetadata } = await import('@/app/reels/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: REEL_ID }) })

      expect(metadata.robots).toBeUndefined()
      expect(metadata.openGraph).toMatchObject({
        type: 'video.other',
        images: [{ url: expect.stringContaining('/api/media/instagram/thumbnail') }],
        videos: [{ url: expect.stringContaining('/api/media/instagram/video') }],
      })
      expect(mocks.getReelMetadataStatus).not.toHaveBeenCalled()
    })
  })

  describe('TikTok video', () => {
    const params = Promise.resolve({ username: '@creator', id: TIKTOK_ID })

    it('keeps mirror-only absence indexable without claiming unresolved media', async () => {
      mocks.getTikTokMetadataStatus.mockResolvedValue({ kind: 'transient-failure' })
      const { generateMetadata } = await import('@/app/[username]/video/[id]/page')

      const metadata = await generateMetadata({ params })

      expect(metadata.robots).toBeUndefined()
      expect(metadata.openGraph).toBeUndefined()
      expect(metadata.alternates).toEqual({
        canonical: `https://adhx.com/@creator/video/${TIKTOK_ID}`,
      })
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
      expect(metadata.openGraph).toBeUndefined()
      expect(metadata.twitter).toBeUndefined()
    })

    it('keeps transient failures indexable without claiming unresolved media', async () => {
      mocks.getYouTubeMetadataStatus.mockResolvedValue({ kind: 'transient-failure' })
      const { generateMetadata } = await import('@/app/shorts/[id]/page')

      const metadata = await generateMetadata({ params: Promise.resolve({ id: YOUTUBE_ID }) })

      expect(metadata.robots).toBeUndefined()
      expect(metadata.openGraph).toBeUndefined()
      expect(metadata.alternates).toEqual({
        canonical: `https://adhx.com/shorts/${YOUTUBE_ID}`,
      })
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
