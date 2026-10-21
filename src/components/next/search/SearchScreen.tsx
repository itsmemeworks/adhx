'use client'

import { AccountMenu } from '../AccountMenu'
import { BottomNav, NxLogo, PrimaryNav } from '../PrimaryNav'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AudioLines,
  Captions,
  Check,
  Clock,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Play,
  Rows3,
  Search,
  Server,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  countLabel,
  orderByStrength,
  playHref,
  resultKey,
  strengthOfItem,
  paramsFromState,
  readRecent,
  rememberRecent,
  SEARCH_SUGGESTIONS,
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
import {
  LearningPill,
  LearningSheet,
  learningSummary,
  useLearningStatus,
} from '../onboarding/learning'
import { PasteButton, usePasteToSave } from '../onboarding/usePasteToSave'
import { recentPlayHref } from '../theater/queue'
import { useBusyLogo } from '../logo-busy'
import { Gob } from '../Gob'

const TYPES: SearchType[] = ['all', 'videos', 'photos', 'text', 'articles']
const VIEWS: { id: SearchView; label: string; icon: typeof LayoutGrid }[] = [
  // Named for how results are arranged: best first, grouped by what matched, in play order.
  { id: 'bento', label: 'Best first', icon: LayoutGrid },
  { id: 'groups', label: 'By match', icon: Rows3 },
  { id: 'queue', label: 'Play order', icon: List },
]
const URL_SYNC_MS = 300

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

const NUMBER_WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
]

/**
 * The results' title: "Two strong matches"; "Nobody remembers captions"
 * when the best one was read on screen; else the count ("7 matches").
 */
function headingFor(
  items: SearchResultItem[],
  type: SearchType,
  data: { total: number; close: boolean } | null | undefined,
  note: string | null,
): { title: string; sub: string | null } {
  const total = data?.total ?? 0
  const strong = items.filter((i) => strengthOfItem(i) === 'strong').length
  const related = items.filter((i) => strengthOfItem(i) === 'related').length
  if (items[0]?.matched[0] === 'screen' && strong > 0) {
    return {
      title: 'Nobody remembers captions',
      sub: `ADHX does. ${strong} spot-on${related ? `, ${related} related` : ''}.`,
    }
  }
  if (strong > 0) {
    const n = strong < NUMBER_WORDS.length ? NUMBER_WORDS[strong] : String(strong)
    return { title: `${n} strong ${strong === 1 ? 'match' : 'matches'}`, sub: note }
  }
  return {
    title: `${data?.close || total === 0 ? '' : 'Nearest '}${countLabel(total, type)}`,
    sub: note,
  }
}

const LOOKED_IN: { signals: MatchSignal[]; label: string; icon: typeof AudioLines }[] = [
  { signals: ['speech'], label: 'what’s said', icon: AudioLines },
  { signals: ['screen'], label: 'what’s on screen', icon: Captions },
  { signals: ['picture', 'video'], label: 'the pictures', icon: ImageIcon },
]

/** "Looked in what's said · what's on screen · the pictures", lit where the matches came from. */
function LookedIn({ items, className }: { items: SearchResultItem[]; className?: string }) {
  const found = new Set(
    items.filter((i) => strengthOfItem(i) !== 'related').flatMap((i) => i.matched.slice(0, 1)),
  )
  return (
    <p className={cn('m-0 items-center gap-3.5 text-[13px] text-nx-muted', className)}>
      <span>Looked in</span>
      {LOOKED_IN.map(({ signals, label, icon: Icon }) => {
        const lit = signals.some((s) => found.has(s))
        return (
          <span
            key={label}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap',
              lit && 'font-semibold text-nx-cream',
            )}
          >
            <Icon aria-hidden className={cn('h-4 w-4', lit && 'text-nx-accent')} />
            <span>{label}</span>
          </span>
        )
      })}
    </p>
  )
}

const HOW: {
  id: 'screen' | 'speech' | 'pictures'
  signals: MatchSignal[]
  title: string
  icon: typeof AudioLines
}[] = [
  { id: 'screen', signals: ['screen'], title: 'Read the words on screen', icon: Captions },
  { id: 'speech', signals: ['speech'], title: 'Listened to what’s said', icon: AudioLines },
  {
    id: 'pictures',
    signals: ['picture', 'video'],
    title: 'Looked at the pictures',
    icon: ImageIcon,
  },
]

