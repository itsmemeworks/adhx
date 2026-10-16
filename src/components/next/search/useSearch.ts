'use client'

import { useEffect, useRef, useState } from 'react'
import { searchUrl, type SearchResponse, type SearchState } from './model'

/** Instant results follow typing closely; the refined order waits for a pause. */
const INSTANT_DELAY_MS = 120
const REFINE_DELAY_MS = 450

export interface SearchResults {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** The last answered response (kept while the next one loads). */
  data: SearchResponse | null
  /** The query `data` answers, so the UI can tell stale from current. */
  answered: string
  /** The refined (reranked) order arrived for the current query. */
  refined: boolean
}

type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<SearchResponse>

async function defaultFetcher(url: string, init: { signal: AbortSignal }): Promise<SearchResponse> {
  const response = await fetch(url, { signal: init.signal, credentials: 'same-origin' })
  if (!response.ok) throw new Error(`search ${response.status}`)
  return (await response.json()) as SearchResponse
}

/**
 * Debounced search with an instant pass and a refined pass. Each change
 * aborts whatever is in flight, and an answer is only applied if it still
 * matches the current input, so fast typing never shows an old query.
 */
export function useSearch(
  state: Pick<SearchState, 'q' | 'scope' | 'type' | 'wordsOnly'>,
  fetcher: Fetcher = defaultFetcher,
): SearchResults {
  const [results, setResults] = useState<SearchResults>({
    status: 'idle',
    data: null,
    answered: '',
    refined: false,
  })
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const { q, scope, type, wordsOnly } = state

  useEffect(() => {
    if (!q.trim()) {
      setResults({ status: 'idle', data: null, answered: '', refined: false })
      return
    }
    const key = JSON.stringify([q, scope, type, wordsOnly])
    const controller = new AbortController()
    setResults((r) => ({ ...r, status: 'loading', refined: false }))
    const current = { q, scope, type, wordsOnly, view: 'bento' as const }

    const instant = setTimeout(() => {
      fetcherRef
        .current(searchUrl(current), { signal: controller.signal })
        .then((data) => {
          if (controller.signal.aborted) return
          setResults((r) =>
            // A refined answer for this exact input may already be showing.
            r.refined && r.answered === key
              ? r
              : { status: 'ready', data, answered: key, refined: false },
          )
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults((r) => ({ ...r, status: 'error' }))
        })
    }, INSTANT_DELAY_MS)

    const refine = setTimeout(() => {
      fetcherRef
        .current(searchUrl(current, { refine: true }), { signal: controller.signal })
        .then((data) => {
          if (controller.signal.aborted || !data.refined) return
          setResults({ status: 'ready', data, answered: key, refined: true })
        })
        .catch(() => {
          // The instant order stands.
        })
    }, REFINE_DELAY_MS)

    return () => {
      clearTimeout(instant)
      clearTimeout(refine)
      controller.abort()
    }
  }, [q, scope, type, wordsOnly])

  return results
}
