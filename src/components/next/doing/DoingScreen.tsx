'use client'

import { useState } from 'react'
import { useAuthMe } from '@/components/auth'
import { Check, CheckCircle, CloudOff, ImageOff, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NxHeader } from '../channels/ChannelParts'
import { saversLine } from '../savers'
import { agoLabel } from '../settings/when'
import { useDoing, type DoingItem, type DoingScope, type DoingSummary } from './useDoing'

/** The page asks this often while it's showing. */
export const DOING_POLL_MS = 3_000

const SCOPES: { id: DoingScope; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'needs', label: 'Needs you' },
]

/** Short words for the status column while a step is under way. */
const WORKING: Record<number, string> = {
  1: 'Got the link',
  2: 'Keeping a copy',
  3: 'Converting',
  4: 'Listening',
  5: 'Reading',
  6: 'Learning',
}

export function freeLabel(bytes: number | null): string {
  if (bytes === null) return '—'
  const gb = bytes / 1024 ** 3
  if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB free`
  if (gb >= 10) return `${Math.round(gb)} GB free`
  return `${gb.toFixed(1)} GB free`
}

function inLabel(at: string | null): string {
  if (!at) return 'soon'
  const mins = Math.round((Date.parse(at) - Date.now()) / 60_000)
  if (mins <= 0) return 'any moment'
  if (mins < 60) return `in ${mins} min`
  const hours = Math.round(mins / 60)
  return hours < 24 ? `in ${hours}h` : `in ${Math.round(hours / 24)} days`
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** What the middle column says. */
export function progressLine(item: DoingItem): string {
  if (item.status === 'ready') {
    const kept = item.quality ? `Kept in ${item.quality}` : 'Kept'
    return item.learned.length ? `${kept} · ${joinWords(item.learned)} learned` : kept
  }
  if (item.status === 'waiting' && item.retryInfo) {
    return `Trying again ${inLabel(item.retryInfo.at)} · attempt ${item.retryInfo.attempt} of ${item.retryInfo.of}`
  }
  const parts = [`Step ${item.step} of ${item.steps}`, item.stepLabel]
  if (item.percent !== null) parts.push(`${item.percent}%`)
  else if (item.step === 3 && item.quality) parts.push(`${item.quality} kept`)
  else if (item.playable) parts.push('plays now')
  return parts.join(' · ')
}

/** The bold line: the post's words, or what went wrong. */
export function headline(item: DoingItem): string {
  if (item.status === 'needs_you') {
    return item.step <= 3
      ? `Couldn’t keep this. ${item.reason ?? ''}`.trim()
      : (item.reason ?? item.title)
  }
  if (item.status === 'waiting' && item.reason) return `Waiting · ${item.reason.replace(/\.$/, '')}`
  return item.title
}

function statusLabel(item: DoingItem): {
  text: string
  tone: 'accent' | 'green' | 'muted' | 'red'
} {
  if (item.status === 'needs_you') return { text: 'Needs you', tone: 'red' }
  if (item.status === 'waiting') return { text: 'Waiting', tone: 'muted' }
  if (item.status === 'ready')
    return { text: `Ready · ${agoLabel(item.finishedAt)}`, tone: 'green' }
  if (item.playable) return { text: 'Playable · learning', tone: 'green' }
  return { text: WORKING[item.step] ?? item.stepLabel, tone: 'accent' }
}

const TONE = {
  accent: 'text-nx-accent',
  green: 'text-[#7fd1ae]',
  muted: 'text-[#c9bfab]',
  red: 'text-[#ff5a3c]',
}

function Steps({ item }: { item: DoingItem }) {
  const done = item.status === 'ready'
  return (
    <span aria-hidden className="grid grid-cols-7 gap-1">
      {Array.from({ length: item.steps }, (_, i) => {
        const n = i + 1
        const fill = done || n < item.step ? 100 : n === item.step ? (item.percent ?? 30) : 0
        const colour = done ? '#7fd1ae' : '#ffd23f'
        return (
          <span
            key={n}
            className="block h-1.5 rounded-[3px]"
            style={{
              background:
                fill >= 100
                  ? colour
                  : fill <= 0
                    ? '#4a453e'
                    : `linear-gradient(90deg, ${colour} ${fill}%, #4a453e ${fill}%)`,
            }}
          />
        )
      })}
    </span>
  )
}

