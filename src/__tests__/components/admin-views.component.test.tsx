/**
 * @vitest-environment jsdom
 *
 * The admin area's main views (boards 10.1, 10.2, 10.7, 10.10): what they
 * show from a board's data, the actions they call, and that a Just for me
 * save is only ever a count.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AdminNav } from '@/components/next/admin/AdminNav'
import { OverviewView } from '@/components/next/admin/OverviewView'
import { InvitesView } from '@/components/next/admin/InvitesView'
import { PeopleView } from '@/components/next/admin/PeopleView'
import { PersonView } from '@/components/next/admin/PersonView'
import { ProcessingView } from '@/components/next/admin/ProcessingView'
import { PostLookup } from '@/components/next/admin/PostLookup'
import type { InvitesBoard } from '@/lib/admin/boards/moderation'
import type { OverviewBoard } from '@/lib/admin/boards/overview'
import type { AdminMember, PeopleBoard, PersonBoard } from '@/lib/admin/boards/people'
import type { ProcessingBoard } from '@/lib/admin/boards/processing'
import { SIGN_IN_LINKS_HREF } from '@/lib/next-ui/routes'

let pathname = '/admin'
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  pathname = '/admin'
  refresh.mockReset()
  fetchMock = vi.fn(() => json({}))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const face = (username: string, name: string) => ({ username, name, avatarUrl: null })

function member(over: Partial<AdminMember>): AdminMember {
  return {
    ...face('ana', 'Ana'),
    role: 'member',
    isYou: false,
    banned: false,
    joinedAt: '2026-08-14T10:00:00.000Z',
    lastSeenAt: new Date(Date.now() - 6 * 60_000).toISOString(),
    invitedBy: face('pete', 'Pete'),
    saves: 96,
    privateSaves: 6,
    notes: 6,
    sends: 9,
    reactions: 88,
    channels: 5,
    phones: 1,
    ...over,
  }
}

describe('AdminNav', () => {
  it('lights the section you’re on and shows what needs you', () => {
    pathname = '/admin/people/ana'
    render(<AdminNav badges={{ people: 1, invites: 2 }} />)
    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    expect(within(nav).getByRole('link', { name: /People/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByLabelText('1 need you')).toBeInTheDocument()
    expect(within(nav).getByLabelText('2 need you')).toBeInTheDocument()
    expect(within(nav).getAllByRole('link')).toHaveLength(10)
  })
})

describe('OverviewView', () => {
  const data: OverviewBoard = {
    range: 'week',
    rangeWords: 'this week',
    people: { count: 5, waiting: 1 },
    saves: { total: 605, added: 38, privateTotal: 25 },
    kept: { bytes: 41.2 * 1024 ** 3, posts: 548, onTheirWay: 3 },
    channels: { made: 23, public: 6, group: 4 },
    reactions: { total: 312, added: 86 },
    sends: { total: 47, watched: 31 },
    days: Array.from({ length: 30 }, (_, i) => ({
      day: `2026-09-${String(21 + (i % 9)).padStart(2, '0')}`,
      shared: i,
      private: i % 3,
    })),
    busiestDay: { day: '2026-10-11', saves: 33 },
    opens: { total: 1204, webPct: 61 },
    plays: { total: 3410, finishedPct: 72 },
    notes: { total: 18, pctOfSaves: 3 },
    moments: { count: 7, peak: 4 },
    health: {
      dbOk: true,
      keptBytes: 41.2 * 1024 ** 3,
      diskTotal: 1.8 * 1024 ** 4,
      diskFree: 1.76 * 1024 ** 4,
      helper: 'connected',
      understoodPct: 96,
    },
    mostSaved: [
      {
        post: {
          platform: 'youtube',
          id: 'c',
          title: 'Charlie bit my finger',
          network: 'YouTube',
          thumbnail: null,
          openPath: '/s/youtube/c',
        },
        savers: [face('ana', 'Ana'), face('ben', 'Ben')],
        saves: 4,
        detail: 'YouTube · 4 saves · 9 plays',
      },
    ],
    busiest: [{ face: face('ben', 'Ben'), saves: 14, reactions: 31, pct: 100 }],
  }

  it('shows the KPIs, the chart, most saved and who’s busiest', () => {
    render(<OverviewView data={data} server="adhx.home" />)
    expect(screen.getByRole('heading', { name: 'Your ADHX, this week' })).toBeInTheDocument()
    expect(screen.getByText('1 waiting for you')).toBeInTheDocument()
    expect(screen.getByText('+38 this week · 25 Just for me')).toBeInTheDocument()
    expect(screen.getByText('41.2 GB')).toBeInTheDocument()
    expect(screen.getByText('Busiest: Sunday 11 Oct, 33 saves')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Charlie bit my finger' })).toHaveAttribute(
      'href',
      '/s/youtube/c',
    )
    expect(screen.getByText('14 saves · 31 reacts')).toBeInTheDocument()
    expect(screen.getByText('Mac helper connected')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Week' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: 'Month' })).toHaveAttribute(
      'href',
      '/admin?range=month',
    )
  })
})

describe('PeopleView', () => {
  const data: PeopleBoard = {
    members: [
      member({ ...face('pete', 'Pete'), role: 'admin', isYou: true, invitedBy: null }),
      member({}),
      member({ ...face('ben', 'Ben'), privateSaves: 0 }),
    ],
    requests: [
      {
        id: 'inv_M2XD',
        username: 'benji',
        name: 'Ben',
        askedAt: new Date().toISOString(),
        invitedBy: { username: 'jo', name: 'Jo' },
        snoozedUntil: null,
      },
    ],
    inviteMode: 'approve',
    invites: { waiting: 2, used: 4, codes: ['7KQ4', 'R9TB'] },
    phones: { total: 6, ios: 4, android: 2, unknown: 0 },
    admins: 1,
  }

  it('lists members with Just for me as a count, and lets benji in', async () => {
    render(<PeopleView data={data} server="adhx.home" />)
    expect(screen.getByText('Pete (you)')).toBeInTheDocument()
    expect(screen.getAllByText('6 Just for me')).toHaveLength(2)
    expect(screen.getByText('0 Just for me')).toBeInTheDocument()
    expect(screen.getByText('6 phones · 4 iPhone, 2 Android')).toBeInTheDocument()
    expect(screen.getByText('Anyone with a link, I approve new faces')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Let them in' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/people/requests/inv_M2XD',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'approve' }) }),
      ),
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('makes a member an admin from the ⋯ menu, and won’t let the last admin step down', async () => {
    render(<PeopleView data={data} server="adhx.home" />)
    fireEvent.click(screen.getByRole('button', { name: 'More for Pete' }))
    expect(screen.getByRole('menuitem', { name: 'Stop being an admin' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'More for Pete' }))
    fireEvent.click(screen.getByRole('button', { name: 'More for Ana' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Make admin' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/people/ana',
        expect.objectContaining({ body: JSON.stringify({ role: 'admin' }) }),
      ),
    )
  })
})

describe('PersonView', () => {
  const data: PersonBoard = {
    member: member({ role: 'admin' }),
    days: Array.from({ length: 30 }, (_, i) => ({ day: '2026-10-01', shared: i % 5, private: 0 })),
    habits: 'Mostly YouTube and Reddit · busiest on Sunday evenings',
    sendsWatched: 7,
    topReaction: '😭',
    publicChannels: 2,
    watched30d: 312,
    sharedSaves: [
      {
        platform: 'youtube',
        id: 'c',
        title: 'Charlie bit my finger',
        network: 'YouTube',
        thumbnail: null,
        openPath: '/s/youtube/c',
        savedAt: new Date().toISOString(),
        note: 'the original and still the best',
        savers: [face('ana', 'Ana')],
      },
    ],
    phones: [
      {
        id: 'k1',
        name: "Ana's iPhone",
        hint: '4F2A',
        platform: 'ios',
        createdAt: '2026-08-14T10:00:00.000Z',
        lastUsedAt: null,
      },
    ],
    broughtIn: [face('ben', 'Ben'), face('jo', 'Jo')],
    waitingInvites: ['R9TB'],
    lastAdmin: false,
  }

  it('shows their numbers, shared saves only, phones and who they brought in', async () => {
    render(<PersonView data={data} />)
    expect(screen.getByRole('heading', { name: 'Ana' })).toBeInTheDocument()
    expect(screen.getByText('6 Just for me')).toBeInTheDocument()
    expect(screen.getByText('mostly 😭')).toBeInTheDocument()
    expect(
      screen.getByText('Just for me saves are counted above, never listed.'),
    ).toBeInTheDocument()
    expect(screen.getByText('iPhone · ends 4F2A')).toBeInTheDocument()
    expect(screen.getByText('Ben and Jo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/people/ana/phones/k1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove admin' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/people/ana',
        expect.objectContaining({ body: JSON.stringify({ role: 'user' }) }),
      ),
    )
  })

  it('says why the last admin can’t step down', async () => {
    fetchMock.mockImplementation(() =>
      json({ error: 'Every ADHX needs an admin. Make someone else one first.' }, 409),
    )
    render(<PersonView data={{ ...data, lastAdmin: true }} />)
    expect(screen.getByRole('button', { name: 'Remove admin' })).toBeDisabled()
  })
})

describe('ProcessingView', () => {
  const data: ProcessingBoard = {
    paused: false,
    onTheirWay: 3,
    keeping: 2,
    converting: 1,
    learning: { posts: 14, kinds: ['speech', 'screen text'] },
    needYou: 1,
    needYouFirst: 'It’s private on Instagram.',
    failed: { total: 2, nextAt: null },
    disk: { free: 1.76 * 1024 ** 4, total: 1.8 * 1024 ** 4, usedByAdhx: 41.2 * 1024 ** 3 },
    queue: [
      {
        platform: 'instagram',
        id: 'x',
        title: 'Trying dark chocolate for the first time',
        thumbnail: null,
        openPath: '/reel/x',
        step: 'Keeping a copy',
        percent: 62,
        status: 'working',
        reason: null,
      },
    ],
    queuePrivate: 1,
    helper: {
      mode: 'remote',
      connected: true,
      lastSeenAt: new Date().toISOString(),
      name: 'Petes MacBook Pro',
      convertedWeek: 43,
      understoodWeek: 212,
    },
    settings: {
      keepMedia: true,
      understanding: 'Normal · Mac helper',
      backfill: false,
      minFreeGb: 20,
    },
    week: Array.from({ length: 7 }, (_, i) => ({
      day: `d${i}`,
      kept: i,
      converted: 1,
      understood: 2,
    })),
  }

  it('shows the queue, counts Just for me posts without listing them, and pauses new work', async () => {
    render(<ProcessingView data={data} server="adhx.home" />)
    expect(screen.getByText('Trying dark chocolate for the first time')).toBeInTheDocument()
    expect(screen.getByText('62%')).toBeInTheDocument()
    expect(
      screen.getByText('And 1 Just for me post on its way, counted, never listed.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Connected · Petes MacBook Pro')).toBeInTheDocument()
    expect(screen.getByText('it’s private on Instagram.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pause new work' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/processing',
        expect.objectContaining({ body: JSON.stringify({ action: 'pause' }) }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/processing',
        expect.objectContaining({ body: JSON.stringify({ action: 'retry_failed' }) }),
      ),
    )
  })
})

describe('PostLookup', () => {
  it('shows a private-only post as “Only kept Just for me” with counts', async () => {
    fetchMock.mockImplementation(() =>
      json({
        platform: 'twitter',
        bookmarkId: 'p1',
        previewPath: '/x/status/p1',
        hidden: false,
        listable: false,
        card: null,
        savers: [],
        text: null,
        thumbnailUrl: null,
        sharedSaves: 0,
        privateSaves: 1,
        notes: 0,
        kept: true,
        keepState: 'done',
      }),
    )
    render(<PostLookup />)
    const field = screen.getByRole('textbox', { name: 'Post link' })
    fireEvent.change(field, { target: { value: 'https://x.com/a/status/p1' } })
    fireEvent.submit(field.closest('form')!)
    expect(await screen.findByText('Only kept Just for me')).toBeInTheDocument()
    expect(screen.getByText('1 save · 1 Just for me · kept')).toBeInTheDocument()
  })
})

describe('InvitesView', () => {
  it('holds the sign-in links card where the account menu sends an admin', () => {
    const data: InvitesBoard = {
      mode: 'admin',
      admins: [face('pete', 'Pete')],
      requests: [],
      links: [],
      waiting: 0,
      used: 0,
      signIn: {
        delivery: 'admin',
        links: [
          {
            tokenHash: 'h1',
            face: null,
            email: 'friend@example.com',
            url: 'https://adhx.example.com/api/auth/email/callback?token=t',
            createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
            expiresAt: Date.now() + 58 * 60_000,
          },
        ],
      },
    }
    const { container } = render(<InvitesView data={data} />)
    const anchor = SIGN_IN_LINKS_HREF.split('#')[1]
    const card = container.querySelector(`#${anchor}`) as HTMLElement
    expect(card).not.toBeNull()
    expect(card).toHaveAccessibleName('Sign-in links')
    expect(within(card).getByText('friend@example.com asked to sign in')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
  })
})