function postsWord(n: number): string {
  return n === 1 ? 'one post' : `${n} posts`
}

/** Beside a few results: where ADHX looked, what it found, and that it all stayed home. */
function HowFound({
  items,
  query,
  understood,
  ready,
  total,
  className,
}: {
  items: SearchResultItem[]
  query: string
  understood: boolean
  ready: number | null
  total: number | null
  className?: string
}) {
  const close = items.filter((i) => strengthOfItem(i) !== 'related')
  const lead = close[0]?.matched[0]
  const q = query.trim()
  return (
    <aside
      aria-label="How ADHX found these"
      className={cn(
        'w-[340px] shrink-0 flex-col gap-1.5 self-stretch rounded-[26px] border border-white/[0.08] bg-nx-surface px-6 py-[26px]',
        className,
      )}
    >
      <h2 className="m-0 mb-3.5 font-nx-serif text-[36px] font-normal leading-[0.95]">
        How ADHX found these
      </h2>
      {HOW.map(({ id, signals, title, icon: Icon }) => {
        const found = close.filter((i) => i.matched.some((m) => signals.includes(m))).length
        const leads = !!lead && signals.includes(lead)
        const desc =
          id === 'pictures' && !understood
            ? 'Back in a moment: matching words for now.'
            : found === 0
              ? 'Nothing there this time.'
              : id === 'screen'
                ? `Found “${q}” written on screen in ${postsWord(found)}.`
                : id === 'speech'
                  ? `Someone says it in ${postsWord(found)}.`
                  : `${found === 1 ? 'One looks' : `${found} look`} like what you described.`
        return (
          <div
            key={id}
            className={cn('flex gap-3.5 rounded-[18px] p-3.5', leads && 'bg-[#262320]')}
          >
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                leads ? 'bg-nx-accent text-black' : 'bg-[#262320] text-nx-soft',
              )}
            >
              <Icon aria-hidden className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-extrabold">{title}</span>
                {found > 0 ? (
                  <Check
                    aria-label="Found"
                    className="h-[18px] w-[18px] shrink-0 text-nx-accent"
                    strokeWidth={2.5}
                  />
                ) : (
                  <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-nx-muted">
                    No match
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'text-[13px] leading-[1.45]',
                  found > 0 ? 'text-nx-soft' : 'text-nx-muted',
                )}
              >
                {desc}
              </span>
            </span>
          </div>
        )
      })}
      <div className="mt-auto flex flex-col gap-3 border-t border-white/[0.08] pt-[18px]">
        <span className="flex items-center gap-2.5">
          <Server aria-hidden className="h-5 w-5 shrink-0 text-nx-accent" />
          <span className="text-[15px] font-extrabold">
            All on your server. Nothing sent anywhere.
          </span>
        </span>
        <span className="text-[13px] leading-normal text-nx-muted">
          No cloud, no ad tech, nobody else’s computer.
        </span>
        {ready !== null && total !== null && total > 0 && (
          <>
            <span aria-hidden className="h-1 overflow-hidden rounded-full bg-white/[0.12]">
              <span
                className="block h-full rounded-full bg-nx-accent"
                style={{ width: `${Math.min(100, Math.round((ready / total) * 100))}%` }}
              />
            </span>
            <span className="text-xs font-semibold text-nx-muted">
              {`${ready.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} saves searchable`}
            </span>
          </>
        )}
      </div>
    </aside>
  )
}

/** After a few results: describe it differently. */
function NotIt({ suggestions, onPick }: { suggestions: string[]; onPick: (q: string) => void }) {
  return (
    <div className="flex h-full flex-col gap-3.5 rounded-[22px] border border-dashed border-white/[0.16] p-5">
      <Gob size={64} className="-m-1.5" />
      <span className="font-nx-serif text-[30px] leading-[0.95]">
        Not it? Describe what you saw.
      </span>
      <span className="text-[13px] leading-normal text-nx-muted">
        Faces, places, the bit that made you laugh. It doesn’t need the right words.
      </span>
      <span className="mt-auto flex flex-col items-start gap-2">
        {suggestions.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => onPick(x)}
            className="min-h-11 rounded-full bg-[#262320] px-3.5 text-left text-[13px] font-semibold text-nx-cream"
          >
            {x}
          </button>
        ))}
      </span>
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

