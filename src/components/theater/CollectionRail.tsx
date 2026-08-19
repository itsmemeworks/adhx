'use client'

/**
 * The Collection theater's rail (docs/specs/theater-first.md §3, PR 3): tabs
 * **Collection ↔ Live**. Collection tab shows the unread queue + Keep / Done /
 * Delete / Send actions (mirroring `TriageMode`'s exact semantics — see
 * `CollectionTheater.tsx`); Live tab swaps in the public community pulse with
 * Save / Copy / Open actions. Purely presentational — all data/mutation logic
 * lives in `CollectionTheater`, matching the `Rail`/`UpNextList` split those
 * components use (this file intentionally does NOT edit or import them: the
 * two rails serve different data models — read/unread + Keep/Done/Delete vs.
 * seen/unseen + Save/Copy/Open — so a shared component would need to branch
 * on tab everywhere anyway).
 */

import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Clock,
  Trash2,
  Flame,
  PartyPopper,
  Undo2,
  Copy,
  ExternalLink,
  Loader2,
  Send,
  Play,
  Image as ImageIcon,
  Type as TypeIcon,
  FileText,
  Quote,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { PlatformGlyph, type ContentType } from '@/components/matter'
import { inferType } from '@/lib/trending/filter'
import { theaterItemKey } from './types'
import { useSendFile } from './useSendFile'
import type { TheaterItem } from './types'

export type CollectionTab = 'collection' | 'live'

export interface UndoState {
  type: 'archive' | 'keep' | 'delete'
}

export interface CollectionRailProps {
  tab: CollectionTab
  onTabChange: (tab: CollectionTab) => void

  // --- Collection tab ---
  queue: TheaterItem[]
  currentIndex: number
  current: TheaterItem | null
  remaining: number
  total: number
  finished: boolean
  streak: { current: number; longest: number }
  onSelect: (index: number) => void
  onKeep: () => void
  onDone: () => void
  onDelete: () => void
  undo: UndoState | null
  onUndo: () => void
  onCloseFinished: () => void

  // --- Live tab ---
  liveItems: TheaterItem[]
  liveCurrentKey: string | null
  liveLoading: boolean
  onLiveSelect: (key: string) => void
  onLiveSave: (item: TheaterItem) => void
  savedKeys: ReadonlySet<string>
}

const TYPE_TILE: Record<ContentType, { bg: string; icon: React.ComponentType<{ size?: number }> }> =
  {
    video: { bg: 'bg-type-video/15 text-type-video', icon: Play },
    photo: { bg: 'bg-type-photo/15 text-type-photo', icon: ImageIcon },
    text: { bg: 'bg-type-text/15 text-type-text', icon: TypeIcon },
    article: { bg: 'bg-type-article/15 text-type-article', icon: FileText },
    quote: { bg: 'bg-type-quote/15 text-type-quote', icon: Quote },
  }

function Thumb({ item }: { item: TheaterItem }) {
  const type = inferType(item)
  const tile = TYPE_TILE[type]
  const Icon = tile.icon
  return (
    <div className="relative h-12 w-[72px] flex-none overflow-hidden rounded-md bg-inset">
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className={cn('flex h-full w-full items-center justify-center', tile.bg)}>
          <Icon size={16} />
        </div>
      )}
    </div>
  )
}

