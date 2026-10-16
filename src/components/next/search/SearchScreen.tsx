'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Clock, LayoutGrid, List, Play, Rows3, Search, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NEXT_UI_PARAM } from '@/lib/next-ui/flag'
import { useNextUi } from '@/lib/next-ui/useNextUi'
import {
  countLabel,
  playHref,
  resultKey,
  paramsFromState,
  readRecent,
  rememberRecent,
  TYPE_LABELS,
  type MatchSignal,
  type SearchResultItem,
  type SearchScope,
  type SearchState,
  type SearchType,
  type SearchView,
} from './model'
import { BentoView, GroupsView, QueueView } from './ResultViews'
import { useSearch } from './useSearch'

const TYPES: SearchType[] = ['all', 'videos', 'photos', 'text', 'articles']
const VIEWS: { id: SearchView; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'bento', label: 'Bento', icon: LayoutGrid },
  { id: 'groups', label: 'Groups', icon: Rows3 },
  { id: 'queue', label: 'Queue', icon: List },
]
const SUGGESTIONS = [
  'that video with the squirrel',
  'something about being tired after work',
  'tiny animations that make an app feel nicer',
  'a synth you play by typing',
]
const URL_SYNC_MS = 300

interface LearningStatus {
  enabled: boolean
  groups: { id: string; done: number; total: number }[]
}

function Pill({
  on,
  onClick,
  children,
  className,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors',
        on
          ? 'border-nx-cream bg-nx-cream font-bold text-nx-ink'
          : 'border-nx-hairline bg-transparent text-nx-cream hover:border-nx-muted',
        className,
      )}
    >
      {children}
    </button>
  )
}

function Segment<T extends string>({
  label,
  options,
  value,
  onChange,
  iconOnly = false,
  className,
}: {
  label: string
  options: { id: T; label: string; icon?: typeof LayoutGrid }[]
  value: T
  onChange: (value: T) => void
  iconOnly?: boolean
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex gap-0.5 rounded-xl bg-nx-ink p-1', className)}
    >
      {options.map((o) => {
        const Icon = o.icon
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            aria-label={iconOnly ? o.label : undefined}
            onClick={() => onChange(o.id)}
            className={cn(
              'flex min-h-[38px] min-w-[38px] items-center justify-center gap-1.5 rounded-[9px] px-3 text-[13px] transition-colors',
              on ? 'bg-nx-accent font-bold text-nx-ink' : 'text-nx-soft hover:text-nx-cream',
            )}
          >
            {Icon && iconOnly && <Icon aria-hidden className="h-4 w-4" />}
            {!iconOnly && <span>{o.label}</span>}
          </button>
        )
      })}
    </div>
  )
}

function Skeleton() {
  const heights = [220, 160, 300, 180, 260, 140, 240, 200]
  return (
    <div aria-hidden className="columns-2 gap-2 md:columns-3 md:gap-3 2xl:columns-4">
      {heights.map((h, i) => (
        <span
          key={i}
          className="nx-shimmer animate-nx-shimmer mb-2 block break-inside-avoid rounded-nx-tile md:mb-3"
          style={{ height: h }}
        />
      ))}
    </div>
  )
}

function remainingToLearn(status: LearningStatus | null): number {
  if (!status?.enabled) return 0
  return status.groups.reduce((n, g) => n + Math.max(0, g.total - g.done), 0)
}