function Row({
  item,
  onRetry,
  onLinkOnly,
  busy,
}: {
  item: DoingItem
  onRetry: (item: DoingItem) => void
  onLinkOnly: (item: DoingItem) => void
  busy: boolean
}) {
  const [broken, setBroken] = useState(false)
  const status = statusLabel(item)
  const who = item.savers.length ? saversLine(item.savers) : null
  const meta = [item.network, who, agoLabel(item.savedAt)].filter(Boolean).join(' · ')
  const problem = item.status === 'needs_you' || item.status === 'waiting'
  return (
    <li
      data-status={item.status}
      className={cn(
        'grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 rounded-[18px] p-2.5 pr-4 lg:grid-cols-[52px_minmax(0,1fr)_minmax(0,420px)_150px] lg:gap-y-2',
        item.status === 'ready' ? 'bg-[#151310]' : 'bg-[#1a1814]',
        item.status === 'needs_you' && 'border border-[#ff5a3c]/45',
        item.status === 'waiting' && 'border border-[#ff5a3c]/25',
      )}
    >
      {item.thumbnail && !broken && !problem ? (
        <img
          src={item.thumbnail}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className={cn(
            // In the row's corner: 18 − 10 leaves the 8 px floor.
            'row-span-2 h-[52px] w-[52px] rounded-[8px] object-cover lg:row-span-1',
            item.status === 'ready' && 'opacity-85',
          )}
        />
      ) : (
        <span
          aria-hidden
          className="row-span-2 flex h-[52px] w-[52px] items-center justify-center rounded-[8px] bg-[#262320] text-[#c9bfab] lg:row-span-1"
        >
          {problem ? <CloudOff className="h-5 w-5" /> : <ImageOff className="h-5 w-5" />}
        </span>
      )}
      <a href={item.openPath} className="flex min-w-0 flex-col gap-1 hover:opacity-90">
        <span className="truncate text-[15px] font-extrabold">{headline(item)}</span>
        <span className="truncate text-[13px] text-[#a39b8b]">{meta}</span>
      </a>
      <span
        className={cn(
          'col-start-2 justify-self-start whitespace-nowrap text-[13px] font-extrabold lg:order-last lg:col-start-auto lg:justify-self-end',
          TONE[status.tone],
        )}
      >
        {status.text}
      </span>
      <span className="col-span-2 flex min-w-0 flex-col gap-2 lg:col-span-1">
        {item.status === 'needs_you' && (item.retry || item.keepLinkOnly) ? (
          <span className="flex flex-wrap items-center gap-2">
            {item.retry && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onRetry(item)}
                className="inline-flex h-10 items-center gap-1.5 rounded-[8px] bg-nx-cream px-4 text-sm font-extrabold text-black disabled:opacity-50"
              >
                <RotateCw aria-hidden className="h-4 w-4" />
                <span>Retry</span>
              </button>
            )}
            {item.keepLinkOnly && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onLinkOnly(item)}
                className="inline-flex h-10 items-center whitespace-nowrap rounded-[8px] border border-[#4a453e] px-4 text-sm font-bold text-nx-cream disabled:opacity-50"
              >
                Keep the link only
              </button>
            )}
          </span>
        ) : item.status === 'needs_you' ? (
          <span className="text-[13px] text-[#c9bfab]">Whoever saved it can retry.</span>
        ) : (
          <>
            {item.status !== 'waiting' && <Steps item={item} />}
            <span className="truncate text-[13px] text-[#c9bfab]">{progressLine(item)}</span>
          </>
        )}
      </span>
    </li>
  )
}

function Tiles({ summary }: { summary: DoingSummary }) {
  const tile = 'flex flex-col gap-1 rounded-[18px] bg-[#1a1814] px-4 py-3.5'
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-3.5">
      <div className={tile}>
        <span className="text-[22px] font-extrabold md:text-[26px]">{`${summary.keeping} keeping`}</span>
        <span className="text-[13px] text-[#a39b8b]">copies on their way</span>
      </div>
      <div className={tile}>
        <span className="text-[22px] font-extrabold md:text-[26px]">{`${summary.learning} learning`}</span>
        <span className="text-[13px] text-[#a39b8b]">what it’s about</span>
      </div>
      <div className={tile}>
        <span className="text-[22px] font-extrabold md:text-[26px]">
          {freeLabel(summary.freeBytes)}
        </span>
        <span className="text-[13px] text-[#a39b8b]">on your server</span>
      </div>
      {summary.processing === 'remote' ? (
        <div
          className={cn(
            tile,
            'border',
            summary.remoteConnected ? 'border-[#7fd1ae]/35' : 'border-[#ff5a3c]/35',
          )}
        >
          <span className="flex items-center gap-2 text-[16px] font-extrabold md:text-[18px]">
            <span
              aria-hidden
              className={cn(
                'h-[9px] w-[9px] shrink-0 rounded-full',
                summary.remoteConnected ? 'bg-[#7fd1ae]' : 'bg-[#ff5a3c]',
              )}
            />
            <span>{summary.remoteConnected ? 'Mac helper connected' : 'Mac helper away'}</span>
          </span>
          <span className="text-[13px] text-[#a39b8b]">
            {summary.remoteConnected ? 'learning and converting' : 'learning waits for it'}
          </span>
        </div>
      ) : (
        <div className={tile}>
          <span className="flex items-center gap-2 text-[16px] font-extrabold md:text-[18px]">
            <CheckCircle aria-hidden className="h-[18px] w-[18px] text-[#7fd1ae]" />
            <span>{`${summary.ready} ready`}</span>
          </span>
          <span className="text-[13px] text-[#a39b8b]">in the last half hour</span>
        </div>
      )}
    </div>
  )
}

