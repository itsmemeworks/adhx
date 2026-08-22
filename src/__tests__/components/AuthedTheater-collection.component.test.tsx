/**
 * @vitest-environment jsdom
 *
 * `/collection` is the only personal theater. AuthedTheater fetches the
 * active queue at the API cap (100) before mounting the shell; a failed
 * fetch is an error (Retry), not a fake all-clear.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import AuthedTheater from '@/app/AuthedTheater'
import { COLLECTION_QUEUE_LIMIT } from '@/lib/theater/collection-href'

const pushSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))

const shellSpy = vi.fn()
vi.mock('@/components/theater/TheaterShell', () => ({
  TheaterShell: (props: { personalItems?: unknown[]; initialPersonalIndex?: number }) => {
    shellSpy(props)
    return (
      <div
        data-testid="theater-shell"
        data-index={props.initialPersonalIndex}
        data-count={(props.personalItems ?? []).length}
      />
    )
  },
}))

const emptySeed = { items: [], savedToday: 0, recentActivity: 0 }

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
  } as Response)
}

let feedRequests: string[] = []
let feedImpl: (url: string) => ReturnType<typeof jsonResponse>

beforeEach(() => {
  pushSpy.mockClear()
  shellSpy.mockClear()
  feedRequests = []
  feedImpl = () =>
    jsonResponse({
      items: [
        { id: 'a', platform: 'twitter' },
        { id: 'b', platform: 'twitter' },
      ],
    })

  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/feed')) {
      feedRequests.push(url)
      return feedImpl(url)
    }
    return jsonResponse({})
  }) as unknown as typeof fetch
})

describe('AuthedTheater collection load', () => {
  it('fetches the active queue at the API cap (100), not a half-page', async () => {
    render(<AuthedTheater seed={emptySeed} tab="collection" />)
    await waitFor(() => expect(screen.getByTestId('theater-shell')).toBeInTheDocument())
    expect(feedRequests[0]).toContain(`limit=${COLLECTION_QUEUE_LIMIT}`)
    expect(feedRequests[0]).toContain('hideArchived=true')
    expect(feedRequests[0]).toContain('filter=all')
  })

  it('shows an error — not all-clear — when the feed request fails', async () => {
    feedImpl = () => jsonResponse({ error: 'nope' }, false)
    render(<AuthedTheater seed={emptySeed} tab="collection" />)
    await waitFor(() =>
      expect(screen.getByText(/couldn.t load your collection/i)).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('theater-shell')).not.toBeInTheDocument()
  })

  it('retries after a failed load', async () => {
    feedImpl = () => jsonResponse({ error: 'nope' }, false)
    render(<AuthedTheater seed={emptySeed} tab="collection" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument())

    feedImpl = () => jsonResponse({ items: [{ id: 'a', platform: 'twitter' }] })
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.getByTestId('theater-shell')).toBeInTheDocument())
  })

  it('starts on the open item when it is already in the active queue', async () => {
    render(<AuthedTheater seed={emptySeed} tab="collection" openId="b" openPlatform="twitter" />)
    await waitFor(() => expect(screen.getByTestId('theater-shell')).toBeInTheDocument())
    expect(screen.getByTestId('theater-shell')).toHaveAttribute('data-index', '1')
    expect(screen.getByTestId('theater-shell')).toHaveAttribute('data-count', '2')
  })

  it('prepends an archived / off-page open item', async () => {
    feedImpl = (url) => {
      if (url.includes('id=archived')) {
        return jsonResponse({ items: [{ id: 'archived', platform: 'twitter' }] })
      }
      return jsonResponse({ items: [{ id: 'a', platform: 'twitter' }] })
    }
    render(
      <AuthedTheater seed={emptySeed} tab="collection" openId="archived" openPlatform="twitter" />,
    )
    await waitFor(() => expect(screen.getByTestId('theater-shell')).toBeInTheDocument())
    expect(screen.getByTestId('theater-shell')).toHaveAttribute('data-index', '0')
    expect(screen.getByTestId('theater-shell')).toHaveAttribute('data-count', '2')
    expect(
      feedRequests.some((u) => u.includes('id=archived') && u.includes('idPlatform=twitter')),
    ).toBe(true)
  })

  it('does not wait on the collection queue when the Live tab is showing', async () => {
    render(<AuthedTheater seed={emptySeed} tab="live" />)
    expect(screen.getByTestId('theater-shell')).toBeInTheDocument()
    expect(feedRequests).toHaveLength(0)
  })
})