function TabBar({
  tab,
  onTabChange,
}: {
  tab: CollectionTab
  onTabChange: (t: CollectionTab) => void
}) {
  return (
    <div className="flex-none border-b border-hairline px-5 pt-5 pb-3">
      <div className="inline-flex rounded-full bg-inset p-1 text-[12.5px] font-semibold">
        {(['collection', 'live'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTabChange(t)}
            aria-current={tab === t ? 'true' : undefined}
            className={cn(
              'rounded-full px-4 py-1.5 capitalize transition-colors',
              tab === t ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}

function CollectionRow({
  item,
  isCurrent,
  onSelect,
}: {
  item: TheaterItem
  isCurrent: boolean
  onSelect: () => void
}) {
  const caption = (item.text || '').trim()
  const handle = item.author ? item.author.replace(/^@+/, '') : ''
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isCurrent ? 'true' : undefined}
      className={cn(
        'group flex w-full items-start gap-2.5 rounded-lg border-l-2 px-2.5 py-2.5 text-left transition-colors',
        isCurrent ? 'border-clay bg-inset' : 'border-transparent hover:bg-inset/60',
      )}
    >
      <Thumb item={item} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <PlatformGlyph platform={item.platform} size={11} className="text-ink-3 flex-none" />
          <span className="font-mono text-[10.5px] text-ink-3" suppressHydrationWarning>
            {formatCompactRelativeTime(item.createdAt)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink">
          {caption || (handle ? `@${handle}` : 'Saved post')}
        </p>
      </div>
    </button>
  )
}

function LiveRow({
  item,
  isCurrent,
  onSelect,
}: {
  item: TheaterItem
  isCurrent: boolean
  onSelect: () => void
}) {
  const caption = (item.text || '').trim()
  const handle = item.author ? item.author.replace(/^@+/, '') : ''
  const trendCount = item.trendCount ?? item.saveCount ?? 0
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isCurrent ? 'true' : undefined}
      className={cn(
        'group flex w-full items-start gap-2.5 rounded-lg border-l-2 px-2.5 py-2.5 text-left transition-colors',
        isCurrent ? 'border-clay bg-inset' : 'border-transparent hover:bg-inset/60',
      )}
    >
      <Thumb item={item} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <PlatformGlyph platform={item.platform} size={11} className="text-ink-3 flex-none" />
          <span className="font-mono text-[10.5px] text-ink-3" suppressHydrationWarning>
            {formatCompactRelativeTime(item.createdAt)}
          </span>
          {trendCount >= 2 && (
            <span className="ml-auto inline-flex flex-none items-center gap-1 text-[10.5px] font-bold text-flame">
              <Flame size={10} fill="currentColor" />
              {trendCount}
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-ink">
          {caption || (handle ? `@${handle}` : 'Saved post')}
        </p>
      </div>
    </button>
  )
}

function CollectionActions({
  current,
  onKeep,
  onDone,
  onDelete,
}: {
  current: TheaterItem | null
  onKeep: () => void
  onDone: () => void
  onDelete: () => void
}) {
  const { supported: sendSupported, sending, send } = useSendFile(current)
  const buttonBase =
    'inline-flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border border-hairline bg-inset text-[11.5px] font-semibold text-ink-2 transition-colors hover:bg-surface'

  return (
    <div className="flex-none border-b border-hairline px-5 py-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onKeep} aria-label="Later" className={buttonBase}>
          <Clock size={17} />
          Later
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete"
          className={cn(buttonBase, 'text-ink-2')}
        >
          <Trash2 size={17} />
          Delete
        </button>
        <button
          type="button"
          onClick={onDone}
          aria-label="Done"
          className={cn(buttonBase, 'border-transparent bg-done/15 text-done hover:bg-done/25')}
        >
          <Check size={17} />
          Done
        </button>
        {sendSupported && (
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            aria-label="Send"
            className={cn(buttonBase, 'disabled:opacity-60')}
          >
            {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
            Send
          </button>
        )}
      </div>
    </div>
  )
}

function LiveActions({
  current,
  saved,
  onSave,
}: {
  current: TheaterItem | null
  saved: boolean
  onSave: (item: TheaterItem) => void
}) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { supported: sendSupported, sending, send } = useSendFile(current)

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    [],
  )

  if (!current) return null

  const buttonBase =
    'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-hairline bg-inset px-3 text-[12.5px] font-semibold text-ink transition-colors hover:bg-surface'
  const primaryBase =
    'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-clay-grad px-3 text-[12.5px] font-semibold text-white shadow-glow transition-opacity hover:opacity-90'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(new URL(current.url, window.location.origin).toString())
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard denied/insecure context — nothing actionable to surface.
    }
  }

  return (
    <div className="flex-none border-b border-hairline px-5 py-3">
      <div className="flex items-center gap-2">
        {sendSupported && (
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending}
            className={cn(buttonBase, 'disabled:opacity-60')}
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send
          </button>
        )}
        <button type="button" onClick={handleCopy} className={buttonBase}>
          {copied ? <Check size={14} className="text-done" /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Link'}
        </button>
        <button
          type="button"
          onClick={() => onSave(current)}
          disabled={saved}
          className={cn(primaryBase, 'disabled:opacity-60')}
        >
          {saved ? <Check size={14} /> : null}
          {saved ? 'Saved' : 'Save'}
        </button>
        <a
          href={current.url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonBase}
          title="Open"
        >
          <ExternalLink size={14} />
          Open
        </a>
      </div>
    </div>
  )
}

function FinishedPanel({
  total,
  streak,
  onClose,
}: {
  total: number
  streak: { current: number; longest: number }
  onClose: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <PartyPopper className="h-10 w-10 text-clay" />
      <h2 className="font-serif text-xl font-semibold text-ink">
        {total > 0 ? 'Backlog cleared!' : 'Nothing to triage'}
      </h2>
      {total > 0 ? (
        <p className="text-sm text-ink-2">
          You processed {total} {total === 1 ? 'item' : 'items'}.
        </p>
      ) : (
        <p className="text-sm text-ink-2">Your unread queue is empty. Nice.</p>
      )}
      {streak.current > 0 && (
        <p className="flex items-center justify-center gap-1.5 font-semibold text-flame">
          <Flame className="h-4 w-4" fill="currentColor" /> {streak.current}-day streak
        </p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="mt-2 rounded-full bg-clay-grad px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90"
      >
        Done
      </button>
    </div>
  )
}

export function CollectionRail({
  tab,
  onTabChange,
  queue,
  currentIndex,
  current,
  remaining,
  total,
  finished,
  streak,
  onSelect,
  onKeep,
  onDone,
  onDelete,
  undo,
  onUndo,
  onCloseFinished,
  liveItems,
  liveCurrentKey,
  liveLoading,
  onLiveSelect,
  onLiveSave,
  savedKeys,
}: CollectionRailProps) {
  const progress = total ? (Math.min(currentIndex, total) / total) * 100 : 0

  return (
    <div className="flex h-full w-full flex-col bg-surface text-ink lg:h-full lg:w-[360px] lg:border-l lg:border-hairline xl:w-[400px]">
      <TabBar tab={tab} onTabChange={onTabChange} />

      {tab === 'collection' ? (
        finished ? (
          <FinishedPanel total={total} streak={streak} onClose={onCloseFinished} />
        ) : (
          <>
            <div className="flex-none px-5 pb-3 pt-1">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium text-ink-2">{remaining} left</span>
                <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-hairline">
                  <div
                    className="h-full bg-clay-grad transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {streak.current > 0 && (
                  <span className="inline-flex flex-none items-center gap-1 text-xs font-semibold text-flame">
                    <Flame size={13} fill="currentColor" />
                    {streak.current}
                  </span>
                )}
              </div>
              {undo && (
                <div className="mt-2 flex items-center gap-2 text-xs text-ink-2">
                  <span>
                    {undo.type === 'archive'
                      ? 'Done'
                      : undo.type === 'delete'
                        ? 'Deleted'
                        : 'Later'}
                  </span>
                  <button
                    type="button"
                    onClick={onUndo}
                    className="inline-flex items-center gap-1 font-semibold text-clay"
                  >
                    <Undo2 size={12} /> Undo
                  </button>
                </div>
              )}
            </div>

            <CollectionActions
              current={current}
              onKeep={onKeep}
              onDone={onDone}
              onDelete={onDelete}
            />

            <div className="flex min-h-0 flex-1 flex-col">
              <h2 className="flex-none px-5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-3">
                Queue
              </h2>
              <div className="flex-1 overflow-y-auto">
                <div className="flex flex-col gap-1 px-2">
                  {queue.map((item, i) => (
                    <CollectionRow
                      key={theaterItemKey(item)}
                      item={item}
                      isCurrent={i === currentIndex}
                      onSelect={() => onSelect(i)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )
      ) : (
        <>
          <LiveActions
            current={current}
            saved={!!current && savedKeys.has(theaterItemKey(current))}
            onSave={onLiveSave}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            <h2 className="flex-none px-5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-3">
              Live
            </h2>
            <div className="flex-1 overflow-y-auto">
              {liveLoading && liveItems.length === 0 ? (
                <div className="px-5 py-6 text-sm text-ink-3">Loading…</div>
              ) : (
                <div className="flex flex-col gap-1 px-2">
                  {liveItems.map((item) => (
                    <LiveRow
                      key={theaterItemKey(item)}
                      item={item}
                      isCurrent={theaterItemKey(item) === liveCurrentKey}
                      onSelect={() => onLiveSelect(theaterItemKey(item))}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
