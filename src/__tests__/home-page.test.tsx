import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from '@/app/page'
import { getCurrentUserId } from '@/lib/auth/session'
import { getTheaterFeed } from '@/lib/theater/feed'
import { redirect } from 'next/navigation'

vi.mock('@/lib/auth/session', () => ({ getCurrentUserId: vi.fn() }))
vi.mock('@/lib/theater/feed', () => ({
  getTheaterFeed: vi.fn(async () => ({ items: [], savedToday: 0 })),
}))
vi.mock('@/lib/sentry', () => ({ metrics: { theaterOpened: vi.fn() } }))
vi.mock('@/lib/analytics/record', () => ({ recordAnalytic: vi.fn() }))
vi.mock('@/components/theater/TheaterStaticList', () => ({ TheaterStaticList: () => null }))
vi.mock('@/components/theater/TheaterShell', () => ({ TheaterShell: () => null }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

describe('home destination', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens personal videos for signed-in viewers without fetching community posts', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue('u1')
    await expect(HomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/saved')
    expect(getTheaterFeed).not.toHaveBeenCalled()
  })

  it.each(['success', 'duplicate'])(
    'keeps an explicit %s add focused on its post',
    async (added) => {
      vi.mocked(getCurrentUserId).mockResolvedValue('u1')
      await expect(
        HomePage({
          searchParams: Promise.resolve({ added, id: 'reel123', platform: 'instagram' }),
        }),
      ).rejects.toThrow('REDIRECT:/saved?open=reel123&platform=instagram')
    },
  )

  it('keeps discovery available to signed-out visitors', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue(null)
    await HomePage({ searchParams: Promise.resolve({}) })
    expect(redirect).not.toHaveBeenCalled()
    expect(getTheaterFeed).toHaveBeenCalledOnce()
  })
})
