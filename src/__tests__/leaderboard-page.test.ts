import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestDb, type TestDbInstance } from './api/setup'
import { collectionEvents, tagShares, users, type NewCollectionEvent } from '@/lib/db/schema'
import { getCurrentUserId } from '@/lib/auth/session'

/**
 * /leaderboard page tests — `src/app/leaderboard/page.tsx` and
 * `src/app/leaderboard/[window]/page.tsx`, plus the old-URL redirect stubs
 * at `src/app/collections/page.tsx` and `src/app/collections/[window]/page.tsx`
 * (this file used to be named collections-page.test.ts, before the rename).
 *
 * Unlike `tag-collection-route.test.ts` (which mocks the data layer
 * entirely), this seeds a real in-memory `collection_events`/`tag_shares`/
 * `users` DB via `createTestDb()` — mirroring `discovery-rank.test.ts` and
 * `collections-trending.test.ts` — and renders the ACTUAL page components
 * (`CollectionsBoard`/`CollectionsStaticList` are plain server components
 * with no hooks, so `renderToStaticMarkup` works without mocking `next/link`
 * — same as `tag-collection-route.test.ts` does for its own Link usage).
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

// These pages now check auth (getCurrentUserId) to decide whether
// CollectionsBoard renders its own internal header (signed-out) or defers to
// the global app Header (signed-in). Default to signed-out here — same as a
// real anonymous visitor to this public, crawlable page — since these tests
// exercise the SEO/ranking rendering, not the auth-chrome behavior (that's
// covered by CollectionsBoard's own component test).
vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND')
  }),
  permanentRedirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
  // The signed-out CollectionsBoard header now mounts `LeaderboardMenu` (round
  // 8), which wraps `TheaterAvatarMenu` — that component calls `usePathname()`
  // unconditionally, before its `useAuthMe()` loading check, so it must be
  // mocked here even though this file never asserts on it.
  usePathname: vi.fn(() => '/leaderboard'),
}))

function iso(msAgo = 0): string {
  return new Date(Date.now() - msAgo).toISOString()
}

function seedUser(id: string, username: string) {
  testInstance.db.insert(users).values({ id, username }).run()
}

function seedShare(userId: string, tag: string, isPublic = true) {
  testInstance.db
    .insert(tagShares)
    .values({ userId, tag, shareCode: `${userId}-${tag}`, isPublic })
    .run()
}

function seedEvent(
  overrides: Partial<NewCollectionEvent> & { ownerUserId: string; tag: string; createdAt: string },
) {
  const row: NewCollectionEvent = { action: 'view', hidden: 0, ...overrides }
  testInstance.db.insert(collectionEvents).values(row).run()
}

/** Extract + parse the page's `<script type="application/ld+json">` payload. */
function extractJsonLd(html: string): Record<string, unknown> {
  const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)
  expect(match).not.toBeNull()
  return JSON.parse(match![1].replace(/\\u003c/g, '<')) as Record<string, unknown>
}

