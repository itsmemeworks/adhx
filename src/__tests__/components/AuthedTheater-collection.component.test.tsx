/**
 * @vitest-environment jsdom
 *
 * `/saved` is the only personal theater. AuthedTheater fetches the
 * active queue at the API cap (100) before mounting the shell; a failed
 * fetch is an error (Retry), not a fake all-clear.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import AuthedTheater from '@/app/AuthedTheater'
import { COLLECTION_QUEUE_LIMIT } from '@/lib/theater/collection-href'
import { SAVED_PLAYED_STORAGE_KEY, SAVED_PLAYING_STORAGE_KEY } from '@/lib/theater/saved-playing'

const pushSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))

const shellSpy = vi.fn()
vi.mock('@/components/theater/TheaterShell', () => ({
  TheaterShell: (props: {
    personalItems?: unknown[]
    initialPersonalIndex?: number
    preserveSavedStart?: boolean
    onPersonalTabChange?: (tab: 'live' | 'collection') => void
  }) => {
    shellSpy(props)
    return (
      <div
        data-testid="theater-shell"
        data-index={props.initialPersonalIndex}
        data-count={(props.personalItems ?? []).length}
      >
        <button type="button" onClick={() => props.onPersonalTabChange?.('live')}>
          Live
        </button>
        <button type="button" onClick={() => props.onPersonalTabChange?.('collection')}>
          Saved
        </button>
      </div>
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
  sessionStorage.clear()
  localStorage.clear()
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
    await waitFor(() => expect(screen.getByText(/couldn.t load Saved/i)).toBeInTheDocument())
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

  it('does not resume past leftover Saved rows after a Live ⇄ Saved remount', async () => {
    sessionStorage.setItem(SAVED_PLAYING_STORAGE_KEY, 'twitter:b')
    render(<AuthedTheater seed={emptySeed} tab="collection" />)
    await waitFor(() => expect(screen.getByTestId('theater-shell')).toBeInTheDocument())
    expect(screen.getByTestId('theater-shell')).toHaveAttribute('data-index', '0')
  })

  it('loads Saved newest-first, ignoring a leftover session cursor', async () => {
    sessionStorage.setItem(SAVED_PLAYING_STORAGE_KEY, 'twitter:b')
    sessionStorage.setItem(SAVED_PLAYED_STORAGE_KEY, JSON.stringify(['twitter:a']))
    render(<AuthedTheater seed={emptySeed} tab="collection" />)
    await waitFor(() => expect(screen.getByTestId('theater-shell')).toBeInTheDocument())
    expect(screen.getByTestId('theater-shell')).toHaveAttribute('data-index', '0')
  })

  it('Videos leftover starts at the first video, not the next after a text cursor', async () => {
    const video = (id: string) => ({
      id,
      platform: 'twitter',
      media: [{ id: `m${id}`, mediaType: 'video', url: 'x', thumbnailUrl: 'x', shareUrl: 'x' }],
    })
    feedImpl = () =>
      jsonResponse({
        items: [video('1'), video('2'), video('3'), { id: 't', platform: 'twitter' }, video('4')],
      })
    localStorage.setItem('adhx-theater-types', JSON.stringify(['video']))
    sessionStorage.setItem(SAVED_PLAYING_STORAGE_KEY, 'twitter:t')
    render(<AuthedTheater seed={emptySeed} tab="collection" />)
    await waitFor(() => expect(screen.getByTestId('theater-shell')).toBeInTheDocument())
    expect(screen.getByTestId('theater-shell')).toHaveAttribute('data-index', '0')
  })

  it('lets ?open= win over the session Saved cursor', async () => {
    sessionStorage.setItem(SAVED_PLAYING_STORAGE_KEY, 'twitter:a')
    render(<AuthedTheater seed={emptySeed} tab="collection" openId="b" openPlatform="twitter" />)
    await waitFor(() => expect(screen.getByTestId('theater-shell')).toBeInTheDocument())
    expect(screen.getByTestId('theater-shell')).toHaveAttribute('data-index', '1')
    expect(shellSpy.mock.calls.at(-1)?.[0]).toMatchObject({ preserveSavedStart: true })
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

  it('puts /saved back when Saved is clicked on a leftover Live preview path', async () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    window.history.replaceState(null, '', '/author99/status/99')
    replaceSpy.mockClear()
    render(<AuthedTheater seed={emptySeed} tab="collection" />)
    await waitFor(() => expect(screen.getByTestId('theater-shell')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))
    expect(replaceSpy).toHaveBeenCalledWith(null, '', '/saved')
    expect(pushSpy).not.toHaveBeenCalled()
    replaceSpy.mockRestore()
  })

  it('pushes /saved from Live without rewriting the bar first', async () => {
    window.history.replaceState(null, '', '/author99/status/99')
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    render(<AuthedTheater seed={emptySeed} tab="live" />)
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(pushSpy).toHaveBeenCalledWith('/saved')
    replaceSpy.mockRestore()
  })
})
