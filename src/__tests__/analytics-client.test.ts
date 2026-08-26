import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pingAnalytic } from '@/lib/analytics/client'

const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))

describe('pingAnalytic', () => {
  beforeEach(() => {
    fetchMock.mockClear()
    vi.stubGlobal('window', {})
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not send post events with invalid identity', () => {
    pingAnalytic('post.copy')
    pingAnalytic('post.copy', { platform: 'twitter' })
    pingAnalytic('post.copy', { platform: 'myspace', id: '1' })
    pingAnalytic('post.copy', { platform: 'twitter', id: '   ' })
    pingAnalytic('post.copy', { platform: 'twitter', id: 'x'.repeat(81) })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends a canonical supported post identity', () => {
    pingAnalytic('post.open', {
      platform: 'youtube',
      id: '  short-id  ',
      surface: 'shared',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/analytics')
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: 'post.open',
      platform: 'youtube',
      id: 'short-id',
      surface: 'shared',
    })
  })

  it('sends shortcut installs without post identity', () => {
    pingAnalytic('shortcut.install', {
      platform: 'twitter',
      id: 'ignored',
      source: 'shortcut',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'shortcut.install',
      source: 'shortcut',
    })
  })
})