/** /doing: What your ADHX is doing. */
export function DoingScreen() {
  const [scope, setScope] = useState<DoingScope>('all')
  const { me, loading } = useAuthMe()
  const {
    items,
    summary,
    error: progressError,
    refresh,
  } = useDoing({
    scope,
    everyMs: DOING_POLL_MS,
    accountId: me?.user?.id,
    enabled: !loading && !!me?.authenticated,
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(item: DoingItem, path: 'retry' | 'link-only') {
    setBusy(`${item.platform}:${item.id}`)
    setError(null)
    try {
      const res = await fetch(`/api/activity/processing/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: item.platform, id: item.id }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error || 'That didn’t go through. Try again.')
      }
    } catch {
      setError('That didn’t go through. Try again.')
    } finally {
      setBusy(null)
      refresh()
    }
  }

  const remote = summary?.processing === 'remote'

  return (
    <div className="min-h-dvh bg-nx-ink font-nx-sans text-nx-cream">
      <NxHeader />
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 pb-16 pt-4 md:px-10 md:pt-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 font-nx-serif text-[38px] font-normal leading-[0.95] md:text-[44px]">
              What your ADHX is doing
            </h1>
            <p className="m-0 text-[15px] text-[#a39b8b]">
              {remote
                ? 'Keeping, converting and learning happen on your server and your Mac. Nothing goes anywhere else.'
                : 'Everything happens on your server. Nothing is sent anywhere.'}
            </p>
          </div>
          <span className="flex-1" />
          <div
            role="group"
            aria-label="Show"
            className="flex gap-1 self-start rounded-full bg-[#1a1814] p-1"
          >
            {SCOPES.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={scope === s.id}
                onClick={() => setScope(s.id)}
                className={cn(
                  'flex h-10 items-center gap-1.5 rounded-full px-4 text-sm',
                  scope === s.id
                    ? 'bg-nx-cream font-extrabold text-black'
                    : 'font-semibold text-nx-cream',
                )}
              >
                <span>{s.label}</span>
                {s.id === 'needs' && !!summary?.needsYou && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ff5a3c] px-1.5 text-[11px] font-extrabold text-black">
                    {summary.needsYou}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {summary && <Tiles summary={summary} />}

        {error && (
          <p role="alert" className="m-0 text-[14px] font-semibold text-[#ff8a7a]">
            {error}
          </p>
        )}

        {progressError && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#29231a] px-4 py-3 text-sm text-nx-cream"
          >
            <span>{progressError}</span>
            <button
              type="button"
              onClick={refresh}
              // 16 − 12 leaves the 8 px floor.
              className="min-h-11 rounded-[8px] border border-white/20 px-4 font-bold"
            >
              Try again
            </button>
          </div>
        )}
        {items === null && progressError ? null : items === null ? (
          <div aria-hidden className="flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="nx-shimmer animate-nx-shimmer block h-[72px] rounded-[18px]"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[22px] bg-[#1a1814] px-6 py-12 text-center">
            <Check aria-hidden className="h-8 w-8 text-[#7fd1ae]" strokeWidth={3} />
            <p className="m-0 font-nx-serif text-[30px] leading-none">
              {scope === 'needs' ? 'Nothing needs you.' : 'All kept, all learned.'}
            </p>
            <p className="m-0 text-[15px] text-[#a39b8b]">
              {scope === 'needs'
                ? 'Your ADHX sorted everything on its own.'
                : 'Your ADHX is having a little nap. Save something to wake it up.'}
            </p>
          </div>
        ) : (
          <ol aria-label="Posts on their way" className="m-0 flex list-none flex-col gap-2.5 p-0">
            {items.map((item) => (
              <Row
                key={`${item.platform}:${item.id}`}
                item={item}
                busy={busy === `${item.platform}:${item.id}`}
                onRetry={(i) => void act(i, 'retry')}
                onLinkOnly={(i) => void act(i, 'link-only')}
              />
            ))}
          </ol>
        )}
      </main>
    </div>
  )
}