describe('/leaderboard pages', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  describe('/leaderboard (week, the default window)', () => {
    it('renders the podium + sr-only list in correct rank order', async () => {
      seedUser('u1', 'alice')
      seedUser('u2', 'bob')
      seedShare('u1', 'top-tag')
      seedShare('u2', 'lower-tag')
      for (let i = 0; i < 5; i++) {
        seedEvent({ ownerUserId: 'u1', tag: 'top-tag', action: 'view', createdAt: iso() })
      }
      seedEvent({ ownerUserId: 'u2', tag: 'lower-tag', action: 'view', createdAt: iso() })

      const LeaderboardPage = (await import('@/app/leaderboard/page')).default
      const html = renderToStaticMarkup(await LeaderboardPage())

      const topIdx = html.indexOf('top-tag')
      const lowerIdx = html.indexOf('lower-tag')
      expect(topIdx).toBeGreaterThan(-1)
      expect(lowerIdx).toBeGreaterThan(-1)
      expect(topIdx).toBeLessThan(lowerIdx)
      expect(html).toContain('href="/t/alice/top-tag"')
      expect(html).toContain('href="/t/bob/lower-tag"')
    })

    it('includes a parseable CollectionPage/ItemList JSON-LD block with the right item count', async () => {
      seedUser('u1', 'alice')
      seedShare('u1', 'a')
      seedShare('u1', 'b')
      seedEvent({ ownerUserId: 'u1', tag: 'a', createdAt: iso() })
      seedEvent({ ownerUserId: 'u1', tag: 'b', createdAt: iso() })

      const LeaderboardPage = (await import('@/app/leaderboard/page')).default
      const html = renderToStaticMarkup(await LeaderboardPage())
      const ld = extractJsonLd(html)

      expect(ld['@type']).toBe('CollectionPage')
      const mainEntity = ld.mainEntity as { '@type': string; itemListElement: unknown[] }
      expect(mainEntity['@type']).toBe('ItemList')
      expect(mainEntity.itemListElement).toHaveLength(2)
    })

    it('renders an empty state when no collections are charting', async () => {
      const LeaderboardPage = (await import('@/app/leaderboard/page')).default
      const html = renderToStaticMarkup(await LeaderboardPage())

      expect(html).toContain('No public playlists charting yet')
      expect(html).toContain('People tag posts into playlists')
      expect(html).toContain('A playlist is a public tag')
    })

    it('never renders a private tag even with events', async () => {
      seedUser('u1', 'alice')
      seedShare('u1', 'secret-tag', false)
      seedEvent({ ownerUserId: 'u1', tag: 'secret-tag', createdAt: iso() })

      const LeaderboardPage = (await import('@/app/leaderboard/page')).default
      const html = renderToStaticMarkup(await LeaderboardPage())

      expect(html).not.toContain('secret-tag')
    })
  })

  describe('/leaderboard/[window]', () => {
    it('404s on an unknown window slug', async () => {
      const LeaderboardWindowPage = (await import('@/app/leaderboard/[window]/page')).default
      await expect(
        LeaderboardWindowPage({ params: Promise.resolve({ window: 'bogus' }) }),
      ).rejects.toThrow('NOT_FOUND')
    })

    it("permanent-redirects '/leaderboard/week' to the canonical '/leaderboard'", async () => {
      const LeaderboardWindowPage = (await import('@/app/leaderboard/[window]/page')).default
      await expect(
        LeaderboardWindowPage({ params: Promise.resolve({ window: 'week' }) }),
      ).rejects.toThrow('REDIRECT:/leaderboard')
    })

    it('renders the today window with only its own window entries', async () => {
      seedUser('u1', 'alice')
      seedUser('u2', 'bob')
      seedShare('u1', 'today-tag')
      seedShare('u2', 'ancient-tag')
      seedEvent({ ownerUserId: 'u1', tag: 'today-tag', createdAt: iso() })
      // Outside the 24h "today" window, but within "week"/"all".
      seedEvent({ ownerUserId: 'u2', tag: 'ancient-tag', createdAt: iso(3 * 24 * 60 * 60 * 1000) })

      const LeaderboardWindowPage = (await import('@/app/leaderboard/[window]/page')).default
      const html = renderToStaticMarkup(
        await LeaderboardWindowPage({ params: Promise.resolve({ window: 'today' }) }),
      )

      expect(html).toContain('today-tag')
      expect(html).not.toContain('ancient-tag')
    })

    it('renders correct rank order + JSON-LD for the all-time window', async () => {
      seedUser('u1', 'alice')
      seedUser('u2', 'bob')
      seedShare('u1', 'many-clones')
      seedShare('u2', 'few-views')
      seedEvent({ ownerUserId: 'u1', tag: 'many-clones', action: 'clone', createdAt: iso() })
      seedEvent({ ownerUserId: 'u2', tag: 'few-views', action: 'view', createdAt: iso() })

      const LeaderboardWindowPage = (await import('@/app/leaderboard/[window]/page')).default
      const html = renderToStaticMarkup(
        await LeaderboardWindowPage({ params: Promise.resolve({ window: 'all-time' }) }),
      )

      // 1 clone (score 5) outranks 1 view (score 1).
      const cloneIdx = html.indexOf('many-clones')
      const viewIdx = html.indexOf('few-views')
      expect(cloneIdx).toBeGreaterThan(-1)
      expect(viewIdx).toBeGreaterThan(-1)
      expect(cloneIdx).toBeLessThan(viewIdx)

      const ld = extractJsonLd(html)
      const mainEntity = ld.mainEntity as { itemListElement: unknown[] }
      expect(mainEntity.itemListElement).toHaveLength(2)
    })
  })

  describe('CollectionsBoard header chrome', () => {
    afterEach(() => {
      // Restore the file-wide signed-out default so later test files that
      // import this module in the same run aren't affected by these two
      // tests' explicit mockResolvedValue calls.
      vi.mocked(getCurrentUserId).mockResolvedValue(null)
    })

    it('signed-out: keeps its own dark header, with no "Trending posts" link', async () => {
      vi.mocked(getCurrentUserId).mockResolvedValue(null)
      const LeaderboardPage = (await import('@/app/leaderboard/page')).default
      const html = renderToStaticMarkup(await LeaderboardPage())

      expect(html).toContain('ADHX home')
      expect(html).not.toContain('Trending posts')
    })

    it('signed-in: renders no internal header at all (the global app Header is the chrome)', async () => {
      vi.mocked(getCurrentUserId).mockResolvedValue('u1')
      const LeaderboardPage = (await import('@/app/leaderboard/page')).default
      const html = renderToStaticMarkup(await LeaderboardPage())

      expect(html).not.toContain('ADHX home')
      expect(html).not.toContain('Trending posts')
    })
  })

  describe('/collections and /collections/[window] — old-URL redirect stubs', () => {
    it("'/collections' permanent-redirects to '/leaderboard'", async () => {
      const CollectionsRedirect = (await import('@/app/collections/page')).default
      expect(() => CollectionsRedirect()).toThrow('REDIRECT:/leaderboard')
    })

    it("'/collections/today' permanent-redirects to '/leaderboard/today'", async () => {
      const CollectionsWindowRedirect = (await import('@/app/collections/[window]/page')).default
      await expect(
        CollectionsWindowRedirect({ params: Promise.resolve({ window: 'today' }) }),
      ).rejects.toThrow('REDIRECT:/leaderboard/today')
    })

    it("'/collections/week' permanent-redirects to the bare '/leaderboard' (not '/leaderboard/week')", async () => {
      const CollectionsWindowRedirect = (await import('@/app/collections/[window]/page')).default
      await expect(
        CollectionsWindowRedirect({ params: Promise.resolve({ window: 'week' }) }),
      ).rejects.toThrow('REDIRECT:/leaderboard')
    })

    it("'/collections/all-time' permanent-redirects to '/leaderboard/all-time'", async () => {
      const CollectionsWindowRedirect = (await import('@/app/collections/[window]/page')).default
      await expect(
        CollectionsWindowRedirect({ params: Promise.resolve({ window: 'all-time' }) }),
      ).rejects.toThrow('REDIRECT:/leaderboard/all-time')
    })

    it('an unknown slug still 404s instead of redirecting', async () => {
      const CollectionsWindowRedirect = (await import('@/app/collections/[window]/page')).default
      await expect(
        CollectionsWindowRedirect({ params: Promise.resolve({ window: 'bogus' }) }),
      ).rejects.toThrow('NOT_FOUND')
    })
  })
})
