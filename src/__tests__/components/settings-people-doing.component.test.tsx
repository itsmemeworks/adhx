/**
 * @vitest-environment jsdom
 *
 * Settings → You (Change picture dialog), Settings → Your people (the
 * "Waiting for you" queue, invite rows, who can invite) and /doing (What
 * your ADHX is doing, and the header's "N on their way").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AvatarDialog } from '@/components/next/settings/AvatarDialog'
import { JoinQueue, PeopleCard, type PeopleData } from '@/components/next/settings/PeopleCard'
import { DoingScreen } from '@/components/next/doing/DoingScreen'
import { OnTheirWayPill } from '@/components/next/doing/OnTheirWayPill'
import type { DoingItem, DoingSummary } from '@/components/next/doing/useDoing'

let pathname = '/settings'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/auth', () => ({
  useAuthMe: () => ({ me: { authenticated: true }, loading: false, refresh: vi.fn() }),
  invalidateAuthMe: vi.fn(),
}))

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)

let fetchMock: ReturnType<typeof vi.fn>
const calls = () =>
  fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: (init as RequestInit | undefined)?.method ?? 'GET',
    body: (init as RequestInit | undefined)?.body,
  }))

beforeEach(() => {
  pathname = '/settings'
  fetchMock = vi.fn(() => json({}))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('Change picture dialog', () => {
  const props = {
    username: 'pete',
    displayName: 'Pete',
    xPicture: null as string | null,
    current: { source: 'generated' as const, url: null },
    onClose: vi.fn(),
    onSaved: vi.fn(),
  }

  /** jsdom never loads images: pretend this one is 800×400. */
  function fakeImages() {
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 800
        naturalHeight = 400
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_v: string) {
          setTimeout(() => this.onload?.(), 0)
        }
      },
    )
    URL.createObjectURL = vi.fn(() => 'blob:photo')
    URL.revokeObjectURL = vi.fn()
  }

  function choose(file: File) {
    fireEvent.change(screen.getByLabelText('Upload a photo'), { target: { files: [file] } })
  }

  it('offers upload, camera and a Gob, and X only with an X picture', () => {
    const { unmount } = render(<AvatarDialog {...props} />)
    const dialog = screen.getByRole('dialog', { name: 'Change picture' })
    expect(within(dialog).getByRole('radio', { name: /Upload a photo/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: /Take one/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('radio', { name: /Use your X picture/ })).toBeNull()
    expect(screen.getByLabelText('Take a photo')).toHaveAttribute('capture', 'user')
    unmount()
    render(<AvatarDialog {...props} xPicture="https://pbs.twimg.com/me.jpg" />)
    expect(screen.getByRole('radio', { name: /Use your X picture/ })).toBeInTheDocument()
  })

  it('refuses a photo over 5 MB or of the wrong type without sending it', () => {
    render(<AvatarDialog {...props} />)
    choose(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' }))
    expect(screen.getByRole('alert')).toHaveTextContent('over 5 MB')
    choose(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }))
    expect(screen.getByRole('alert')).toHaveTextContent('JPEG, PNG')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('crops with a zoom slider and sends the numbers with the photo', async () => {
    fakeImages()
    fetchMock.mockImplementation(() =>
      json({ avatarUrl: '/api/files/avatar/abc', source: 'upload' }),
    )
    render(<AvatarDialog {...props} />)
    choose(new File([new Uint8Array(10)], 'pub.jpg', { type: 'image/jpeg' }))
    const zoom = await screen.findByRole('slider', { name: 'Zoom' })
    fireEvent.change(zoom, { target: { value: '2' } })
    // Keyboard nudges move the crop, clamped inside the photo.
    const crop = screen.getByRole('group', { name: /Crop/ })
    for (let i = 0; i < 40; i++) fireEvent.keyDown(crop, { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: /Upload a photo/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled())
    const [{ url, method, body }] = calls()
    expect(url).toBe('/api/account/avatar')
    expect(method).toBe('POST')
    const form = body as FormData
    expect((form.get('file') as File).name).toBe('pub.jpg')
    expect(form.get('zoom')).toBe('2')
    // Side 200 of 800: the centre stops at 0.875 on the right.
    expect(Number(form.get('x'))).toBeCloseTo(0.875)
  })

  it('makes a Gob in the colour picked, with a live preview', async () => {
    fetchMock.mockImplementation(() => json({ avatarUrl: '/api/files/avatar/abc', source: 'gob' }))
    render(<AvatarDialog {...props} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Teal' }))
    const preview = screen.getByTestId('avatar-preview')
    await waitFor(() =>
      expect(within(preview).getByTitle('Pete saved this').querySelector('img')!.src).toMatch(
        /^data:image\/svg\+xml/,
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(String(calls()[0].body))).toEqual({ source: 'gob', colour: 'teal' })
  })

  it('Remove picture deletes it', async () => {
    fetchMock.mockImplementation(() => json({ avatarUrl: null, source: 'generated' }))
    render(<AvatarDialog {...props} current={{ source: 'upload', url: '/api/files/avatar/abc' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove picture' }))
    await waitFor(() => expect(calls()[0]).toMatchObject({ method: 'DELETE' }))
  })
})

describe('Waiting for you', () => {
  const requests = [
    {
      id: 'inv_abc',
      username: 'ben',
      name: 'Ben',
      askedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      invitedBy: { username: 'jo', name: 'Jo' },
    },
  ]

  it('shows who is waiting and who invited them', () => {
    render(<JoinQueue requests={requests} onDecided={vi.fn()} />)
    expect(screen.getByRole('heading', { name: /Waiting for you/ })).toHaveTextContent('1')
    expect(screen.getByText('invited by Jo · 10 min ago')).toBeInTheDocument()
  })

  it.each([
    ['Let Ben in', 'approve'],
    ['Not now', 'not_now'],
    ['Decline Ben', 'decline'],
  ])('%s sends %s', async (button, decision) => {
    const onDecided = vi.fn()
    fetchMock.mockImplementation(() => json({ approval: 'approved' }))
    render(<JoinQueue requests={requests} onDecided={onDecided} />)
    fireEvent.click(screen.getByRole('button', { name: button }))
    await waitFor(() => expect(onDecided).toHaveBeenCalled())
    expect(calls()[0]).toMatchObject({ url: '/api/people/requests/inv_abc', method: 'POST' })
    expect(JSON.parse(String(calls()[0].body))).toEqual({ decision })
  })

  it('shows nothing when nobody is waiting', () => {
    const { container } = render(<JoinQueue requests={[]} onDecided={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Your people', () => {
  const data: PeopleData = {
    isAdmin: true,
    canInvite: true,
    inviteMode: 'approve',
    requests: [],
    members: [
      {
        username: 'pete',
        name: 'Pete',
        avatarUrl: null,
        saves: 212,
        lastSavedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        role: 'owner',
        banned: false,
        isYou: true,
      },
      {
        username: 'ana',
        name: 'Ana',
        avatarUrl: null,
        saves: 348,
        lastSavedAt: null,
        role: 'member',
        banned: false,
        isYou: false,
      },
    ],
  }
  const invite = {
    id: 'inv_7kq4Zx',
    code: '7KQ4',
    createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    nameHint: null,
    createdBy: 'pete',
    mine: true,
  }

  beforeEach(() => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/invites' && (init?.method ?? 'GET') === 'GET')
        return json({ canInvite: true, invites: [invite] })
      if (url === '/api/invites/inv_7kq4Zx/link')
        return json({
          id: invite.id,
          url: 'http://localhost:3000/invite/NEWTOKEN',
          expiresAt: invite.expiresAt,
        })
      return json({ ok: true })
    })
  })

  it('lists members with saves and a role chip', async () => {
    render(<PeopleCard data={data} reload={vi.fn()} />)
    expect(screen.getByText('2 on this server')).toBeInTheDocument()
    expect(screen.getByText('212 saves · last saved 2h ago')).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(screen.getByText('Member')).toBeInTheDocument()
    // Admins get a menu for members, not for themselves.
    expect(screen.getByRole('button', { name: 'More for Ana' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More for Pete' })).toBeNull()
  })

  it('bans a member from the ⋯ menu with the admin helper', async () => {
    const reload = vi.fn()
    render(<PeopleCard data={data} reload={reload} />)
    fireEvent.click(screen.getByRole('button', { name: 'More for Ana' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ban Ana' }))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    const ban = calls().find((c) => c.url === '/api/admin/users')!
    expect(JSON.parse(String(ban.body))).toEqual({ username: 'ana', banned: true })
  })

  it('shows invites by a short code, never the link', async () => {
    render(<PeopleCard data={data} reload={vi.fn()} />)
    const code = await screen.findByText('7KQ4')
    expect(code.closest('.font-mono')).not.toBeNull()
    expect(screen.getByText(/Made by you 2 min ago · expires in 7 days/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('/invite/')
  })

  it('Copy link on an older invite asks first, then copies a fresh link', async () => {
    render(<PeopleCard data={data} reload={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Copy link for invite 7KQ4' }))
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'http://localhost:3000/invite/NEWTOKEN',
      ),
    )
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('stops working'))
    expect(await screen.findByText(/New link copied/)).toBeInTheDocument()
  })

  it('Copy link does nothing when you say no', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    render(<PeopleCard data={data} reload={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Copy link for invite 7KQ4' }))
    await act(async () => {})
    expect(calls().some((c) => c.url.endsWith('/link'))).toBe(false)
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('who can invite: admins pick one of three', async () => {
    const reload = vi.fn()
    render(<PeopleCard data={data} reload={reload} />)
    const group = screen.getByRole('group', { name: 'Who can invite' })
    expect(within(group).getByRole('button', { name: 'Anyone, I approve' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(group).getByText('You say yes before anyone gets in.')).toBeInTheDocument()
    fireEvent.click(within(group).getByRole('button', { name: 'Only me' }))
    await waitFor(() => expect(reload).toHaveBeenCalled())
    const patch = calls().find((c) => c.method === 'PATCH')!
    expect(JSON.parse(String(patch.body))).toEqual({ inviteMode: 'admin' })
  })

  it('members don’t see who can invite or the ⋯ menu', () => {
    render(<PeopleCard data={{ ...data, isAdmin: false, requests: undefined }} reload={vi.fn()} />)
    expect(screen.queryByRole('group', { name: 'Who can invite' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'More for Ana' })).toBeNull()
  })
})

describe('What your ADHX is doing', () => {
  const summary: DoingSummary = {
    onTheirWay: 3,
    keeping: 2,
    learning: 1,
    needsYou: 1,
    ready: 1,
    freeBytes: 412 * 1024 ** 3,
    processing: 'remote',
    remoteConnected: true,
  }
  const base: Omit<DoingItem, 'id' | 'status' | 'step' | 'stepLabel'> = {
    platform: 'instagram',
    title: 'Trying dark chocolate for the first time',
    network: 'Instagram video',
    thumbnail: '/thumb.jpg',
    openPath: '/reels/abc',
    savers: [{ username: 'pete', name: 'Pete', avatarUrl: null, savedAt: '', isYou: true }],
    savedAt: new Date(Date.now() - 60_000).toISOString(),
    steps: 7,
    percent: null,
    playable: false,
    reason: null,
    retryInfo: null,
    quality: null,
    learned: [],
    retry: false,
    keepLinkOnly: false,
    finishedAt: null,
  }
  const items: DoingItem[] = [
    { ...base, id: 'a', status: 'working', step: 2, stepLabel: 'Keeping a copy', percent: 62 },
    {
      ...base,
      id: 'b',
      status: 'needs_you',
      step: 2,
      stepLabel: 'Keeping a copy',
      reason: 'It’s private on Instagram.',
      retry: true,
      keepLinkOnly: true,
    },
    {
      ...base,
      id: 'c',
      status: 'ready',
      step: 7,
      stepLabel: 'Ready',
      quality: '4K',
      learned: ['words', 'picture', 'speech'],
      finishedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    },
  ]

  beforeEach(() => {
    pathname = '/doing'
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input).startsWith('/api/activity/processing?')
        ? json({ items, summary })
        : json({ ok: true }),
    )
  })

  it('shows the summary and each post’s step', async () => {
    render(<DoingScreen />)
    expect(await screen.findByText('Step 2 of 7 · Keeping a copy · 62%')).toBeInTheDocument()
    expect(screen.getByText('2 keeping')).toBeInTheDocument()
    expect(screen.getByText('412 GB free')).toBeInTheDocument()
    expect(screen.getByText('Mac helper connected')).toBeInTheDocument()
    expect(screen.getByText('Couldn’t keep this. It’s private on Instagram.')).toBeInTheDocument()
    expect(screen.getByText('Kept in 4K · words, picture and speech learned')).toBeInTheDocument()
    expect(screen.getByText('Ready · 2 min ago')).toBeInTheDocument()
    expect(screen.getAllByText(/You saved this/).length).toBeGreaterThan(0)
  })

  it('Retry and Keep the link only post the post’s key', async () => {
    render(<DoingScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(calls().some((c) => c.url === '/api/activity/processing/retry')).toBe(true),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Keep the link only' }))
    await waitFor(() =>
      expect(calls().some((c) => c.url === '/api/activity/processing/link-only')).toBe(true),
    )
    const retry = calls().find((c) => c.url === '/api/activity/processing/retry')!
    expect(JSON.parse(String(retry.body))).toEqual({ platform: 'instagram', id: 'b' })
  })

  it('switches scope and polls every 3 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<DoingScreen />)
    await screen.findByText('2 keeping')
    fireEvent.click(screen.getByRole('button', { name: /Needs you/ }))
    await waitFor(() => expect(calls().some((c) => c.url.includes('scope=needs'))).toBe(true))
    const before = calls().length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100)
    })
    expect(calls().length).toBeGreaterThan(before)
  })

  it('says so when nothing is on its way', async () => {
    fetchMock.mockImplementation(() => json({ items: [], summary: { ...summary, onTheirWay: 0 } }))
    render(<DoingScreen />)
    expect(await screen.findByText('All kept, all learned.')).toBeInTheDocument()
  })
})

describe('N on their way', () => {
  it('links to /doing while something is on its way', async () => {
    fetchMock.mockImplementation(() => json({ summary: { ...summaryWith(3) } }))
    render(<OnTheirWayPill />)
    const link = await screen.findByRole('link', { name: /3 on their way/ })
    expect(link).toHaveAttribute('href', '/doing')
    expect(calls()[0].url).toContain('summary=1')
  })

  it('is hidden when nothing is', async () => {
    fetchMock.mockImplementation(() => json({ summary: summaryWith(0) }))
    const { container } = render(<OnTheirWayPill />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('labels stale header progress instead of suggesting work is still updating', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockImplementationOnce(() => json({ summary: summaryWith(3) }))
      .mockRejectedValue(new Error('offline'))
    render(<OnTheirWayPill />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByRole('link', { name: /3 on their way/ })).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_001)
    })
    expect(
      screen.getByRole('link', { name: /Progress unavailable. Last count: 3/ }),
    ).toBeInTheDocument()
  })

  function summaryWith(n: number): DoingSummary {
    return {
      onTheirWay: n,
      keeping: n,
      learning: 0,
      needsYou: 0,
      ready: 0,
      freeBytes: null,
      processing: 'local',
      remoteConnected: null,
    }
  }
})
