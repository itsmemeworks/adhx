/**
 * @vitest-environment jsdom
 *
 * GraphDetail component tests.
 *
 * Covers both branches of the detail panel:
 * - Item branch (a selected save): title input, post card author, mark-read,
 *   same-author relation navigation, close.
 * - Hub branch (a selected theme): theme-name input, member-row navigation.
 *
 * Uses a fake GraphMetaStore (vi.fn()s + simple in-object state) so we assert
 * the component calls the store with the right arguments and renders the
 * defaults the store hands back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GraphDetail } from '@/components/graph/GraphDetail'
import type {
  GraphData,
  GraphSave,
  GraphTheme,
  GraphCardData,
  GraphRelation,
} from '@/components/graph/types'
import type { GraphMetaStore } from '@/components/graph/useGraphMeta'

function makeCard(over: Partial<GraphCardData>): GraphCardData {
  return {
    id: 'x',
    author: 'x',
    openUrl: 'https://x.com/x',
    type: 'text',
    platform: 'twitter',
    authorName: null,
    handle: null,
    avatarUrl: null,
    body: null,
    heroUrl: null,
    isVideo: false,
    durationMs: null,
    articleTitle: null,
    articleDescription: null,
    quote: null,
    ...over,
  }
}

function makeSave(over: Partial<GraphSave> & { key: string; id: string }): GraphSave {
  return {
    platform: 'twitter',
    type: 'text',
    authorName: null,
    handle: null,
    label: '',
    thumbnailUrl: null,
    openUrl: 'https://x.com/x',
    createdAt: null,
    degree: 0,
    card: makeCard({}),
    ...over,
  }
}

// t1: an article by @alice, with a fleshed-out card.
const t1: GraphSave = makeSave({
  key: 'twitter:t1',
  id: 't1',
  platform: 'twitter',
  type: 'article',
  authorName: 'Alice Anderson',
  handle: '@alice',
  label: 'Alice on knowledge graphs',
  thumbnailUrl: 'https://img.example/t1.jpg',
  openUrl: 'https://x.com/alice/status/t1',
  createdAt: '2026-01-01T00:00:00Z',
  degree: 2,
  card: makeCard({
    type: 'article',
    platform: 'twitter',
    authorName: 'Alice Anderson',
    handle: '@alice',
    body: 'A long read about how to organise saved posts.',
    heroUrl: 'https://img.example/t1-hero.jpg',
    articleTitle: 'The shape of a second brain',
    articleDescription: 'Why graphs beat folders.',
  }),
})

// t2: a text post by the same author @alice.
const t2: GraphSave = makeSave({
  key: 'twitter:t2',
  id: 't2',
  platform: 'twitter',
  type: 'text',
  authorName: 'Alice Anderson',
  handle: '@alice',
  label: 'Alice quick take',
  openUrl: 'https://x.com/alice/status/t2',
  createdAt: '2026-01-02T00:00:00Z',
  degree: 1,
  card: makeCard({
    type: 'text',
    authorName: 'Alice Anderson',
    handle: '@alice',
    body: 'Folders rot, graphs grow.',
  }),
})

const aiTheme: GraphTheme = {
  id: 'tag:ai',
  label: '#ai',
  kind: 'tag',
  degree: 1,
}

const relations: GraphRelation[] = [
  // topic: t1 belongs to the #ai theme
  { from: 'twitter:t1', to: 'tag:ai', kind: 'topic' },
  // author: t1 <-> t2 share handle @alice
  { from: 'twitter:t1', to: 'twitter:t2', kind: 'author' },
]

const data: GraphData = {
  saves: [t1, t2],
  themes: [aiTheme],
  relations,
  annotations: { items: {}, themes: {}, links: [] },
  stats: { totalSaves: 2, shown: 2, themeCount: 1, connectionCount: 2, capped: false },
}

/** Fake GraphMetaStore: vi.fn()s + default-empty getters. */
function makeMeta(): GraphMetaStore {
  return {
    itemMeta: vi.fn(() => ({})),
    hubMeta: vi.fn(() => ({})),
    links: [],
    userRelations: [],
    hasLink: vi.fn(() => false),
    setRead: vi.fn(),
    addTag: vi.fn(),
    removeTag: vi.fn(),
    setTitle: vi.fn(),
    setNote: vi.fn(),
    setHub: vi.fn(),
    addLink: vi.fn(),
    removeLink: vi.fn(),
  } as unknown as GraphMetaStore
}

