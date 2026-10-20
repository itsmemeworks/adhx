// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { FormingView } from '@/components/next/moments/live'
import type { FeedItem } from '@/components/feed/types'

/**
 * The board features on the web: "Or straight to your people" in the Share
 * sheet, the forming card's faces and bell, the "is live" toast, the sender's
 * face on "Pete sent you this", and the thumbnail beside "Like … you kept".
 */

import { SendToPeople, alreadyLine } from '@/components/next/theater/SendToPeople'
import { FormingBell } from '@/components/next/moments/RightNow'
import { MomentAlerts, alertLine } from '@/components/next/moments/MomentAlerts'
import { LikeThumb, WhyChip, sentBy } from '@/components/next/theater/FeedParts'

type Call = { url: string; init?: RequestInit }
let calls: Call[]
let respond: (url: string, init?: RequestInit) => unknown

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

beforeEach(() => {
  calls = []
  respond = () => ({})
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      const out = respond(url, init)
      return out instanceof Object && 'ok' in out ? (out as Response) : json(out)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const PEOPLE = [
  { username: 'ana', name: 'Ana', avatarUrl: null, has: false, sent: false },
  { username: 'ben', name: 'Ben', avatarUrl: null, has: false, sent: true },
  { username: 'jo', name: 'Jo', avatarUrl: null, has: true, sent: false },
]

describe('Or straight to your people', () => {
  it('says who already has it', () => {
    expect(alreadyLine(PEOPLE)).toBe('Jo already has it.')
    expect(alreadyLine(PEOPLE.map((p) => ({ ...p, has: true })))).toBe(
      'Ana, Ben and Jo already have it.',
    )
    expect(alreadyLine([])).toBe('')
  })

  it('shows a face per member, dims who has it, and sends with the note on a tap', async () => {
    respond = (url, init) =>
      init?.method === 'POST' ? { sent: ['ana'], skipped: [] } : { sendable: true, people: PEOPLE }
    render(<SendToPeople platform="youtube" id="abc" />)
    const ana = await screen.findByRole('button', { name: 'Send to Ana' })
    expect(screen.getByRole('button', { name: 'Jo already has it' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sent to Ben' })).toBeDisabled()
    expect(screen.getByText('Jo already has it.')).toBeInTheDocument()
    expect(calls[0].url).toBe('/api/posts/send?platform=youtube&id=abc')

    fireEvent.change(screen.getByLabelText('A note with it (optional)'), {
      target: { value: 'you need this' },
    })
    fireEvent.click(ana)
    await screen.findByRole('button', { name: 'Sent to Ana' })
    const post = calls.find((c) => c.init?.method === 'POST')!
    expect(post.url).toBe('/api/posts/send')
    expect(JSON.parse(String(post.init!.body))).toEqual({
      platform: 'youtube',
      id: 'abc',
      to: ['ana'],
      note: 'you need this',
    })
  })

  it('a post only you keep privately can’t be sent', async () => {
    respond = () => ({ sendable: false, people: [] })
    render(<SendToPeople platform="youtube" id="abc" />)
    expect(await screen.findByText('Just for you. Share it first to send it.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows nothing for a post you can’t see', async () => {
    respond = () => json({ error: 'nope', code: 'not_found' }, 404)
    const { container } = render(<SendToPeople platform="youtube" id="abc" />)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(container).toBeEmptyDOMElement()
  })
})

function forming(extra: Partial<FormingView> = {}): FormingView {
  return {
    id: 'fabc-1',
    title: 'Kitchen synths',
    hue: '#86c2ff',
    have: 2,
    need: 3,
    unit: 'people',
    covers: [],
    ...extra,
  }
}

describe('Tell me when it’s live', () => {
  it('toggles the bell, and asks for notifications on the way in', async () => {
    const ask = vi.fn(async () => 'granted')
    vi.stubGlobal(
      'Notification',
      Object.assign(vi.fn(), { permission: 'default', requestPermission: ask }),
    )
    respond = (_url, init) => ({ alert: init?.method === 'PUT' })
    render(<FormingBell forming={forming({ alert: false })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tell me when it’s live' }))
    await screen.findByRole('button', { name: 'We’ll tell you' })
    expect(ask).toHaveBeenCalledTimes(1)
    expect(calls[0]).toMatchObject({
      url: '/api/moments/forming/fabc-1/alert',
      init: { method: 'PUT' },
    })
    expect(screen.getByRole('button', { name: 'We’ll tell you' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'We’ll tell you' }))
    await screen.findByRole('button', { name: 'Tell me when it’s live' })
    expect(calls[1].init?.method).toBe('DELETE')
  })

  it('says so when the group has gone', async () => {
    respond = () => json({ error: 'gone', code: 'forming_gone' }, 404)
    render(<FormingBell forming={forming({ alert: false })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tell me when it’s live' }))
    expect(await screen.findByText('It’s not forming any more')).toBeInTheDocument()
  })

  it('strangers get no bell', () => {
    const { container } = render(<FormingBell forming={forming()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('the "is live" toast', () => {
  it('shows each new alert with Tune in, and marks it seen when dismissed', async () => {
    const shown = vi.fn()
    vi.stubGlobal('Notification', Object.assign(shown, { permission: 'granted' }))
    respond = (url) =>
      url === '/api/moments/alerts'
        ? {
            alerts: [
              {
                id: 'a7',
                slug: 'kitchen-synths-x1y2',
                title: 'Kitchen synths',
                at: new Date().toISOString(),
              },
            ],
          }
        : { ok: true }
    render(<MomentAlerts />)
    expect(await screen.findByText('Kitchen synths is live')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tune in' })).toHaveAttribute(
      'href',
      '/play?moment=kitchen-synths-x1y2',
    )
    expect(shown).toHaveBeenCalledWith('Kitchen synths is live', expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() =>
      expect(calls.find((c) => c.url === '/api/moments/alerts/seen')?.init?.body).toBe(
        JSON.stringify({ ids: ['a7'] }),
      ),
    )
    expect(screen.queryByText('Kitchen synths is live')).not.toBeInTheDocument()
    expect(alertLine({ title: 'Babies vs objects' })).toBe('Babies vs objects is live')
  })

  it('polls again every minute', async () => {
    vi.useFakeTimers()
    respond = () => ({ alerts: [] })
    render(<MomentAlerts />)
    await act(async () => {
      await Promise.resolve()
    })
    const first = calls.length
    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    expect(calls.length).toBe(first + 1)
  })
})

describe('why: sent and like', () => {
  const sent: Pick<FeedItem, 'why' | 'whyReasons' | 'savers'> = {
    why: 'Pete sent you this',
    whyReasons: [{ kind: 'sent', text: 'Pete sent you this', username: 'pete' }],
    savers: [{ username: 'pete', name: 'Pete', avatarUrl: null, savedAt: '', isYou: false }],
  }

  it('leads "Pete sent you this" with Pete’s face', () => {
    expect(sentBy(sent)).toEqual({ avatarUrl: null, handle: 'pete', name: 'Pete' })
    const { container } = render(<WhyChip post={sent} onOpen={() => {}} />)
    expect(
      screen.getByRole('button', { name: 'Why this one: Pete sent you this' }),
    ).toBeInTheDocument()
    expect(container.querySelector('[data-face="initial"]')).toHaveAttribute('data-initial', 'P')
  })

  it('names the sender from the reason when they have no visible save', () => {
    expect(sentBy({ ...sent, savers: [] })).toEqual({
      avatarUrl: null,
      handle: 'pete',
      name: 'Pete',
    })
    expect(sentBy({ whyReasons: [{ kind: 'fresh', text: 'Ana saved this · 1h' }] })).toBeNull()
  })

  it('shows the kept post beside "Like … you kept", and opens it in My saves', () => {
    render(
      <LikeThumb
        post={{ platform: 'instagram', id: 'DbaF', posterUrl: '/api/files/instagram/DbaF/poster' }}
      />,
    )
    expect(screen.getByRole('link', { name: 'Open the post you kept' })).toHaveAttribute(
      'href',
      '/play?recent=1&start=instagram%3ADbaF',
    )
    const { container } = render(<LikeThumb post={{ platform: 'x', id: '1', posterUrl: null }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
