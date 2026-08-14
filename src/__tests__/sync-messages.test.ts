/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { GENERIC_SYNC_MESSAGE, X_DENIED_MESSAGE, parseSyncErrorEvent } from '@/lib/sync/messages'

describe('parseSyncErrorEvent', () => {
  it('reads a classified SSE error payload', () => {
    const event = new MessageEvent('error', {
      data: JSON.stringify({ message: X_DENIED_MESSAGE, code: 'reauth' }),
    })
    expect(parseSyncErrorEvent(event)).toEqual({
      message: X_DENIED_MESSAGE,
      code: 'reauth',
    })
  })

  it('falls back to generic for a bare EventSource onerror', () => {
    const event = new Event('error')
    expect(parseSyncErrorEvent(event)).toEqual({
      message: 'Connection lost. Check your network and try again.',
      code: 'generic',
    })
  })

  it('never surfaces a raw HTTP status from malformed payloads', () => {
    const event = new MessageEvent('error', { data: 'not-json' })
    expect(parseSyncErrorEvent(event).message).toBe(GENERIC_SYNC_MESSAGE)
    expect(parseSyncErrorEvent(event).message).not.toMatch(/\d{3}/)
  })
})