describe('GraphDetail — item branch', () => {
  let meta: GraphMetaStore
  let onClose: ReturnType<typeof vi.fn>
  let onNavigate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    meta = makeMeta()
    onClose = vi.fn()
    onNavigate = vi.fn()
    render(
      <GraphDetail
        selectedKey="twitter:t1"
        data={data}
        meta={meta}
        onClose={onClose as () => void}
        onNavigate={onNavigate as (key: string) => void}
      />,
    )
  })

  it('renders the title input seeded from save.label (meta default {})', () => {
    // With itemMeta returning {}, title falls back to save.label.
    const input = screen.getByDisplayValue('Alice on knowledge graphs')
    expect(input).toBeTruthy()
    // title is an auto-growing <textarea> so long titles wrap instead of clipping
    expect((input as HTMLTextAreaElement).tagName).toBe('TEXTAREA')
  })

  it('renders the post card author name and handle', () => {
    // GraphPostCard header shows the author name and @handle.
    expect(screen.getAllByText('Alice Anderson').length).toBeGreaterThan(0)
    // @alice appears in the card header (and the "More from" section label) —
    // confirm at least the card's handle rendered.
    expect(screen.getAllByText('@alice').length).toBeGreaterThan(0)
  })

  it('clicking "Mark read" calls meta.setRead with (key, true)', () => {
    const btn = screen.getByRole('button', { name: /mark read/i })
    fireEvent.click(btn)
    expect(meta.setRead).toHaveBeenCalledTimes(1)
    expect(meta.setRead).toHaveBeenCalledWith('twitter:t1', true)
  })

  it('shows "More from @alice" section with t2 and navigates on click', () => {
    // Section label is rendered.
    expect(screen.getByText(/more from @alice/i)).toBeTruthy()
    // The relation row label uses save.label (meta default {}).
    const row = screen.getByRole('button', { name: /alice quick take/i })
    fireEvent.click(row)
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledWith('twitter:t2')
  })

  it('clicking the close button calls onClose', () => {
    const close = screen.getByRole('button', { name: /close/i })
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('typing in the title input calls meta.setTitle', () => {
    const input = screen.getByDisplayValue('Alice on knowledge graphs')
    fireEvent.change(input, { target: { value: 'Renamed' } })
    expect(meta.setTitle).toHaveBeenCalledWith('twitter:t1', 'Renamed')
  })
})

describe('GraphDetail — hub branch', () => {
  let meta: GraphMetaStore
  let onClose: ReturnType<typeof vi.fn>
  let onNavigate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    meta = makeMeta()
    onClose = vi.fn()
    onNavigate = vi.fn()
    render(
      <GraphDetail
        selectedKey="tag:ai"
        data={data}
        meta={meta}
        onClose={onClose as () => void}
        onNavigate={onNavigate as (key: string) => void}
      />,
    )
  })

  it('renders the theme-name input seeded from theme.label (hubMeta default {})', () => {
    const input = screen.getByDisplayValue('#ai')
    expect(input).toBeTruthy()
    expect((input as HTMLInputElement).tagName).toBe('INPUT')
  })

  it('renders the "Saves in this theme" member row for t1', () => {
    expect(screen.getByText(/saves in this theme/i)).toBeTruthy()
    // t1 is the topic member; its row label uses save.label.
    expect(screen.getByRole('button', { name: /alice on knowledge graphs/i })).toBeTruthy()
  })

  it('clicking the member row navigates to that save', () => {
    const row = screen.getByRole('button', { name: /alice on knowledge graphs/i })
    fireEvent.click(row)
    expect(onNavigate).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenCalledWith('twitter:t1')
  })

  it('editing the theme name calls meta.setHub with a name patch', () => {
    const input = screen.getByDisplayValue('#ai')
    fireEvent.change(input, { target: { value: 'AI stuff' } })
    expect(meta.setHub).toHaveBeenCalledWith('tag:ai', { name: 'AI stuff' })
  })
})
