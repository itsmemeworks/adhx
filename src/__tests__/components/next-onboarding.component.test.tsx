// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import {
  currentLine,
  LearningPill,
  LearningSheet,
  learningSummary,
  pillLabel,
  type LearningStatus,
} from '@/components/next/onboarding/learning'
import { linkFromText, usePasteToSave } from '@/components/next/onboarding/usePasteToSave'
import { StartScreen } from '@/components/next/onboarding/StartScreen'
import {
  recentPlayHref,
  sourceFromParams,
  queueUrl,
  backHref,
} from '@/components/next/theater/queue'

function status(partial: Partial<LearningStatus> = {}): LearningStatus {
  return {
    enabled: true,
    groups: [
      { id: 'words', done: 100, total: 100, failed: 0 },
      { id: 'photos', done: 77, total: 77, failed: 0 },
      { id: 'videos', done: 34, total: 271, failed: 2 },
    ],
    ready: 211,
    totalSaves: 448,
    failed: 2,
    queued: 237,
    current: { kind: 'video', phase: 'understanding', frames: 16 },
    ...partial,
  }
}

describe('learning progress', () => {
  it('summarises what is left, focusing on the slowest kind', () => {
    const summary = learningSummary(status())
    expect(summary.remaining).toBe(237)
    expect(summary.focus?.id).toBe('videos')
    expect(pillLabel(summary.focus!)).toBe('Learning videos · 34/271')
    expect(currentLine(status().current)).toBe('Watching a video · 16 frames')
    expect(learningSummary(null)).toMatchObject({ remaining: 0, focus: null })
  })

  it('stays quiet when done, even if some couldn’t be learned', () => {
    const done = status({
      groups: [{ id: 'words', done: 10, total: 10, failed: 0 }],
      failed: 0,
      current: null,
    })
    const { container, rerender } = render(<LearningPill status={done} onOpen={() => {}} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<LearningPill status={{ ...done, failed: 3 }} onOpen={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('says only true things and never mentions failures', () => {
    render(<LearningSheet status={status()} onClose={() => {}} />)
    expect(screen.getByText('Watched, a frame every two seconds')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/audio|outside AI|couldn’t be learned/i)
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })
})

function PasteHarness({ onSaved }: { onSaved: (key: string) => void }) {
  const paste = usePasteToSave({
    onSaved: (p) => onSaved(p.key),
    savedAction: () => ({ label: 'Play', onClick: () => {} }),
  })
  return (
    <div>
      <input aria-label="typing here" />
      {paste.toast}
    </div>
  )
}

function pasteText(target: Element, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & {
    clipboardData: { getData: () => string }
  }
  event.clipboardData = { getData: () => text }
  target.dispatchEvent(event)
}

describe('paste a link anywhere', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('finds the link in pasted text', () => {
    expect(linkFromText('look https://x.com/a/status/123, wow')).toBe('https://x.com/a/status/123')
    expect(linkFromText('no link here')).toBeNull()
    expect(linkFromText('javascript:alert(1)')).toBeNull()
  })

  it('saves a pasted post and ignores pastes into text fields', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            platform: 'twitter',
            bookmark: { id: '123', author: 'a' },
          }),
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onSaved = vi.fn()
    render(<PasteHarness onSaved={onSaved} />)
    pasteText(screen.getByLabelText('typing here'), 'https://x.com/a/status/999')
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => pasteText(document.body, 'https://x.com/a/status/123'))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('twitter:123'))
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ url: 'https://x.com/a/status/123' })
    expect(screen.getByText('@a')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('asks a signed-out viewer to sign in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    )
    render(<PasteHarness onSaved={() => {}} />)
    await act(async () => pasteText(document.body, 'https://x.com/a/status/1'))
    await waitFor(() => expect(screen.getByText('Sign in to save posts')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/start')
  })
})

describe('getting started', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('sends a link, then notices the sign-in and offers to connect X', async () => {
    let signedIn = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/me') {
        return new Response(
          JSON.stringify(
            signedIn
              ? { authenticated: true, user: { username: 'pat' }, xConnected: false }
              : { authenticated: false },
          ),
        )
      }
      if (url === '/api/auth/email/request') {
        expect(JSON.parse(String(init?.body))).toEqual({
          email: 'pat@example.test',
          returnTo: '/search',
        })
        return new Response(JSON.stringify({ ok: true }))
      }
      return new Response(JSON.stringify({ enabled: false, groups: [] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<StartScreen returnTo="/search" autoSync={false} />)
    const input = await screen.findByLabelText('Your email. We’ll send a link, no password.')
    fireEvent.change(input, { target: { value: 'pat@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send me a link' }))
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument()

    signedIn = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100)
    })
    expect(await screen.findByText('You’re in, @pat.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Connect/ })).toHaveAttribute(
      'href',
      '/api/auth/twitter?returnUrl=%2Fstart%3Fsync%3D1',
    )
  })
})

describe('setting up a new ADHX', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('points the owner at the server log for their first link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/auth/email/request'
          ? new Response(JSON.stringify({ ok: true, delivery: 'admin', setup: true }))
          : new Response(JSON.stringify({ authenticated: false })),
      ),
    )
    render(<StartScreen returnTo="/" autoSync={false} />)
    const input = await screen.findByLabelText('Your email. We’ll send a link, no password.')
    fireEvent.change(input, { target: { value: 'me@home.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send me a link' }))
    expect(await screen.findByText(/is in the server log/)).toBeInTheDocument()
    expect(screen.queryByText(/Ask whoever runs it/)).not.toBeInTheDocument()
  })

  it('starts people on saving a post when this ADHX can’t connect X', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              authenticated: true,
              user: { username: 'pat' },
              xConnected: false,
              xAvailable: false,
            }),
          ),
      ),
    )
    render(<StartScreen returnTo="/" autoSync={false} />)
    expect(await screen.findByText('Save your first post')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Connect/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Let’s go' })).toHaveAttribute('href', '/now')
  })
})

describe('recent saves queue', () => {
  it('plays a pasted post from your newest saves', () => {
    expect(recentPlayHref('twitter:1')).toBe('/play?recent=1&start=twitter%3A1')
    const source = sourceFromParams({ recent: '1', start: 'twitter:1' })
    expect(source).toMatchObject({ recent: true, start: 'twitter:1' })
    expect(queueUrl(source, () => '/api/search')).toBe('/api/feed?limit=100&hideArchived=true')
    expect(backHref(source)).toBe('/now')
  })
})
