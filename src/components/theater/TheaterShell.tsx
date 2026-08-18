'use client'

/**
 * Theater orchestrator (spec §3/§4/§5/§6/§8): full-viewport <Stage/> + <Rail/>.
 * Owns current-item state, keyboard nav, mute state, the seen model + preview
 * pulse, and next-item prefetch. See docs/specs/theater-first.md.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Stage } from './Stage'
import { Rail } from './Rail'
import { useTheaterFeed } from './useTheaterFeed'
import { useSeenSet } from './useSeenSet'
import { prefetchPlayback } from './usePlaybackSource'
import { theaterItemKey } from './types'
import type { TheaterFeedSeed, TheaterItem, TheaterMode } from './types'

export interface TheaterShellProps {
  seed: TheaterFeedSeed
  mode?: TheaterMode
}

/** How long a post must stay staged before it counts as "seen" (spec §4/§5). */
const SEEN_DWELL_MS = 2_000

export function TheaterShell({ seed, mode = 'home' }: TheaterShellProps) {
  const feed = useTheaterFeed(seed)
  const seenSet = useSeenSet()
  const { items } = feed

  const [muted, setMuted] = useState(true)
  const [currentKey, setCurrentKey] = useState<string | null>(null)

  // Set once a user has navigated (keyboard/rail click) — after that, the
  // "lead item = max trendCount among unseen" pick below never overrides
  // their choice.
  const hasNavigatedRef = useRef(false)
  const leadAppliedRef = useRef(false)

  // Kept in refs (rather than effect deps) so the seen/pulse timer below only
  // resets when `currentKey` itself changes, not on every unrelated re-render
  // (polling, seen-state updates, etc.).
  const itemsRef = useRef(items)
  itemsRef.current = items
  const seenSetRef = useRef(seenSet)
  seenSetRef.current = seenSet

  // Land on the first item immediately (no flash of an empty stage); a
  // moment later, once localStorage seen-state has hydrated, jump to the
  // best unseen lead — but only if the user hasn't already moved on their own.
  useEffect(() => {
    if (currentKey === null && items.length > 0) {
      setCurrentKey(theaterItemKey(items[0]))
    }
  }, [items, currentKey])

  useEffect(() => {
    if (!seenSet.ready || leadAppliedRef.current || hasNavigatedRef.current) return
    leadAppliedRef.current = true
    if (items.length === 0) return
    const unseen = items.filter((it) => !seenSet.isSeen(theaterItemKey(it)))
    const pool = unseen.length > 0 ? unseen : items
    const lead = pool.reduce(
      (best, it) => ((it.trendCount ?? 0) > (best.trendCount ?? 0) ? it : best),
      pool[0],
    )
    setCurrentKey(theaterItemKey(lead))
  }, [seenSet, items])

  const currentIndex = useMemo(
    () => items.findIndex((it) => theaterItemKey(it) === currentKey),
    [items, currentKey],
  )
  const current: TheaterItem | null = currentIndex === -1 ? null : items[currentIndex]

  const goNext = useCallback(() => {
    setCurrentKey((key) => {
      const idx = itemsRef.current.findIndex((it) => theaterItemKey(it) === key)
      if (idx === -1 || idx + 1 >= itemsRef.current.length) return key
      hasNavigatedRef.current = true
      return theaterItemKey(itemsRef.current[idx + 1])
    })
  }, [])

  const goPrev = useCallback(() => {
    setCurrentKey((key) => {
      const idx = itemsRef.current.findIndex((it) => theaterItemKey(it) === key)
      if (idx <= 0) return key
      hasNavigatedRef.current = true
      return theaterItemKey(itemsRef.current[idx - 1])
    })
  }, [])

  const onSelect = useCallback((key: string) => {
    hasNavigatedRef.current = true
    setCurrentKey(key)
  }, [])

  const onRequestUnmute = useCallback(() => setMuted(false), [])

  // Keyboard nav: ↓/j next, ↑/k prev, space toggles play/pause (delegated to
  // Stage via a custom event, matching the repo's cross-component keyboard
  // pattern), m toggles mute. Ignored while typing in an input/textarea/
  // contentEditable element.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
        case 'J':
          e.preventDefault()
          goNext()
          break
        case 'ArrowUp':
        case 'k':
        case 'K':
          e.preventDefault()
          goPrev()
          break
        case ' ':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('theater-toggle-play'))
          break
        case 'm':
        case 'M':
          e.preventDefault()
          setMuted((m) => !m)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goNext, goPrev])

  // Mark seen + fire the preview pulse once the current post has been staged
  // for SEEN_DWELL_MS. Resets only when `currentKey` changes.
  useEffect(() => {
    if (!currentKey) return
    const timer = window.setTimeout(() => {
      const item = itemsRef.current.find((it) => theaterItemKey(it) === currentKey)
      if (!item) return
      seenSetRef.current.markSeen(currentKey)
      if (item.bookmarkId) {
        fetch('/api/activity/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: item.platform, id: item.bookmarkId }),
        }).catch(() => {})
      }
    }, SEEN_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [currentKey])

  // Prefetch at most one item ahead.
  useEffect(() => {
    if (currentIndex === -1) return
    const next = items[currentIndex + 1]
    if (next) prefetchPlayback(next)
  }, [currentIndex, items])

  // Items newer than the last visit and not yet seen. Zero on a first-ever
  // visit (no `lastVisitAt` to compare against) — the caught-up state is the
  // honest read for a brand new visitor, not "everything is new".
  const newCount = useMemo(() => {
    if (!seenSet.ready || seenSet.lastVisitAt == null) return 0
    const lastVisitAt = seenSet.lastVisitAt
    return items.filter((it) => {
      if (seenSet.isSeen(theaterItemKey(it))) return false
      return new Date(it.createdAt).getTime() > lastVisitAt
    }).length
  }, [items, seenSet])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-[#08070a] lg:flex-row">
      <div className="relative h-[62dvh] w-full flex-shrink-0 overflow-hidden lg:h-full lg:min-w-0 lg:flex-1">
        <Stage item={current} muted={muted} onRequestUnmute={onRequestUnmute} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto lg:h-full lg:flex-none">
        <Rail
          mode={mode}
          items={items}
          current={current}
          currentKey={currentKey}
          isSeen={seenSet.isSeen}
          seenReady={seenSet.ready}
          freshKeys={feed.freshKeys}
          newCount={newCount}
          savedToday={feed.savedToday}
          onSelect={onSelect}
        />
      </div>
    </div>
  )
}
