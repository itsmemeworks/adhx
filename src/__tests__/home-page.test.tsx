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

  it('opens Right now', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue('u1')
    await expect(HomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/now')
  })

  it('starts on a just-added post', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue('u1')
    await expect(
      HomePage({
        searchParams: Promise.resolve({ added: 'success', id: 'reel123', platform: 'instagram' }),
      }),
    ).rejects.toThrow('REDIRECT:/play?recent=1&start=instagram%3Areel123')
  })

  it('keeps the public theater for signed-out visitors', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue(null)
    await HomePage({ searchParams: Promise.resolve({}) })
    expect(redirect).not.toHaveBeenCalled()
    expect(getTheaterFeed).toHaveBeenCalledOnce()
  })
})
