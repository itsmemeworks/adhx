/**
 * @vitest-environment jsdom
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidateAuthMe, useAuthMe } from '@/components/auth/useAuthMe'
import {
  clientEventMatchesAccount,
  notifyCollectionChanged,
  notifyTagsChanged,
  resetClientEventBridgeForTests,
  setClientEventAccount,
} from '@/lib/client-events'
import type { AuthMe } from '@/components/auth/useAuthMe'
import type { FeedItem } from '@/components/feed/types'

const clientEventMocks = vi.hoisted(() => ({
  setAccount: vi.fn(),
  authScopeListeners: new Set<(accountId: string | null) => void>(),
}))

vi.mock('@/lib/client-events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/client-events')>()
  clientEventMocks.setAccount.mockImplementation(actual.setClientEventAccount)
  return {
    ...actual,
    setClientEventAccount: clientEventMocks.setAccount,
    subscribeClientEventAuthScopeChange: (listener: (accountId: string | null) => void) => {
      clientEventMocks.authScopeListeners.add(listener)
      return () => clientEventMocks.authScopeListeners.delete(listener)
    },
  }
})

const setAccountMock = vi.mocked(setClientEventAccount)
let latestAuth: ReturnType<typeof useAuthMe>

function Probe() {
  latestAuth = useAuthMe()
  return <div>{latestAuth.me?.user?.id ?? (latestAuth.loading ? 'loading' : 'signed-out')}</div>
}

function account(id: string): AuthMe {
  return {
    authenticated: true,
    user: {
      id,
      username: id,
      displayName: id,
      avatarUrl: null,
      usernameChosen: true,
      usernameChangeCount: 0,
    },
    identities: { x: null, email: null },
    xConnected: false,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe('useAuthMe client-event account scope', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    resetClientEventBridgeForTests()
    invalidateAuthMe()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('unsettles the scope during an account transition and settles to the new immutable id', async () => {
    const responses = [account('account-a'), account('account-b')]
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => responses.shift(),
    })) as never

    render(<Probe />)
    await waitFor(() => expect(screen.getByText('account-a')).toBeInTheDocument())
    expect(setAccountMock).toHaveBeenCalledWith(undefined)
    expect(setAccountMock).toHaveBeenLastCalledWith('account-a', { broadcast: true })

    await act(async () => {
      await latestAuth.refresh()
    })

    await waitFor(() => expect(screen.getByText('account-b')).toBeInTheDocument())
    expect(setAccountMock).toHaveBeenNthCalledWith(3, undefined)
    expect(setAccountMock).toHaveBeenLastCalledWith('account-b', { broadcast: true })
  })

  it('settles a signed-out response without inventing an account identity', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        authenticated: false,
        user: null,
        identities: { x: null, email: null },
        xConnected: false,
      }),
    })) as never

    render(<Probe />)

    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument())
    expect(setAccountMock).toHaveBeenLastCalledWith(null, { broadcast: true })
  })

  it('keeps an initial failure unresolved, retries, and recovers the account scope', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary initial auth outage'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => account('account-a'),
      })
    global.fetch = fetchMock as never
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers()

    render(<Probe />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(setAccountMock).toHaveBeenLastCalledWith(undefined)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByText('account-a')).toBeInTheDocument()
    expect(setAccountMock).toHaveBeenLastCalledWith('account-a', { broadcast: true })
    consoleError.mockRestore()
  })

  it('does not let a pre-transition auth request restore the previous account scope', async () => {
    const stale = deferred<{ ok: true; json: () => Promise<AuthMe> }>()
    const current = deferred<{ ok: true; json: () => Promise<AuthMe> }>()
    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => current.promise) as never

    render(<Probe />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))

    let refresh!: Promise<void>
    act(() => {
      invalidateAuthMe()
      refresh = latestAuth.refresh()
    })
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))

    current.resolve({ ok: true, json: async () => account('account-b') })
    await act(async () => {
      await refresh
    })
    await waitFor(() => expect(screen.getByText('account-b')).toBeInTheDocument())

    stale.resolve({ ok: true, json: async () => account('account-a') })
    await act(async () => {
      await stale.promise
    })

    expect(setAccountMock.mock.calls.some(([accountId]) => accountId === 'account-a')).toBe(false)
    expect(setAccountMock).toHaveBeenLastCalledWith('account-b', { broadcast: true })
    expect(screen.getByText('account-b')).toBeInTheDocument()
  })

  it('invalidates and refetches without echoing a remote A→B account switch', async () => {
    const responses = [account('account-a'), account('account-b')]
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => responses.shift(),
    })) as never

    render(<Probe />)
    await waitFor(() => expect(screen.getByText('account-a')).toBeInTheDocument())

    act(() => {
      clientEventMocks.authScopeListeners.forEach((listener) => listener('account-b'))
    })
    expect(setAccountMock).toHaveBeenLastCalledWith(undefined)
    expect(screen.getByText('loading')).toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('account-b')).toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(setAccountMock).toHaveBeenLastCalledWith('account-b', { broadcast: false })
  })

  it('keeps scope blocked after a failed cross-tab refetch, then retries and settles B', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => account('account-a'),
      })
      .mockRejectedValueOnce(new Error('temporary auth outage'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => account('account-b'),
      })
    global.fetch = fetchMock as never
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const feedEvents: Event[] = []
    const tagEvents: Event[] = []
    const onFeed = (event: Event) => feedEvents.push(event)
    const onTags = (event: Event) => tagEvents.push(event)
    const fromB = { platform: 'twitter', id: 'from-b' } as FeedItem
    window.addEventListener('tweet-added', onFeed)
    window.addEventListener('bookmark-tags-changed', onTags)

    render(<Probe />)
    await waitFor(() => expect(screen.getByText('account-a')).toBeInTheDocument())
    vi.useFakeTimers()

    await act(async () => {
      clientEventMocks.authScopeListeners.forEach((listener) => listener('account-b'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(setAccountMock).toHaveBeenLastCalledWith(undefined)
    expect(screen.getByText('loading')).toBeInTheDocument()
    notifyCollectionChanged({ added: fromB })
    notifyTagsChanged({
      platform: 'twitter',
      bookmarkId: 'from-b',
      tags: ['account-b-private'],
    })
    expect(feedEvents).toHaveLength(0)
    expect(tagEvents).toHaveLength(0)

    await act(async () => {
      vi.advanceTimersByTime(999)
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(screen.getByText('account-b')).toBeInTheDocument()
    expect(setAccountMock).toHaveBeenLastCalledWith('account-b', { broadcast: false })
    notifyCollectionChanged({ added: fromB })
    notifyTagsChanged({
      platform: 'twitter',
      bookmarkId: 'from-b',
      tags: ['account-b-private'],
    })
    expect(feedEvents).toHaveLength(1)
    expect(tagEvents).toHaveLength(1)
    expect(clientEventMatchesAccount(feedEvents[0], 'account-b')).toBe(true)
    expect(clientEventMatchesAccount(tagEvents[0], 'account-b')).toBe(true)
    window.removeEventListener('tweet-added', onFeed)
    window.removeEventListener('bookmark-tags-changed', onTags)
    consoleError.mockRestore()
  })

  it('cancels an older retry loop when a newer transition arrives', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => account('account-a'),
      })
      .mockRejectedValueOnce(new Error('B refetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => account('account-c'),
      })
    global.fetch = fetchMock as never
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<Probe />)
    await waitFor(() => expect(screen.getByText('account-a')).toBeInTheDocument())
    vi.useFakeTimers()

    await act(async () => {
      clientEventMocks.authScopeListeners.forEach((listener) => listener('account-b'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('loading')).toBeInTheDocument()

    await act(async () => {
      clientEventMocks.authScopeListeners.forEach((listener) => listener('account-c'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(screen.getByText('account-c')).toBeInTheDocument()
    expect(setAccountMock).toHaveBeenLastCalledWith('account-c', { broadcast: false })

    await act(async () => {
      vi.advanceTimersByTime(120_000)
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    consoleError.mockRestore()
  })

  it('stops a pending retry loop when the last consumer unmounts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => account('account-a'),
      })
      .mockRejectedValueOnce(new Error('retry later'))
    global.fetch = fetchMock as never
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const view = render(<Probe />)
    await waitFor(() => expect(screen.getByText('account-a')).toBeInTheDocument())
    vi.useFakeTimers()

    await act(async () => {
      clientEventMocks.authScopeListeners.forEach((listener) => listener('account-b'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    view.unmount()
    await act(async () => {
      vi.advanceTimersByTime(120_000)
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    consoleError.mockRestore()
  })
})
