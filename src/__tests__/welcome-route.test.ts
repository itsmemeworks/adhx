import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  getAccount: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}))

vi.mock('@/lib/auth/account', () => ({
  getAccount: mocks.getAccount,
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

vi.mock('@/app/welcome/WelcomeClient', () => ({
  WelcomeClient: vi.fn(),
}))

describe('Welcome route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([['stale or deleted-account'], ['banned-account']])(
    'redirects when live-account auth rejects a %s session',
    async () => {
      mocks.getCurrentUserId.mockResolvedValue(null)
      const WelcomePage = (await import('@/app/welcome/page')).default

      await expect(WelcomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/')
      expect(mocks.getAccount).not.toHaveBeenCalled()
    },
  )

  it('loads the welcome prompt only for a validated live account', async () => {
    mocks.getCurrentUserId.mockResolvedValue('u_live')
    mocks.getAccount.mockResolvedValue({
      user: { username: 'new-reader', usernameChosen: false },
    })
    const WelcomePage = (await import('@/app/welcome/page')).default

    const result = (await WelcomePage({
      searchParams: Promise.resolve({ returnTo: '/library' }),
    })) as ReactElement<{ suggestedUsername: string; returnTo: string }>

    expect(mocks.getAccount).toHaveBeenCalledWith('u_live')
    expect(result.props).toEqual({
      suggestedUsername: 'new-reader',
      returnTo: '/library',
    })
  })
})