export function SearchScreen({ initial }: { initial: SearchState }) {
  const router = useRouter()
  const [state, setState] = useState<SearchState>(initial)
  const [recent, setRecent] = useState<string[]>([])
  const [learningOpen, setLearningOpen] = useState(false)
  const learning = useLearningStatus({ fast: learningOpen })
  const paste = usePasteToSave({
    savedAction: (post) => ({
      label: 'Play',
      onClick: () => router.push(recentPlayHref(post.key)),
    }),
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useSearch(state)
  useBusyLogo('search', results.status === 'loading')
  const set = (patch: Partial<SearchState>) => setState((s) => ({ ...s, ...patch }))
  const setView = (view: SearchView) => {
    set({ view })
    window.scrollTo({ top: 0 })
  }

  useEffect(() => setRecent(readRecent()), [])

  // Keep the URL shareable and reload-safe without a history entry or a
  // server render per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = paramsFromState(state)
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
  // Close matches first, then related — the order every layout shows and the theater plays.
  const items = useMemo(() => orderByStrength(data?.items ?? []), [data])
  const relatedCount = items.filter((i) => strengthOfItem(i) === 'related').length
  const stale = results.answered !== key
  const typed = state.q.trim().length > 0
  const remaining = state.scope === 'mine' ? learningSummary(learning.status).remaining : 0

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
    if (data.total === 0) return null
    if (!data.close) return 'Nothing close to that. These are the nearest.'
    if (relatedCount > 0 && relatedCount < items.length)
      return `${items.length - relatedCount} close, ${relatedCount} related`
    if (remaining > 0)
      return `Still learning ${remaining} of your saves. “Words only” results were matched on their text and get better on their own.`
    return state.scope === 'everyone' ? 'Across everyone’s saves' : 'In your saves'
  })()

  const heading = headingFor(items, state.type, data, note)
  // A handful of close matches leaves room to say how they were found.
  const closeCount = items.filter((i) => strengthOfItem(i) !== 'related').length
  const sparse = !!data && !stale && closeCount > 0 && closeCount <= 2

  return (
    <div className="min-h-dvh bg-nx-ink font-nx-sans text-nx-cream">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-white/[0.08] bg-nx-ink/95 px-3 backdrop-blur md:h-[72px] md:gap-7 md:px-8">
        <NxLogo className="hidden md:flex" busy={results.status === 'loading'} />
        <PrimaryNav current="search" className="hidden lg:flex" />
        <span className="hidden flex-1 md:block" />
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            setRecent(rememberRecent(state.q))
            inputRef.current?.blur()
          }}
          className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border-2 border-nx-accent bg-nx-surface pl-4 pr-1.5 shadow-[0_0_0_5px_rgba(255,210,63,0.16)] md:h-12 md:w-[450px] md:flex-none"
        >
          <Search aria-hidden className="h-[18px] w-[18px] shrink-0 text-nx-accent" />
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
            placeholder="Search everyone’s saves"
            onChange={(e) => set({ q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && state.q) {
                e.preventDefault()
                set({ q: '' })
              }
            }}
            className="h-10 min-w-0 flex-1 appearance-none bg-transparent text-[15px] font-semibold text-nx-cream caret-nx-accent outline-none placeholder:font-normal placeholder:text-nx-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {state.q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                set({ q: '' })
                inputRef.current?.focus()
              }}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#262320] text-nx-soft hover:text-nx-cream"
            >
              <X aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          )}
        </form>
        <LearningPill status={learning.status} onOpen={() => setLearningOpen(true)} />
        <AccountMenu className="hidden md:block" />
        <button
          type="button"
          onClick={() => router.back()}
          className="h-11 shrink-0 px-1 text-[15px] text-nx-cream md:hidden"
        >
          Cancel
        </button>
      </header>

      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-3 pt-4 md:flex-row md:flex-wrap md:items-center md:px-8 md:pt-[22px]">
        <div
          role="group"
          aria-label="Whose saves"
          className="flex shrink-0 gap-1 rounded-full bg-nx-surface p-1"
        >
          {(
            [
              { id: 'everyone', label: 'Everyone’s saves' },
              { id: 'mine', label: 'Mine' },
            ] as { id: SearchScope; label: string }[]
          ).map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={state.scope === o.id}
              onClick={() => set({ scope: o.id })}
              className={cn(
                'flex h-10 flex-1 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm md:flex-none md:px-[18px]',
                state.scope === o.id
                  ? 'bg-nx-cream font-extrabold text-black'
                  : 'font-semibold text-nx-cream hover:bg-white/[0.06]',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 [scrollbar-width:none] md:mx-0 md:gap-3 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
          <span aria-hidden className="hidden h-6 w-px shrink-0 bg-nx-hairline md:block" />
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
        </div>
        {typed && data && !stale && items.length > 0 && !sparse && (
          <LookedIn items={items} className="ml-auto hidden xl:flex" />
        )}
      </div>

      <main className="mx-auto max-w-[1600px] px-3 pb-28 pt-4 md:px-8 md:pb-10 md:pt-[18px]">
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
            <div className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-nx-surface px-4 py-2 md:hidden">
              <span className="text-[15px]">Copied a link? Save it here.</span>
              <PasteButton onClick={paste.pasteFromClipboard} />
            </div>
            <Link
              href="/channels"
              className="flex min-h-12 items-center justify-between rounded-2xl bg-nx-surface px-4 text-[15px]"
            >
              <span className="font-bold">Your channels</span>
              <span className="text-[13px] text-nx-muted">Made for you, yours and top</span>
            </Link>
            <section aria-labelledby="nx-try" className="flex flex-col gap-2.5">
              <h2 id="nx-try" className="m-0 text-[15px] font-bold">
                Try
              </h2>
              <div className="flex flex-wrap gap-2">
                {SEARCH_SUGGESTIONS.map((s) => (
                  <Pill key={s} on={false} onClick={() => set({ q: s })}>
                    <span>{s}</span>
                  </Pill>
                ))}
              </div>
            </section>
            <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-nx-muted">
              <Link href="/settings" className="underline hover:text-nx-cream">
                Settings
              </Link>
            </p>
          </div>
        )}

        {typed && (
          <div className={cn(sparse && 'xl:flex xl:items-start xl:gap-8')}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-4 pb-4 md:pb-[18px]">
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h1
                    aria-live="polite"
                    className="m-0 font-nx-serif text-[28px] font-normal leading-[0.95] md:text-[48px]"
                  >
                    {data && !stale ? heading.title : 'Searching…'}
                  </h1>
                  {data && !stale && heading.sub && (
                    <span className="text-[13px] text-nx-muted md:text-[15px]">{heading.sub}</span>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-3">
                  <Segment<SearchView>
                    label="Layout"
                    iconOnly
                    className="bg-transparent md:bg-nx-surface"
                    value={state.view}
                    onChange={setView}
                    options={VIEWS}
                  />
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={() => play()}
                      className="hidden h-11 items-center gap-2 whitespace-nowrap rounded-full bg-nx-accent px-[18px] text-sm font-extrabold text-nx-ink md:flex"
                    >
                      <Play
                        aria-hidden
                        className="h-3.5 w-3.5"
                        fill="currentColor"
                        strokeWidth={0}
                      />
                      <span>{`Play all ${items.length}`}</span>
                    </button>
                  )}
                </span>
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
                    <BentoView
                      items={items}
                      query={state.q}
                      onOpen={onOpen}
                      hrefFor={hrefFor}
                      extra={
                        sparse ? (
                          <NotIt
                            suggestions={SEARCH_SUGGESTIONS.filter((x) => x !== state.q).slice(
                              0,
                              2,
                            )}
                            onPick={(q) => set({ q })}
                          />
                        ) : null
                      }
                    />
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
            </div>
            {sparse && (
              <HowFound
                items={items}
                query={state.q}
                understood={!!data?.understood}
                ready={learning.status?.ready ?? null}
                total={learning.status?.totalSaves ?? null}
                className="hidden xl:flex"
              />
            )}
          </div>
        )}
      </main>

      {typed && items.length > 0 && (
        <button
          type="button"
          onClick={() => play()}
          className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-1/2 z-30 flex h-[52px] -translate-x-1/2 items-center gap-2 rounded-full bg-nx-accent px-6 text-base font-bold text-black shadow-[0_8px_30px_rgba(0,0,0,0.5)] md:hidden"
        >
          <Play aria-hidden className="h-4 w-4" fill="currentColor" strokeWidth={0} />
          <span>{`Play ${items.length}`}</span>
        </button>
      )}
      {paste.toast}
      {learningOpen && (
        <LearningSheet status={learning.status} onClose={() => setLearningOpen(false)} />
      )}
      <BottomNav current="search" searchSheet={false} />
    </div>
  )
}
