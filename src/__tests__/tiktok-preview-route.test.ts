import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  getTikTokMetadataStatus: vi.fn(),
  getCurrentUserId: vi.fn(),
  stubTikTokTheaterItem: vi.fn(),
  sharedPreviewSeed: vi.fn(),
  resolveTikTokShared: vi.fn(),
  readPostModeration: vi.fn(),
  getSavedPreviewDisplay: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

vi.mock('@/lib/media/tnktok', () => ({
  getTikTokMetadataStatus: mocks.getTikTokMetadataStatus,
  isValidUsername: (username: string) => /^[A-Za-z0-9._]{1,30}$/.test(username),
  isValidVideoId: (id: string) => /^\d{6,25}$/.test(id),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}))

vi.mock('@/lib/utils/content-metadata', () => ({
  buildContentTitle: (value: string) => value,
  buildSnippetDescription: () => 'TikTok preview',
  attributionFact: () => 'TikTok video',
  previewPageMetadata: (value: unknown) => value,
}))

vi.mock('@/lib/theater/shared-seed', () => ({
  stubTikTokTheaterItem: mocks.stubTikTokTheaterItem,
}))

vi.mock('@/lib/theater/resolve-shared-preview', () => ({
  resolveTikTokShared: mocks.resolveTikTokShared,
}))

vi.mock('@/lib/theater/shared-preview', () => ({
  MODERATED_PAGE_METADATA: { title: 'Post removed - ADHX' },
  SharedPreviewPage: () => null,
  sharedPreviewSeed: mocks.sharedPreviewSeed,
}))

vi.mock('@/lib/admin/moderation', () => ({
  readPostModeration: mocks.readPostModeration,
}))

vi.mock('@/lib/theater/saved-preview', () => ({
  getSavedPreviewDisplay: mocks.getSavedPreviewDisplay,
}))

vi.mock('@/lib/routes/base-url', () => ({
  PUBLIC_BASE_URL: 'https://adhx.com',
}))

describe('TikTok preview route parameter normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`)
    })
    mocks.getCurrentUserId.mockResolvedValue(null)
    mocks.stubTikTokTheaterItem.mockReturnValue({ id: '123456', platform: 'tiktok' })
    mocks.sharedPreviewSeed.mockResolvedValue([])
    mocks.resolveTikTokShared.mockReturnValue(Promise.resolve({ ok: false }))
    mocks.readPostModeration.mockReturnValue({ ok: true, value: false })
    mocks.getSavedPreviewDisplay.mockReturnValue(null)
    mocks.getTikTokMetadataStatus.mockResolvedValue({ kind: 'transient-failure' })
  })

  it.each(['%40valid.handle', '@valid.handle'])(
    'preserves a valid route handle: %s',
    async (username) => {
      const { default: TikTokPreviewPage } = await import('@/app/[username]/video/[id]/page')

      await TikTokPreviewPage({
        params: Promise.resolve({ username, id: '7619017281691045134' }),
      })

      expect(mocks.stubTikTokTheaterItem).toHaveBeenCalledWith(
        'valid.handle',
        '7619017281691045134',
      )
      expect(mocks.redirect).not.toHaveBeenCalled()
    },
  )

  it.each(['%', '%ZZ'])(
    'redirects malformed encoding without throwing a URIError: %s',
    async (raw) => {
      const { default: TikTokPreviewPage } = await import('@/app/[username]/video/[id]/page')

      await expect(
        TikTokPreviewPage({
          params: Promise.resolve({ username: raw, id: '7619017281691045134' }),
        }),
      ).rejects.toThrow('REDIRECT:/')
      expect(mocks.stubTikTokTheaterItem).not.toHaveBeenCalled()
    },
  )

  it.each(['@@valid.handle', '%40%40valid.handle'])(
    'redirects a double route marker: %s',
    async (raw) => {
      const { default: TikTokPreviewPage } = await import('@/app/[username]/video/[id]/page')

      await expect(
        TikTokPreviewPage({
          params: Promise.resolve({ username: raw, id: '7619017281691045134' }),
        }),
      ).rejects.toThrow('REDIRECT:/')
      expect(mocks.stubTikTokTheaterItem).not.toHaveBeenCalled()
    },
  )

  it.each(['%', '%ZZ'])('returns fallback metadata for malformed encoding: %s', async (raw) => {
    const { generateMetadata } = await import('@/app/[username]/video/[id]/page')

    await expect(
      generateMetadata({
        params: Promise.resolve({ username: raw, id: '7619017281691045134' }),
      }),
    ).resolves.toEqual({ title: 'ADHX - Save now. Read never. Find always.' })
    expect(mocks.getTikTokMetadataStatus).not.toHaveBeenCalled()
  })

  it.each(['@@valid.handle', '%40%40valid.handle'])(
    'returns fallback metadata for a double route marker: %s',
    async (raw) => {
      const { generateMetadata } = await import('@/app/[username]/video/[id]/page')

      const metadata = await generateMetadata({
        params: Promise.resolve({ username: raw, id: '7619017281691045134' }),
      })

      expect(metadata).toEqual({ title: 'ADHX - Save now. Read never. Find always.' })
      expect(JSON.stringify(metadata)).not.toContain('@@')
      expect(mocks.getTikTokMetadataStatus).not.toHaveBeenCalled()
    },
  )

  it.each(['%40valid.handle', '@valid.handle'])(
    'uses a valid normalized handle for metadata: %s',
    async (username) => {
      const { generateMetadata } = await import('@/app/[username]/video/[id]/page')

      const metadata = await generateMetadata({
        params: Promise.resolve({ username, id: '7619017281691045134' }),
      })

      expect(mocks.getTikTokMetadataStatus).toHaveBeenCalledWith(
        'valid.handle',
        '7619017281691045134',
      )
      expect(JSON.stringify(metadata)).not.toContain('@@')
    },
  )
})
