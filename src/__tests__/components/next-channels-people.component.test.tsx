// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { FeedItem } from '@/components/feed/types'
import type { Saver } from '@/lib/people/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/channels',
}))
vi.mock('@/components/auth', () => ({
  useAuthMe: () => ({ me: { authenticated: true }, loading: false, refresh: vi.fn() }),
}))

import { FromEveryoneRow, YourPeopleRow, whoSavedInto } from '@/components/next/channels/PeopleRows'
import { FriendChannelPage } from '@/components/next/channels/FriendChannelPage'
import { SaverFaces, SaversButton } from '@/components/next/SaverFaces'
import { sourceFromParams, queueUrl, backHref } from '@/components/next/theater/queue'

const saver = (username: string, extra: Partial<Saver> = {}): Saver => ({
  username,
  name: username[0].toUpperCase() + username.slice(1),
  avatarUrl: null,
  savedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  isYou: false,
  ...extra,
})

function post(id: string): { post: FeedItem } {
  return {
    post: {
      id,
      platform: 'twitter',
      author: 'someone',
      authorName: 'Someone',
      text: `post ${id}`,
      tweetUrl: `https://x.com/someone/status/${id}`,
      processedAt: '2026-10-16T09:00:00.000Z',
      isArchived: false,
      media: null,
      links: null,
      tags: [],
    },
  }
}

const assign = vi.fn()
beforeEach(() => {
  assign.mockReset()
  vi.stubGlobal('location', { ...window.location, assign })
})
afterEach(() => vi.unstubAllGlobals())

describe('whoSavedInto', () => {
  it('names two people (you last), else counts', () => {
    expect(whoSavedInto(2, [saver('mum'), saver('me', { isYou: true })])).toBe('Mum and you')
    expect(whoSavedInto(2, [saver('jo'), saver('ben')])).toBe('Jo and Ben')
    expect(whoSavedInto(1, [saver('ana')])).toBe('Ana')
    expect(whoSavedInto(3, [saver('ana'), saver('ben'), saver('jo')])).toBe('3 of you')
  })
})

describe('From everyone row', () => {
  it('shows each channel with its saves, who saved into it and what’s new', () => {
    render(
      <FromEveryoneRow
        channels={[
          {
            slug: 'cats',
            name: 'Cats',
            size: 38,
            members: 3,
            savers: [saver('ana'), saver('ben'), saver('jo')],
            newCount: 3,
            covers: [post('1'), post('2')],
          },
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'From everyone' })).toBeInTheDocument()
    expect(screen.getByText('Rabbit holes, dug by your friends')).toBeInTheDocument()
    const card = screen.getByRole('link', { name: /Play Cats, 38 saves, 3 of you, 3 new/ })
    expect(card).toHaveAttribute('href', '/play?group=cats')
    expect(within(card).getByText('38 saves · 3 of you')).toBeInTheDocument()
    expect(within(card).getByText('3 new')).toBeInTheDocument()
  })

  it('says when there is nothing yet, and shimmers while loading', () => {
    const { rerender, container } = render(<FromEveryoneRow channels={null} />)
    expect(container.querySelector('.nx-shimmer')).not.toBeNull()
    rerender(<FromEveryoneRow channels={[]} />)
    expect(screen.getByText(/once your lot has saved/)).toBeInTheDocument()
  })
})

describe('Your people row', () => {
  const ben = {
    username: 'ben',
    name: 'Ben',
    avatarUrl: null,
    size: 212,
    newCount: 4,
    covers: [post('1')],
  }

  it('has a big card per friend and an Invite someone card', () => {
    render(<YourPeopleRow friends={[ben]} canInvite />)
    const card = screen.getByRole('link', { name: 'Ben’s saves, 212 saves, 4 new' })
    expect(card).toHaveAttribute('href', '/channels/friend/ben')
    expect(within(card).getByText('4 new')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Invite someone/ })).toHaveAttribute(
      'href',
      '/settings#invite',
    )
  })

  it('leaves out the invite card when you can’t invite', () => {
    render(<YourPeopleRow friends={[]} canInvite={false} />)
    expect(screen.queryByRole('link', { name: /Invite someone/ })).toBeNull()
    expect(screen.getByText(/Just you so far/)).toBeInTheDocument()
  })
})

describe('saver faces open friends’ channels', () => {
  it('a face is a link to the friend’s channel, even inside a tile link', () => {
    const tileClick = vi.fn()
    render(
      <a href="/play?x=1" onClick={tileClick}>
        <SaverFaces savers={[saver('ana'), saver('me', { isYou: true })]} linked />
      </a>,
    )
    fireEvent.click(screen.getByRole('link', { name: 'Ana’s saves' }))
    expect(assign).toHaveBeenCalledWith('/channels/friend/ana')
    expect(tileClick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('link', { name: 'Your saves' }))
    expect(assign).toHaveBeenCalledWith('/play?recent=1')
  })

  it('the theater’s faces open who saved it, each linking to their channel', () => {
    render(<SaversButton savers={[saver('ana'), saver('ben'), saver('me', { isYou: true })]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /You and 2 others/ }))
    const dialog = screen.getByRole('dialog', { name: 'Who saved it' })
    expect(within(dialog).getByRole('link', { name: 'See Ana’s saves' })).toHaveAttribute(
      'href',
      '/channels/friend/ana',
    )
    expect(within(dialog).getByRole('link', { name: 'See your saves' })).toHaveAttribute(
      'href',
      '/play?recent=1',
    )
    expect(within(dialog).getAllByText('3h ago')).toHaveLength(3)
    expect(within(dialog).getByText('Saved by 3 of your people')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('friend channel page', () => {
  it('shows the friend, what’s new, both play buttons and who can see it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ items: [], friend: { username: 'ana', size: 96, newCount: 4 } }),
          ),
      ),
    )
    render(<FriendChannelPage username="ana" name="Ana" avatarUrl={null} size={90} />)
    expect(screen.getByRole('heading', { name: 'Ana’s saves' })).toBeInTheDocument()
    expect(await screen.findByText('4 you haven’t seen')).toBeInTheDocument()
    expect(screen.getByText('96 saves')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Play all' })).toHaveAttribute(
      'href',
      '/play?friend=ana',
    )
    expect(screen.getByRole('link', { name: 'Play the 4 new ones' })).toHaveAttribute(
      'href',
      '/play?friend=ana&new=1',
    )
    expect(screen.getByText('Only people on this server can see this page.')).toBeInTheDocument()
  })
})

describe('theater sources', () => {
  it('plays group and friend channels, keeping search groups working', () => {
    const group = sourceFromParams(new URLSearchParams('group=cats'))
    expect(group).toMatchObject({ groupChannel: 'cats', group: null, recent: false })
    expect(queueUrl(group, () => '/s')).toBe('/api/channels/group/cats')
    expect(backHref(group)).toBe('/channels')

    const signal = sourceFromParams(new URLSearchParams('q=frog&group=video'))
    expect(signal).toMatchObject({ group: 'video', groupChannel: null })

    const friend = sourceFromParams(new URLSearchParams('friend=ana&new=1'))
    expect(friend.friend).toEqual({ username: 'ana', onlyNew: true })
    expect(queueUrl(friend, () => '/s')).toBe('/api/channels/friend/ana?new=1')
    expect(backHref(friend)).toBe('/channels/friend/ana')
    expect(friend.search.scope).toBe('everyone')
  })
})
