// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextSearch } from '@/components/feed/ContextSearch'
import type { FeedItem } from '@/components/feed/types'
import type { SearchRequest, SearchResponse } from '@/lib/search/search.worker'

const state = vi.hoisted(() => ({ accountId: 'a', loading: false, load: vi.fn() }))
vi.mock('@/components/auth/useAuthMe', () => ({
  useAuthMe: () => ({
    me: { authenticated: true, user: { id: state.accountId } },
    loading: state.loading,
  }),
}))
vi.mock('@/lib/search/corpus', () => ({ loadSearchCorpus: state.load }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/feed/FeedGrid', () => ({
  FeedGrid: ({ items }: { items: FeedItem[] }) => (
    <div>
      {items.map((item) => (
        <p key={`${item.platform}:${item.id}`}>{item.text}</p>
      ))}
    </div>
  ),
}))

class MockWorker {
  static instances: MockWorker[] = []
  onmessage: ((event: MessageEvent<SearchResponse>) => void) | null = null
  onerror: (() => void) | null = null
  messages: SearchRequest[] = []
  terminated = false
  constructor() {
    MockWorker.instances.push(this)
  }
  postMessage(message: SearchRequest) {
    this.messages.push(message)
  }
  terminate() {
    this.terminated = true
  }
  emit(message: SearchResponse) {
    this.onmessage?.({ data: message } as MessageEvent<SearchResponse>)
  }
}

const item = (id: string, overrides: Partial<FeedItem> = {}): FeedItem => ({
  id,
  platform: 'twitter',
  author: 'author',
  text: `Saved ${id}`,
  tweetUrl: '',
  processedAt: '2026-10-16',
  isArchived: false,
  media: null,
  links: null,
  tags: [],
  ...overrides,
})
const props = {
  accountId: 'a',
  enabled: true,
  onEnabledChange: vi.fn(),
  query: 'first memory',
  filter: 'all' as const,
  platform: 'all' as const,
  hideArchived: true,
  tags: [],
  tagSelectTag: null,
  view: 'grid' as const,
  sort: 'added' as const,
  sortDirection: 'desc' as const,
  stats: { total: 3, active: 2 },
  onShowAll: vi.fn(),
}

beforeEach(() => {
  state.accountId = 'a'
  state.loading = false
  MockWorker.instances = []
  vi.stubGlobal('Worker', MockWorker)
  state.load.mockResolvedValue([item('1'), item('2'), item('archived', { isArchived: true })])
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('context search lifecycle', () => {
  it('does not load the corpus or model until enabled', () => {
    render(<ContextSearch {...props} enabled={false} />)
    expect(state.load).not.toHaveBeenCalled()
    expect(MockWorker.instances).toHaveLength(0)
  })

  it('filters archived posts before inference and discards a late previous query', async () => {
    const view = render(<ContextSearch {...props} />)
    await waitFor(() => expect(MockWorker.instances[0]?.messages.length).toBeGreaterThan(0))
    const worker = MockWorker.instances[0]
    const first = worker.messages.at(-1)!
    expect(first.allowedKeys).not.toContain('twitter:archived')
    view.rerender(<ContextSearch {...props} query="new memory" />)
    await waitFor(() => expect(worker.messages.at(-1)?.query).toBe('new memory'))
    const second = worker.messages.at(-1)!
    act(() =>
      worker.emit({
        id: first.id,
        type: 'results',
        matches: [{ key: 'twitter:1', score: 1, source: 'Post', text: 'Old passage' }],
      }),
    )
    expect(screen.queryByText('Saved 1')).not.toBeInTheDocument()
    act(() =>
      worker.emit({
        id: second.id,
        type: 'results',
        matches: [{ key: 'twitter:2', score: 1, source: 'Post', text: 'New passage' }],
      }),
    )
    expect(await screen.findByText('Saved 2')).toBeInTheDocument()
    expect(screen.queryByText('Saved 1')).not.toBeInTheDocument()
  })

  it('terminates inference and hides account-owned results when the account changes', async () => {
    const view = render(<ContextSearch {...props} />)
    await waitFor(() => expect(MockWorker.instances[0]?.messages.length).toBeGreaterThan(0))
    const worker = MockWorker.instances[0]
    const request = worker.messages.at(-1)!
    act(() =>
      worker.emit({
        id: request.id,
        type: 'results',
        matches: [{ key: 'twitter:1', score: 1, source: 'Post', text: 'A passage' }],
      }),
    )
    expect(await screen.findByText('Saved 1')).toBeInTheDocument()
    state.accountId = 'b'
    view.rerender(<ContextSearch {...props} />)
    expect(worker.terminated).toBe(true)
    expect(screen.queryByText('Saved 1')).not.toBeInTheDocument()
  })

  it('shows retry feedback instead of pretending a failed corpus is empty', async () => {
    state.load.mockRejectedValueOnce(
      new Error('Your saved content could not be loaded. Please retry.'),
    )
    render(<ContextSearch {...props} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
    expect(screen.getByRole('button', { name: 'Retry context search' })).toBeInTheDocument()
  })
})
