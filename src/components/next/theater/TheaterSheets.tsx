'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { articleHeadline, postCoverSrc, postText } from '../post'
import { NxImage } from '../primitives'
import { kindOf, resultKey, type SearchResultItem } from '../search/model'
import { isVideoItem } from './queue'

/**
 * A panel over the stage: a side panel on wide screens, a bottom sheet on
 * phones. Escape or the backdrop closes it; focus moves in and back out.
 */
export function Sheet({
  label,
  onClose,
  children,
  side = 'right',
}: {
  label: string
  onClose: () => void
  children: ReactNode
  /** Desktop placement: a full-height side panel or a small menu by the rail. */
  side?: 'right' | 'menu'
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
  }, [onClose])
  return (
    <>
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-black/50 md:bg-black/20"
      />
      <div
        ref={ref}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[78dvh] flex-col gap-3 overflow-y-auto rounded-t-[22px] bg-[#1c1b19]/[0.98] p-4 pb-[max(16px,env(safe-area-inset-bottom))] text-white shadow-[0_-10px_40px_rgba(0,0,0,0.5)] outline-none',
          side === 'right'
            ? 'md:inset-y-4 md:left-auto md:right-24 md:max-h-none md:w-[360px] md:rounded-[20px]'
            : 'md:inset-x-auto md:bottom-auto md:right-24 md:top-1/2 md:w-[280px] md:-translate-y-1/3 md:rounded-[14px] md:p-1.5',
        )}
      >
        <span
          aria-hidden
          className="mx-auto h-1 w-10 shrink-0 rounded-full bg-white/25 md:hidden"
        />
        {children}
      </div>
    </>
  )
}

type UpNextFilter = 'all' | 'videos' | 'posts'

export function UpNextSheet({
  items,
  current,
  onPlay,
  onClose,
}: {
  items: SearchResultItem[]
  current: number
  onPlay: (index: number) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState<UpNextFilter>('all')
  const upcoming = items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => index > current)
    .filter(({ item }) =>
      filter === 'all' ? true : filter === 'videos' ? isVideoItem(item) : !isVideoItem(item),
    )
  return (
    <Sheet label="Up next" onClose={onClose}>
      <div className="flex items-center gap-2">
        <h2 className="m-0 flex-1 text-lg font-bold">Up next</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <div role="group" aria-label="Show" className="flex gap-1.5">
        {(['all', 'videos', 'posts'] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'min-h-[34px] rounded-full px-3 text-[13px] font-semibold',
              filter === f ? 'bg-white text-black' : 'bg-[#2e2c29] text-[#ddd]',
            )}
          >
            {f === 'all' ? 'All' : f === 'videos' ? 'Videos' : 'Posts'}
          </button>
        ))}
      </div>
      {upcoming.length === 0 ? (
        <p className="m-0 py-6 text-center text-sm text-white/60">Nothing else queued.</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
          {upcoming.map(({ item, index }) => {
            const cover = postCoverSrc(item.post)
            const kind = kindOf(item)
            const text = kind === 'article' ? articleHeadline(item.post) : postText(item.post)
            return (
              <li key={resultKey(item)}>
                <button
                  type="button"
                  onClick={() => onPlay(index)}
                  aria-label={`Play ${text || item.post.author}`}
                  className="relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-nx-surface text-left"
                >
                  {cover ? (
                    <NxImage
                      src={cover}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <span className="absolute inset-0 overflow-hidden bg-nx-cream p-3 font-nx-serif text-[15px] leading-[1.15] text-nx-ink">
                      {text}
                    </span>
                  )}
                  <span className="nx-plate absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold">
                    {String(index + 1)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Sheet>
  )
}

export interface MenuRow {
  label: string
  /** Shown on the right (e.g. On / Off, the repeat mode). */
  value?: string
  checked?: boolean
  danger?: boolean
  onSelect: () => void
}

export function MoreSheet({ rows, onClose }: { rows: MenuRow[]; onClose: () => void }) {
  return (
    <Sheet label="Options" onClose={onClose} side="menu">
      <div role="menu" aria-label="Options" className="flex flex-col">
        {rows.map((row) => (
          <button
            key={row.label}
            type="button"
            role={row.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={row.checked === undefined ? undefined : row.checked}
            onClick={row.onSelect}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-left text-[15px] hover:bg-white/[0.06]',
              row.danger ? 'text-[#ff8a7a]' : 'text-white',
            )}
          >
            <span className="flex-1">{row.label}</span>
            {row.value && (
              <span
                className={cn(
                  'text-[13px] font-semibold',
                  row.checked || row.value === 'All' || row.value === 'This post'
                    ? 'text-nx-accent'
                    : 'text-white/50',
                )}
              >
                {row.value}
              </span>
            )}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
