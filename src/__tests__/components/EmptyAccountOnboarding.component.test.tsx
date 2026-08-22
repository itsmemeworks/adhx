/**
 * @vitest-environment jsdom
 *
 * Zero-bookmark onboarding (the "email-only signup dead end" fix): a brand
 * new account with no bookmarks at all used to fall through to FeedGrid's
 * "All caught up! You have no unread bookmarks" empty state — a dead end for
 * email-only signups, who never see the X-OAuth `?firstLogin=true` sync
 * modal. FeedGrid now branches on `stats.total === 0` (the GLOBAL bookmark
 * count from /api/feed, unaffected by filters) to show this onboarding panel
 * instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { FeedGrid } from '@/components/feed/FeedGrid'
import { invalidateAuthMe } from '@/components/auth'
import { fixtures } from '../fixtures/tweets'
import { fxTwitterToFeedItem } from '../fixtures/tweets/helpers'

const X_CONNECTED_ME = {
  authenticated: true,
  user: { id: 'u1', username: 'weedauwl', displayName: 'Pete', avatarUrl: null },
  identities: { x: { username: 'weedauwl' }, email: null },
  xConnected: true,
}

const EMAIL_ONLY_ME = {
  authenticated: true,
  user: { id: 'u_abc123', username: 'newbie', displayName: 'Newbie', avatarUrl: null },
  identities: { x: null, email: { email: 'newbie@example.com' } },
  xConnected: false,
}

function mockAuthMe(response: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/auth/me') {
        return Promise.resolve({ ok: true, json: async () => response })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }),
  )
}

const baseProps = {
  loading: false,
  hasMore: false,
  lastSyncAt: null as string | null,
  sortField: 'processedAt' as const,
  onExpand: vi.fn(),
  onLoadMore: vi.fn(),
  onShowAll: vi.fn(),
}

describe('FeedGrid empty states', () => {
  beforeEach(() => {
    // useAuthMe caches module-level state across renders/tests.
    invalidateAuthMe()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    invalidateAuthMe()
  })

  it('shows the onboarding panel with a Connect-X CTA for an empty, email-only account', async () => {
    mockAuthMe(EMAIL_ONLY_ME)
    render(<FeedGrid {...baseProps} items={[]} hideArchived stats={{ total: 0, unread: 0 }} />)

    expect(await screen.findByText(/let.?s fill your collection/i)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /connect with/i })).toHaveAttribute(
        'href',
        '/api/auth/twitter',
      ),
    )
    // The "all caught up" copy must not also render.
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
  })

  it('shows a Sync CTA instead of Connect-X for an empty account with X already connected', async () => {
    mockAuthMe(X_CONNECTED_ME)
    render(<FeedGrid {...baseProps} items={[]} hideArchived stats={{ total: 0, unread: 0 }} />)

    expect(await screen.findByText(/let.?s fill your collection/i)).toBeInTheDocument()
    expect(await screen.findByText(/sync your x bookmarks/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /connect with/i })).not.toBeInTheDocument()
  })

  it('still shows a "Paste a link" action and a link to /trending in the onboarding panel', async () => {
    mockAuthMe(EMAIL_ONLY_ME)
    render(<FeedGrid {...baseProps} items={[]} hideArchived stats={{ total: 0, unread: 0 }} />)

    // Desktop (⌘V copy) and mobile (PasteLinkButton) variants both render in
    // jsdom regardless of their `hidden sm:*`/`sm:hidden` classes — jsdom
    // doesn't evaluate media-query-gated visibility, so both are present at
    // once. Assert there's at least one rather than picking a single match.
    expect((await screen.findAllByText('Paste a link')).length).toBeGreaterThan(0)
    const trendingLink = await screen.findByRole('link', { name: /explore what.?s trending/i })
    expect(trendingLink).toHaveAttribute('href', '/trending')
  })

  it('shows "All caught up" (not onboarding) when the account has bookmarks but none are unread', async () => {
    mockAuthMe(X_CONNECTED_ME)
    render(<FeedGrid {...baseProps} items={[]} hideArchived stats={{ total: 12, unread: 0 }} />)

    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument()
    expect(screen.queryByText(/let.?s fill your collection/i)).not.toBeInTheDocument()
  })

  it('renders items normally when the account has content (sanity check)', () => {
    mockAuthMe(X_CONNECTED_ME)
    const items = [fxTwitterToFeedItem(fixtures['plain-text'])]
    render(
      <FeedGrid
        {...baseProps}
        items={items}
        hideArchived={false}
        stats={{ total: 1, unread: 1 }}
      />,
    )

    expect(screen.queryByText(/let.?s fill your collection/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument()
  })
})
