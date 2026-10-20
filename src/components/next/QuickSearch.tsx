'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SEARCH_SUGGESTIONS, readRecent, rememberRecent } from './search/model'

/**
 * Search the moment you tap it. Desktop headers have a real field
 * (`HeaderSearch`); on phones the search buttons open `QuickSearch`, a sheet
 * whose field is always on the page so it can take focus inside the tap,
 * which is what brings up the keyboard (iOS won't after a page load).
 */

let quickField: HTMLInputElement | null = null
const OPEN = 'nx-quick-search-open'

export function searchUrl(q: string): string {
  return `/search?${new URLSearchParams({ q: q.trim() })}`
}

/** Focus a search field right now: the Search page's own, else the quick one. Call from a tap. */
export function openQuickSearch(): void {
  const own = document.getElementById('nx-search') as HTMLInputElement | null
  if (own) {
    own.focus()
    own.select()
    window.scrollTo({ top: 0 })
    return
  }
  quickField?.focus()
  window.dispatchEvent(new Event(OPEN))
}

/** Desktop: the header's search field (`/` focuses it). */
export function focusHeaderSearch(): void {
  const field = document.getElementById('nx-header-search') as HTMLInputElement | null
  if (field && field.offsetParent !== null) field.focus()
  else openQuickSearch()
}

/** The phone search sheet. Rendered once per page (with the tab bar). */
export function QuickSearch() {
  const router = useRouter()
  const field = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    quickField = field.current
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN, onOpen)
    return () => {
      window.removeEventListener(OPEN, onOpen)
      if (quickField === field.current) quickField = null
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setRecent(readRecent())
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const close = () => {
    setOpen(false)
    field.current?.blur()
  }
  const go = (query: string) => {
    if (!query.trim()) return
    rememberRecent(query)
    close()
    setQ('')
    router.push(searchUrl(query))
  }

  return (
    <div
      role="dialog"
      aria-label="Search"
      aria-hidden={!open}
      className={cn(
        'fixed inset-0 z-[70] flex flex-col bg-nx-ink font-nx-sans text-nx-cream transition-opacity duration-150',
        open ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          go(q)
        }}
        className="flex items-center gap-2 border-b border-nx-hairline px-3 pb-3 pt-[max(12px,env(safe-area-inset-top))]"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-nx-surface pl-3 pr-1">
          <Search aria-hidden className="h-[18px] w-[18px] shrink-0 text-nx-soft" />
          <label htmlFor="nx-quick-search" className="sr-only">
            Describe what you’re looking for
          </label>
          <input
            ref={field}
            id="nx-quick-search"
            type="search"
            value={q}
            tabIndex={open ? 0 : -1}
            autoComplete="off"
            enterKeyHint="search"
            maxLength={200}
            placeholder="Describe it…"
            onFocus={() => setOpen(true)}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 min-w-0 flex-1 appearance-none bg-transparent text-base text-nx-cream outline-none placeholder:text-nx-muted [&::-webkit-search-cancel-button]:hidden"
          />
        </span>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={close}
          className="h-11 shrink-0 px-1 text-[15px] text-nx-cream"
        >
          Cancel
        </button>
      </form>
      <div className="flex flex-col gap-6 overflow-y-auto px-4 py-5">
        {recent.length > 0 && (
          <section aria-label="Recent searches" className="flex flex-col gap-1">
            <span className="text-xs font-extrabold uppercase tracking-[1.2px] text-nx-muted">
              Recent
            </span>
            {recent.map((r) => (
              <button
                key={r}
                type="button"
                tabIndex={open ? 0 : -1}
                onClick={() => go(r)}
                className="flex min-h-11 items-center gap-3 text-left text-[15px]"
              >
                <Clock aria-hidden className="h-4 w-4 shrink-0 text-nx-muted" />
                <span className="truncate">{r}</span>
              </button>
            ))}
          </section>
        )}
        <section aria-label="Try" className="flex flex-col gap-2">
          <span className="text-xs font-extrabold uppercase tracking-[1.2px] text-nx-muted">
            Try describing
          </span>
          <span className="flex flex-wrap gap-2">
            {SEARCH_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                tabIndex={open ? 0 : -1}
                onClick={() => go(s)}
                className="rounded-full border border-nx-hairline px-3.5 py-2 text-left text-sm text-nx-soft"
              >
                {s}
              </button>
            ))}
          </span>
        </section>
      </div>
    </div>
  )
}

/**
 * The header's search: a field you type into on desktop (Enter searches, `/`
 * focuses it), a button that opens the search sheet on phones.
 */
export function HeaderSearch({
  className,
  shortcut = false,
}: {
  className?: string
  /** The page handles `/` itself (the theater); otherwise this field does. */
  shortcut?: boolean
}) {
  const router = useRouter()
  // Uncontrolled, and a real GET form to /search: whatever someone types
  // before the page's script starts survives, and Enter still searches.
  const field = useRef<HTMLInputElement>(null)
  const [hasText, setHasText] = useState(false)

  useEffect(() => {
    if (shortcut) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
      )
        return
      const input = field.current
      if (!input || input.offsetParent === null) return
      e.preventDefault()
      input.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcut])

  return (
    <>
      <button
        type="button"
        aria-label="Search"
        onClick={openQuickSearch}
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-nx-surface text-nx-cream md:hidden',
          className,
        )}
      >
        <Search aria-hidden className="h-[18px] w-[18px]" />
      </button>
      <form
        role="search"
        action="/search"
        method="get"
        onSubmit={(e) => {
          e.preventDefault()
          const q = field.current?.value.trim() ?? ''
          if (!q) return
          rememberRecent(q)
          router.push(searchUrl(q))
        }}
        className={cn(
          'hidden h-11 w-[340px] min-w-[140px] shrink items-center gap-2.5 rounded-full border border-white/[0.08] bg-nx-surface pl-4 pr-2 text-nx-muted focus-within:border-nx-accent md:flex',
          className,
        )}
      >
        <Search aria-hidden className="h-[18px] w-[18px] shrink-0" />
        <label htmlFor="nx-header-search" className="sr-only">
          Search everyone’s saves
        </label>
        <input
          ref={field}
          id="nx-header-search"
          name="q"
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={200}
          placeholder="Search everyone’s saves"
          onInput={(e) => setHasText(!!e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.currentTarget.value = ''
              setHasText(false)
              e.currentTarget.blur()
            }
          }}
          className="h-full min-w-0 flex-1 appearance-none bg-transparent text-[15px] text-nx-cream outline-none placeholder:text-nx-muted [&::-webkit-search-cancel-button]:hidden"
        />
        {!hasText && (
          <span
            aria-hidden
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#262320] text-[13px] font-semibold text-nx-soft"
          >
            /
          </span>
        )}
      </form>
    </>
  )
}
