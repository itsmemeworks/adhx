'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuthMe } from '@/components/auth/useAuthMe'
import { clientEventMatchesCurrentAccount } from '@/lib/client-events'
import { collectionPath } from '@/lib/theater/collection-href'
import { buildSearchDocuments, searchItemKey } from '@/lib/search/documents'
import { loadSearchCorpus } from '@/lib/search/corpus'
import type { SearchMatch } from '@/lib/search/engine'
import type { SearchResponse } from '@/lib/search/search.worker'
import { FeedGrid, type FeedView } from './FeedGrid'
import { feedItemType } from './feedItemMeta'
import type { FeedItem, FilterType, PlatformFilter, SortType, SortDirection } from './types'

interface Props {
  accountId: string
  enabled: boolean
  onEnabledChange(enabled: boolean): void
  query: string
  filter: FilterType
  platform: PlatformFilter
  hideArchived: boolean
  tags: string[]
  tagSelectTag: string | null
  view: FeedView
  sort: SortType
  sortDirection: SortDirection
  stats: { total: number; active: number }
  onShowAll(): void
}

export function ContextSearch(props: Props) {
  const { accountId, enabled, onEnabledChange, query } = props
  const { me, loading: authLoading } = useAuthMe()
  const trusted = !authLoading && me?.authenticated === true && me.user?.id === accountId
  const router = useRouter()
  const [corpus, setCorpus] = useState<FeedItem[] | null>(null)
  const [resolvedQuery, setResolvedQuery] = useState('')
  const queryRef = useRef(query)
  const [matches, setMatches] = useState<SearchMatch[] | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [visibleCount, setVisibleCount] = useState(40)
  const worker = useRef<Worker | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (!enabled || !trusted) return
    const refresh = (event: Event) => {
      if (event.type === 'sync-complete' || clientEventMatchesCurrentAccount(event)) {
        setRevision((n) => n + 1)
      }
    }
    for (const event of [
      'tweet-added',
      'bookmark-tags-changed',
      'sync-complete',
      'stats-updated',
    ]) {
      window.addEventListener(event, refresh)
    }
    return () => {
      for (const event of [
        'tweet-added',
        'bookmark-tags-changed',
        'sync-complete',
        'stats-updated',
      ]) {
        window.removeEventListener(event, refresh)
      }
    }
  }, [enabled, trusted])

  useEffect(() => {
    if (!enabled || !trusted) return
    const controller = new AbortController()
    setCorpus(null)
    setMatches(null)
    setError(null)
    setStatus('Loading your saved content…')
    loadSearchCorpus(accountId, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setCorpus(items)
          setStatus('')
        }
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted) {
          setError(reason.message)
          setStatus('')
        }
      })
    return () => controller.abort()
  }, [accountId, enabled, trusted, revision])

  // The worker belongs to this mounted account. Auth changes terminate pending inference immediately.
  useEffect(() => {
    if (!enabled || !trusted) return
    return () => {
      requestId.current++
      worker.current?.terminate()
      worker.current = null
    }
  }, [enabled, trusted, accountId])

  const candidates = useMemo(() => {
    const items = (corpus || []).filter((item) => {
      if (props.platform !== 'all' && (item.platform || 'twitter') !== props.platform) return false
      if (!props.tagSelectTag && !props.tags.every((tag) => item.tags.includes(tag))) return false
      if (!props.tagSelectTag && props.tags.length === 0 && item.isArchived === props.hideArchived)
        return false
      const type = feedItemType(item)
      return (
        props.filter === 'all' ||
        type ===
          ({ photos: 'photo', videos: 'video', text: 'text', articles: 'article' } as const)[
            props.filter
          ]
      )
    })
    const field = props.sort === 'posted' ? 'createdAt' : 'processedAt'
    return items.sort(
      (a, b) =>
        (props.sortDirection === 'asc' ? 1 : -1) * (a[field] || '').localeCompare(b[field] || ''),
    )
  }, [
    corpus,
    props.platform,
    props.filter,
    props.hideArchived,
    props.tags,
    props.tagSelectTag,
    props.sort,
    props.sortDirection,
  ])

  useEffect(() => {
    if (!enabled || !trusted || !corpus) return
    const id = ++requestId.current
    queryRef.current = query
    setMatches(null)
    setError(null)
    setVisibleCount(40)
    if (!query.trim() || candidates.length === 0) {
      worker.current?.postMessage({
        id,
        accountId,
        documents: buildSearchDocuments(corpus),
        query: '',
      })
      setStatus('')
      if (query.trim()) {
        setMatches([])
        setResolvedQuery(query)
      }
      return
    }
    setStatus('Finding matches on this device…')
    try {
      if (!worker.current) {
        worker.current = new Worker(new URL('../../lib/search/search.worker.ts', import.meta.url), {
          type: 'module',
        })
        worker.current.onmessage = (event: MessageEvent<SearchResponse>) => {
          const message = event.data
          if (message.id !== requestId.current) return
          if (message.type === 'download')
            setStatus(
              `Downloading the search model${message.progress === null ? '…' : `: ${Math.round(message.progress)}%`}`,
            )
          if (message.type === 'index')
            setStatus(`Preparing your saved content: ${message.done} of ${message.total} passages`)
          if (message.type === 'results') {
            setMatches(message.matches)
            setResolvedQuery(queryRef.current)
            setStatus('')
          }
          if (message.type === 'error') {
            console.error('Context search model failed:', message.detail)
            setError(message.message)
            setStatus('')
          }
        }
        worker.current.onerror = (event) => {
          console.error('Context search worker failed:', event.message)
          setError('Context search could not start on this device. Retry, or use keyword search.')
          setStatus('')
        }
      }
      worker.current.postMessage({
        id,
        accountId,
        documents: buildSearchDocuments(corpus),
        allowedKeys: candidates.map(searchItemKey),
        query,
      })
    } catch {
      setError('Context search is unavailable on this device. You can still use keyword search.')
      setStatus('')
    }
    return () => {
      requestId.current++
    }
  }, [enabled, trusted, corpus, candidates, query, accountId])

  if (!trusted) return null
  const lookup = new Map(candidates.map((item) => [searchItemKey(item), item]))
  const readyMatches = resolvedQuery === query ? matches : null
  const ranked =
    readyMatches?.flatMap((match) => (lookup.has(match.key) ? [lookup.get(match.key)!] : [])) || []
  const results = query.trim() ? ranked : candidates
  const showing = results.slice(0, visibleCount)

  return (
    <section
      aria-label="Context search"
      data-context-query={resolvedQuery}
      data-context-ready={!status && !error && !!corpus && (!query.trim() || readyMatches !== null)}
      className="px-4 sm:px-[26px] pt-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="inline-flex rounded-full border border-hairline bg-surface p-1"
          aria-label="Search mode"
        >
          <button
            type="button"
            aria-pressed={!enabled}
            onClick={() => onEnabledChange(false)}
            className={`rounded-full px-3 py-1.5 text-sm ${!enabled ? 'bg-inset text-ink' : 'text-ink-3'}`}
          >
            Keywords
          </button>
          <button
            type="button"
            aria-pressed={enabled}
            onClick={() => {
              onEnabledChange(true)
              window.dispatchEvent(new Event('library-search-focus'))
            }}
            className={`rounded-full px-3 py-1.5 text-sm ${enabled ? 'bg-inset text-clay' : 'text-ink-3'}`}
          >
            By meaning
          </button>
        </div>
        <p className="text-sm text-ink-3">
          {enabled
            ? 'Describe what you remember in Search. Your content stays on this device for matching.'
            : 'Find a save by what it means. Downloads a search model once (about 200 MB).'}{' '}
        </p>
      </div>
      {enabled && (
        <div className="pt-4">
          {status && (
            <p role="status" className="flex items-center gap-2 text-sm text-ink-2 pb-4">
              <Loader2 size={16} className="animate-spin" />
              <span>{status}</span>
            </p>
          )}
          {error && (
            <div role="alert" className="rounded-card border border-hairline bg-surface p-4 mb-4">
              <p className="text-sm text-ink-2">{error}</p>
              <div className="mt-3 flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    worker.current?.terminate()
                    worker.current = null
                    setRevision((n) => n + 1)
                  }}
                  className="text-sm text-clay"
                >
                  Retry context search
                </button>
                <button
                  type="button"
                  onClick={() => onEnabledChange(false)}
                  className="text-sm text-clay"
                >
                  Use keywords
                </button>
              </div>
            </div>
          )}
          {!status && !error && query.trim() && readyMatches && (
            <p className="text-sm text-ink-3 pb-4">
              {readyMatches.length
                ? `Closest matches · ${readyMatches.length} results, ordered by relevance`
                : 'No close matches. Try a different description or adjust your filters.'}
            </p>
          )}
          {(!query.trim() || readyMatches !== null) && !error && (
            <FeedGrid
              items={showing}
              loading={!!status}
              hasMore={visibleCount < results.length}
              lastSyncAt={null}
              sortField={props.sort === 'posted' ? 'createdAt' : 'processedAt'}
              hideArchived={props.hideArchived}
              stats={props.stats}
              view={props.view}
              onExpand={(index) => {
                const item = showing[index]
                router.push(collectionPath({ open: item.id, platform: item.platform || 'twitter' }))
              }}
              onLoadMore={() => setVisibleCount((n) => n + 40)}
              onShowAll={props.onShowAll}
              tagSelectTag={props.tagSelectTag}
              searchQuery={query}
              searchMatches={new Map((matches || []).map((match) => [match.key, match]))}
            />
          )}
          {!query.trim() && !status && (
            <p className="mt-2 flex items-center gap-2 text-sm text-ink-3">
              <Search size={15} />
              <span>
                Try “make my landing page look more polished”. Images and videos are searched by
                their saved text.
              </span>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
