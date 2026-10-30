// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { FeedItem } from '@/components/feed/types'
import type { Saver } from '@/lib/people/types'

const auth = vi.hoisted(() => ({ authenticated: true }))
vi.mock('@/components/auth', () => ({
  useAuthMe: () => ({
    me: auth.authenticated ? { authenticated: true, user: { username: 'ana' } } : null,
    loading: false,
    refresh: vi.fn(),
  }),
}))

import { SaverFaces } from '@/components/next/SaverFaces'
import { saversLine } from '@/components/next/savers'
import { ResultTile } from '@/components/next/search/ResultTile'
import { PrivateRow } from '@/components/next/theater/TheaterSheets'
import {
  SHARED_SAVES_NOTICE_KEY,
  SharedSavesNotice,
} from '@/components/next/moments/SharedSavesNotice'

const saver = (username: string, extra: Partial<Saver> = {}): Saver => ({
  username,
  name: username[0].toUpperCase() + username.slice(1),
  avatarUrl: null,
  savedAt: '2026-10-18T10:00:00.000Z',
  isYou: false,
  ...extra,
})

function post(partial: Partial<FeedItem> = {}): FeedItem {
  return {
    id: '1001',
    platform: 'twitter',
    author: 'someone',
    authorName: 'Someone',
    text: 'a frog in a hat',
    tweetUrl: 'https://x.com/someone/status/1001',
    processedAt: '2026-10-16T09:00:00.000Z',
    isArchived: false,
    media: null,
    links: null,
    tags: [],
    ...partial,
  }
}

describe('saversLine', () => {
  it('names one or two people, then counts the rest, with you first', () => {
    expect(saversLine([])).toBe('')
    expect(saversLine([saver('ana')])).toBe('Ana saved this')
    expect(saversLine([saver('ana'), saver('ben')])).toBe('Ana and Ben saved this')
    expect(saversLine([saver('ana'), saver('me', { isYou: true })])).toBe('You and Ana saved this')
    expect(saversLine([saver('ana'), saver('ben'), saver('me', { isYou: true })])).toBe(
      'You and 2 others',
    )
    expect(saversLine([saver('ana'), saver('ben'), saver('cal'), saver('dee')])).toBe(
      'Ana and 3 others',
    )
    expect(saversLine([saver('ana', { name: null })])).toBe('ana saved this')
  })
})

describe('SaverFaces', () => {
  it('shows at most three faces and the line in its own span', () => {
    const { container } = render(
      <SaverFaces savers={[saver('ana'), saver('ben'), saver('cal'), saver('dee')]} />,
    )
    expect(container.querySelectorAll('[data-shape="gob"]')).toHaveLength(3)
    expect(screen.getByText('Ana and 3 others').tagName).toBe('SPAN')
  })

  it('draws each face in Gob’s shape with the ring on the shape, not a circle', () => {
    const { container } = render(<SaverFaces savers={[saver('ana'), saver('ben')]} tone="cream" />)
    const frames = container.querySelectorAll('[data-shape="gob"]')
    expect(frames).toHaveLength(2)
    for (const frame of frames) {
      expect(frame.className).toContain('rounded-[38%]')
      expect(frame.className).toContain('border-2')
      expect(frame.className).toContain('border-nx-cream')
    }
    expect(container.querySelector('.rounded-full')).toBeNull()
  })

  it('renders nothing without savers', () => {
    const { container } = render(<SaverFaces savers={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ResultTile', () => {
  it('shows faces instead of "Everyone" when savers are known', () => {
    render(
      <ResultTile
        item={{
          post: post({ savers: [saver('ben'), saver('ana')] }),
          saved: false,
          matched: ['words'],
        }}
      />,
    )
    expect(screen.queryByText('Everyone')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ben and Ana saved this/ })).toBeInTheDocument()
  })

  it('keeps "Words only" clear of the corner chip and the faces', () => {
    const photo = post({
      media: [
        {
          id: 'p',
          mediaType: 'photo',
          url: 'https://x/p.jpg',
          thumbnailUrl: 'https://x/p.jpg',
          shareUrl: 'https://x/p.jpg',
          width: 800,
          height: 600,
        },
      ],
    })
    const { unmount } = render(
      <ResultTile
        item={{
          post: { ...photo, savers: [saver('ben'), saver('ana', { isYou: true })] },
          saved: true,
          matched: ['words'],
          learning: true,
        }}
      />,
    )
    // Over media: under the corner chip.
    expect(screen.getByText('Words only')).toHaveClass('top-10')
    unmount()
    // On a words-only card: in line with the faces, not over the handle.
    render(<ResultTile item={{ post: post(), saved: false, matched: ['words'], learning: true }} />)
    expect(screen.getByText('Words only')).not.toHaveClass('absolute')
  })

  it('keeps "Everyone" when no names are known, and locks a private post', () => {
    const { unmount } = render(
      <ResultTile item={{ post: post(), saved: false, matched: ['words'] }} />,
    )
    expect(screen.getByText('Everyone')).toBeInTheDocument()
    unmount()
    render(
      <ResultTile
        item={{
          post: post({ isPrivate: true, savers: [saver('me', { isYou: true })] }),
          saved: true,
          matched: ['words'],
        }}
      />,
    )
    expect(screen.getByRole('img', { name: 'Just for me' })).toBeInTheDocument()
  })
})

describe('PrivateRow', () => {
  it('is a switch that says what it does', () => {
    const onChange = vi.fn()
    render(<PrivateRow on={false} onChange={onChange} />)
    const row = screen.getByRole('switch', { name: /Just for me/ })
    expect(row).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(row)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('SharedSavesNotice', () => {
  beforeEach(() => {
    window.localStorage.clear()
    auth.authenticated = true
  })

  it('tells members once, and remembers the dismissal', () => {
    const { unmount } = render(<SharedSavesNotice />)
    expect(screen.getByText(/Your saves are shared with your people\./)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(SHARED_SAVES_NOTICE_KEY)).toBe('1')
    unmount()
    render(<SharedSavesNotice />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('is not shown signed out', () => {
    auth.authenticated = false
    render(<SharedSavesNotice />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('still works when storage is blocked', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<SharedSavesNotice />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    get.mockRestore()
    set.mockRestore()
  })
})
