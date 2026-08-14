/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { SyncProgress } from '@/components/sync/SyncProgress'
import { REAUTH_MESSAGE, X_UNAVAILABLE_MESSAGE } from '@/lib/sync/messages'

type Listener = (event: Event) => void

class MockEventSource {
  static instances: MockEventSource[] = []
  listeners: Record<string, Listener[]> = {}
  onerror: ((event: Event) => void) | null = null
  url: string

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, cb: Listener) {
    ;(this.listeners[type] ||= []).push(cb)
  }

  close() {}

  emit(type: string, data?: unknown) {
    const event =
      data === undefined ? new Event(type) : new MessageEvent(type, { data: JSON.stringify(data) })
    this.listeners[type]?.forEach((cb) => cb(event))
  }
}

describe('SyncProgress error UX', () => {
  beforeEach(() => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a reconnect CTA for classified reauth errors, not a raw HTTP status', async () => {
    render(<SyncProgress isOpen onClose={() => {}} />)

    await act(async () => {
      const es = MockEventSource.instances[0]
      expect(es).toBeDefined()
      es.emit('start', { syncId: 'abc', total: null })
      es.emit('error', { message: REAUTH_MESSAGE, code: 'reauth' })
    })

    expect(screen.getByText('Reconnect your X account')).toBeInTheDocument()
    expect(screen.getByText(REAUTH_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText(/402/)).not.toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(screen.queryByText('Retry')).not.toBeInTheDocument()
    expect(screen.getByText(/Connect with/)).toBeInTheDocument()
  })

  it('does not offer reconnect when X returns 402 (no API credits)', async () => {
    render(<SyncProgress isOpen onClose={() => {}} />)

    await act(async () => {
      MockEventSource.instances[0].emit('error', {
        message: X_UNAVAILABLE_MESSAGE,
        code: 'unavailable',
      })
    })

    expect(screen.getByText("Couldn't sync bookmarks")).toBeInTheDocument()
    expect(screen.getByText(X_UNAVAILABLE_MESSAGE)).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
    expect(screen.queryByText(/Connect with/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Reconnect your X account/)).not.toBeInTheDocument()
  })

  it('keeps Retry for generic failures', async () => {
    render(<SyncProgress isOpen onClose={() => {}} />)

    await act(async () => {
      MockEventSource.instances[0].emit('error', {
        message: 'Something went wrong pulling bookmarks from X. Try again in a moment.',
        code: 'generic',
      })
    })

    expect(screen.getByText("Couldn't sync bookmarks")).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
    expect(screen.queryByText(/Connect with/)).not.toBeInTheDocument()
  })

  it('stays invisible while a silent sync is in progress', async () => {
    const { container } = render(<SyncProgress isOpen silent onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()

    await act(async () => {
      MockEventSource.instances[0].emit('start', { syncId: 'abc', total: null })
    })
    expect(container).toBeEmptyDOMElement()
  })
})
