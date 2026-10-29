import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from '@/app/page'
import { getCurrentUserId, getWaitingAccount } from '@/lib/auth/session'
import { getTheaterFeed } from '@/lib/theater/feed'
import { redirect } from 'next/navigation'
import { isFreshInstall } from '@/lib/auth/allowlist'

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(),
  getWaitingAccount: vi.fn(async () => null),
}))
vi.mock('@/lib/auth/allowlist', () => ({ isFreshInstall: vi.fn(() => false) }))
vi.mock('@/lib/theater/feed', () => ({
  getTheaterFeed: vi.fn(async () => ({ items: [], savedToday: 0 })),
}))
vi.mock('@/lib/sentry', () => ({ metrics: { theaterOpened: vi.fn() } }))
vi.mock('@/lib/analytics/record', () => ({ recordAnalytic: vi.fn() }))
vi.mock('@/components/theater/TheaterStaticList', () => ({ TheaterStaticList: () => null }))
vi.mock('@/components/next/moments/PublicHome', () => ({ PublicHome: () => null }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

describe('home destination', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens New: what your people saved that you haven’t seen', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue('u1')
    await expect(HomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'REDIRECT:/play?feed=new',
    )
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

  it('takes someone still waiting to be let in back to their waiting page', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue(null)
    vi.mocked(getWaitingAccount).mockResolvedValueOnce({ userId: 'u2', approval: 'pending' })
    await expect(HomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'REDIRECT:/invite/waiting',
    )
    expect(getTheaterFeed).not.toHaveBeenCalled()
  })

  it('opens a brand-new ADHX on setup', async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue(null)
    vi.mocked(isFreshInstall).mockReturnValueOnce(true)
    await expect(HomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/setup')
  })
})