export function SearchScreen({ initial }: { initial: SearchState }) {
  const router = useRouter()
  // Persists a `?next_ui=1` opt-in so links from here keep the redesign.
  useNextUi()
  const [state, setState] = useState<SearchState>(initial)
  const [recent, setRecent] = useState<string[]>([])
  const [learning, setLearning] = useState<LearningStatus | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useSearch(state)
  const set = (patch: Partial<SearchState>) => setState((s) => ({ ...s, ...patch }))
  const setView = (view: SearchView) => {
    set({ view })
    window.scrollTo({ top: 0 })
  }

  useEffect(() => setRecent(readRecent()), [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/understanding/status', { signal: controller.signal, credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<LearningStatus>) : null))
      .then((s) => s && setLearning(s))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  // Keep the URL shareable and reload-safe without a history entry or a
  // server render per keystroke. The flag parameter, if any, stays put.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = paramsFromState(state)
      const flag = new URLSearchParams(window.location.search).get(NEXT_UI_PARAM)
      if (flag !== null) params.set(NEXT_UI_PARAM, flag)
      const query = params.toString()
      const next = query ? `/search?${query}` : '/search'
      if (next !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(window.history.state, '', next)
      }
    }, URL_SYNC_MS)
    return () => clearTimeout(timer)
  }, [state])

  const key = JSON.stringify([state.q, state.scope, state.type, state.wordsOnly])
  const data = results.data
  const items = useMemo(() => data?.items ?? [], [data])
  const stale = results.answered !== key
  const typed = state.q.trim().length > 0
  const remaining = state.scope === 'mine' ? remainingToLearn(learning) : 0

  // Every way into the theater plays this search's results as the queue.
  const play = (opts: { group?: MatchSignal; start?: string } = {}) => {
    rememberRecent(state.q)
    router.push(playHref(state, opts))
  }
  const hrefFor = (item: SearchResultItem) => playHref(state, { start: resultKey(item) })
  const onOpen = () => setRecent(rememberRecent(state.q))

  const note = (() => {
    if (!data || stale) return null
    if (!data.understood) return 'Matching words for now. Meaning comes back in a moment.'
    if (!data.close) return 'Nothing close to that. These are the nearest.'
    if (remaining > 0) return `Still learning ${remaining} of your saves. More will show up.`
    return state.scope === 'everyone' ? 'Across everyone’s saves' : 'In your saves'
  })()

  return (
    <div className="min-h-dvh bg-nx-ink font-nx-sans text-nx-cream">
      <header className="sticky top-0 z-20 border-b border-nx-hairline bg-nx-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-3 md:gap-5 md:px-8">
          <Link
            href="/saved"
            className="hidden shrink-0 items-center gap-3 md:flex"
            aria-label="adhx home"
          >
            <span
              aria-hidden
              className="flex h-[30px] w-[30px] items-center justify-center gap-1 rounded-[10px] bg-nx-accent"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-nx-ink" />
              <span className="h-1.5 w-1.5 rounded-full bg-nx-ink" />
            </span>
            <span className="font-nx-serif text-[26px] leading-none">adhx</span>
          </Link>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              setRecent(rememberRecent(state.q))
              inputRef.current?.blur()
            }}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-nx-surface py-1 pl-3 pr-1 md:gap-3 md:rounded-2xl md:border-[1.5px] md:border-nx-accent md:pl-[18px]"
          >
            <Search
              aria-hidden
              className="h-[18px] w-[18px] shrink-0 text-nx-soft md:h-5 md:w-5 md:text-nx-accent"
            />
            <label htmlFor="nx-search" className="sr-only">
              Describe what you’re looking for
            </label>
            <input
              ref={inputRef}
              id="nx-search"
              type="search"
              value={state.q}
              autoFocus={!initial.q}
              autoComplete="off"
              enterKeyHint="search"
              maxLength={200}
              placeholder="Describe it…"
              onChange={(e) => set({ q: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && state.q) {
                  e.preventDefault()
                  set({ q: '' })
                }
              }}
              className="h-10 min-w-0 flex-1 appearance-none bg-transparent text-base text-nx-cream outline-none placeholder:text-nx-muted md:h-11 md:text-lg [&::-webkit-search-cancel-button]:hidden"
            />
            {state.q && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  set({ q: '' })
                  inputRef.current?.focus()
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-nx-soft hover:text-nx-cream"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            )}
            <Segment<SearchScope>
              label="Search in"
              className="hidden md:flex"
              value={state.scope}
              onChange={(scope) => set({ scope })}
              options={[
                { id: 'mine', label: 'My saves' },
                { id: 'everyone', label: 'Everyone' },
              ]}
            />
          </form>
          <button
            type="button"
            onClick={() => router.back()}
            className="h-11 shrink-0 px-1 text-[15px] text-nx-cream md:hidden"
          >
            Cancel
          </button>
        </div>

        <div className="mx-auto flex max-w-[1600px] items-center gap-2 overflow-x-auto px-3 pb-3 [scrollbar-width:none] md:flex-wrap md:gap-3 md:px-8 [&::-webkit-scrollbar]:hidden">
          <Pill
            on={state.scope === 'everyone'}
            onClick={() => set({ scope: state.scope === 'mine' ? 'everyone' : 'mine' })}
            className="md:hidden"
          >
            <Users aria-hidden className="h-3.5 w-3.5" />
            <span>{state.scope === 'everyone' ? 'Everyone' : 'My saves'}</span>
          </Pill>
          <span aria-hidden className="h-6 w-px shrink-0 bg-nx-hairline md:hidden" />
          <div role="group" aria-label="Show" className="flex shrink-0 gap-1.5">
            {TYPES.map((t) => (
              <Pill key={t} on={state.type === t} onClick={() => set({ type: t })}>
                <span>{TYPE_LABELS[t]}</span>
              </Pill>
            ))}
          </div>
          <Pill on={state.wordsOnly} onClick={() => set({ wordsOnly: !state.wordsOnly })}>
            <span>Words only</span>
          </Pill>
          <Segment<SearchView>
            label="Layout"
            className="ml-auto hidden bg-nx-surface md:flex"
            value={state.view}
            onChange={setView}
            options={VIEWS}
          />
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 pb-28 pt-4 md:px-8 md:pb-10">
        {!typed && (
          <div className="flex max-w-2xl flex-col gap-8 py-4 md:py-10">
            <h1 className="m-0 font-nx-serif text-[34px] font-normal leading-[1.05] md:text-[48px]">
              Find it by what you remember.
            </h1>
            <p className="-mt-4 m-0 text-[15px] text-nx-soft">
              A scene, a feeling, a few words. Videos and pictures count too.
            </p>
            {recent.length > 0 && (
              <section aria-labelledby="nx-recent" className="flex flex-col">
                <h2 id="nx-recent" className="m-0 pb-1.5 text-[15px] font-bold">
                  Recent
                </h2>
                {recent.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => set({ q: r })}
                    className="flex min-h-12 items-center gap-3 text-left text-[15px] text-nx-cream"
                  >
                    <Clock aria-hidden className="h-[18px] w-[18px] shrink-0 text-nx-muted" />
                    <span className="flex-1 truncate">{r}</span>
                  </button>
                ))}
              </section>
            )}
            <section aria-labelledby="nx-try" className="flex flex-col gap-2.5">
              <h2 id="nx-try" className="m-0 text-[15px] font-bold">
                Try
              </h2>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <Pill key={s} on={false} onClick={() => set({ q: s })}>
                    <span>{s}</span>
                  </Pill>
                ))}
              </div>
            </section>
          </div>
        )}

        {typed && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-3 md:items-baseline md:pb-4">
              <h1
                aria-live="polite"
                className="m-0 font-nx-serif text-[22px] font-normal md:text-[30px]"
              >
                {data && !stale
                  ? `${data.close ? '' : 'Nearest '}${countLabel(data.total, state.type)}`
                  : 'Searching…'}
              </h1>
              {note && <span className="text-[13px] text-nx-muted">{note}</span>}
              <Segment<SearchView>
                label="Layout"
                iconOnly
                className="ml-auto bg-transparent md:hidden"
                value={state.view}
                onChange={setView}
                options={VIEWS}
              />
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => play()}
                  className="ml-auto hidden h-11 items-center gap-2 rounded-full bg-nx-accent px-[18px] text-sm font-bold text-nx-ink md:flex"
                >
                  <Play aria-hidden className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} />
                  <span>{`Play all ${items.length}`}</span>
                </button>
              )}
            </div>

            {results.status === 'error' && !data && (
              <p className="py-16 text-center text-[15px] text-nx-soft">
                Search isn’t answering right now. Try again in a moment.
              </p>
            )}
            {results.status === 'loading' && !data && <Skeleton />}

            {data && !stale && items.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-16 text-center md:py-20">
                <span className="font-nx-serif text-[28px] md:text-[34px]">
                  {state.type === 'all'
                    ? 'Nothing matches that yet'
                    : `No ${TYPE_LABELS[state.type].toLowerCase()} match this`}
                </span>
                <div className="flex flex-wrap justify-center gap-2">
                  {state.type !== 'all' && (
                    <Pill on={false} onClick={() => set({ type: 'all' })}>
                      <span>Show everything</span>
                    </Pill>
                  )}
                  {state.scope === 'mine' && (
                    <Pill on={false} onClick={() => set({ scope: 'everyone' })}>
                      <span>Search everyone’s saves</span>
                    </Pill>
                  )}
                </div>
              </div>
            )}

            {items.length > 0 && (
              <div className={cn('transition-opacity duration-150', stale && 'opacity-60')}>
                {state.view === 'bento' && (
                  <BentoView items={items} onOpen={onOpen} hrefFor={hrefFor} />
                )}
                {state.view === 'groups' && (
                  <GroupsView
                    items={items}
                    onPlayGroup={(group) => play({ group })}
                    onOpen={onOpen}
                    hrefFor={hrefFor}
                  />
                )}
                {state.view === 'queue' && (
                  <QueueView items={items} onOpen={onOpen} hrefFor={hrefFor} />
                )}
              </div>
            )}
          </>
        )}
      </main>

      {typed && items.length > 0 && (
        <button
          type="button"
          onClick={() => play()}
          className="fixed bottom-[calc(24px+env(safe-area-inset-bottom))] left-1/2 z-30 flex h-[52px] -translate-x-1/2 items-center gap-2 rounded-full bg-nx-accent px-6 text-base font-bold text-black shadow-[0_8px_30px_rgba(0,0,0,0.5)] md:hidden"
        >
          <Play aria-hidden className="h-4 w-4" fill="currentColor" strokeWidth={0} />
          <span>{`Play ${items.length}`}</span>
        </button>
      )}
    </div>
  )
}
