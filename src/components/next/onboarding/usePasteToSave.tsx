'use client'

import { useAuthMe } from '@/components/auth'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ClipboardPaste } from 'lucide-react'
import { cn } from '@/lib/utils'
import { detectPlatformPost } from '@/lib/platform/url'
import { navigateToAppPath } from '@/lib/theater/navigate-app-path'
import { PasteToast } from '../loader'
import { useBusyLogo } from '../logo-busy'

/**
 * Paste a post link anywhere (outside a text field) — or tap Paste — and it
 * is saved: the face "grabs it", then the toast offers to play it. X,
 * Instagram and TikTok links work (whatever
 * `/api/bookmarks/add` accepts).
 */

export interface PastedPost {
  key: string
  platform: string
  id: string
  author: string | null
  duplicate: boolean
}

type Toast =
  | { state: 'grabbing'; url: string }
  | { state: 'saved'; post: PastedPost }
  | { state: 'failed'; message?: string; signIn?: boolean; watchPath?: string }

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i
const FAILED_MS = 3_500
const SAVED_MS = 6_000

/** The first link in pasted text, if it looks like something we could save. */
export function linkFromText(text: string): string | null {
  const match = URL_IN_TEXT.exec(text.trim())
  if (!match) return null
  const url = match[0].replace(/[),.;!?]+$/, '')
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
  )
}

export function usePasteToSave({
  onSaved,
  savedAction,
}: {
  /** Called once a post is saved (or was already saved). */
  onSaved?: (post: PastedPost) => void
  /** The button on the "saved" toast. */
  savedAction?: (post: PastedPost) => { label: string; onClick: () => void }
}): { toast: ReactNode; pasteFromClipboard: () => void; save: (url: string) => void } {
  const [toast, setToast] = useState<Toast | null>(null)
  useBusyLogo('paste', toast?.state === 'grabbing')
  const [prompt, setPrompt] = useState(false)
  const hideTimer = useRef<number | null>(null)
  const busy = useRef(false)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  const show = useCallback((next: Toast | null, hideAfter?: number) => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    setToast(next)
    if (hideAfter) hideTimer.current = window.setTimeout(() => setToast(null), hideAfter)
  }, [])

  const save = useCallback(
    async (url: string) => {
      if (busy.current) return
      busy.current = true
      setPrompt(false)
      show({ state: 'grabbing', url })
      try {
        const res = await fetch('/api/bookmarks/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, source: 'manual' }),
        })
        if (res.status === 401) {
          show({ state: 'failed', message: 'Sign in to save posts', signIn: true }, FAILED_MS * 2)
          return
        }
        const data = (await res.json().catch(() => null)) as {
          success?: boolean
          isDuplicate?: boolean
          platform?: string
          bookmark?: { id?: string; author?: string }
          error?: string
        } | null
        const detected = detectPlatformPost(url)
        const id = data?.bookmark?.id ?? detected?.id
        const platform = data?.platform ?? detected?.platform
        if (!res.ok || !id || !platform || !(data?.success || data?.isDuplicate)) {
          // Saving failed, but the post may still play: offer it.
          show(
            { state: 'failed', message: data?.error, watchPath: detected?.previewPath },
            FAILED_MS * 2,
          )
          return
        }
        const post: PastedPost = {
          key: `${platform}:${id}`,
          platform,
          id,
          author: data?.bookmark?.author ?? detected?.author ?? null,
          duplicate: !!data?.isDuplicate,
        }
        show({ state: 'saved', post }, SAVED_MS)
        onSavedRef.current?.(post)
      } catch {
        show({ state: 'failed', watchPath: detectPlatformPost(url)?.previewPath }, FAILED_MS * 2)
      } finally {
        busy.current = false
      }
    },
    [show],
  )

  // Paste anywhere that isn't a text field.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return
      const url = linkFromText(e.clipboardData?.getData('text') ?? '')
      if (!url) return
      e.preventDefault()
      void save(url)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [save])

  const pasteFromClipboard = useCallback(() => {
    if (!navigator.clipboard?.readText) {
      setPrompt(true)
      return
    }
    navigator.clipboard
      .readText()
      .then((text) => {
        const url = linkFromText(text)
        if (url) void save(url)
        else show({ state: 'failed', message: 'Copy a post link first, then tap Paste' }, FAILED_MS)
      })
      // Clipboard access refused: let them paste into a box instead.
      .catch(() => setPrompt(true))
  }, [save, show])

  const node = (
    <div className="pointer-events-none fixed inset-x-0 top-[max(64px,calc(env(safe-area-inset-top)+56px))] z-[60] flex justify-center px-4">
      {prompt && !toast && (
        <form
          className="pointer-events-auto flex w-full max-w-[380px] items-center gap-2 rounded-2xl bg-nx-surface/[.97] p-2 font-nx-sans shadow-nx-toast"
          onSubmit={(e) => {
            e.preventDefault()
            const value = new FormData(e.currentTarget).get('link')
            const url = linkFromText(typeof value === 'string' ? value : '')
            if (url) void save(url)
          }}
        >
          <label htmlFor="nx-paste-link" className="sr-only">
            Paste a post link
          </label>
          <input
            id="nx-paste-link"
            name="link"
            autoFocus
            placeholder="Paste a post link"
            className="h-10 min-w-0 flex-1 rounded-xl bg-black px-3 text-[15px] text-white outline-none"
          />
          <button
            type="submit"
            className="h-10 rounded-full bg-nx-accent px-4 text-sm font-extrabold text-black"
          >
            Save
          </button>
        </form>
      )}
      {toast && (
        <div className="pointer-events-auto w-full max-w-[380px]">
          {toast.state === 'grabbing' && <PasteToast state="grabbing" url={toast.url} />}
          {toast.state === 'saved' && (
            <PasteToast
              state="saved"
              savedDetail={
                toast.post.duplicate
                  ? `${toast.post.author ? `@${toast.post.author} · ` : ''}already in your saves`
                  : toast.post.author
                    ? `@${toast.post.author}`
                    : undefined
              }
              action={savedAction?.(toast.post)}
            />
          )}
          {toast.state === 'failed' &&
            (toast.signIn ? (
              <div
                role="status"
                className="flex items-center gap-3 rounded-2xl bg-nx-surface/[.97] py-2.5 pl-4 pr-2.5 font-nx-sans text-white shadow-nx-toast"
              >
                <span className="flex-1 text-[15px] font-bold">{toast.message}</span>
                <a
                  href="/start"
                  className="h-9 rounded-full bg-nx-accent px-3.5 text-[13px] font-extrabold leading-9 text-black"
                >
                  Sign in
                </a>
              </div>
            ) : toast.watchPath ? (
              <div
                role="status"
                className="flex items-center gap-3 rounded-2xl bg-nx-surface/[.97] py-2.5 pl-4 pr-2.5 font-nx-sans text-white shadow-nx-toast"
              >
                <span className="flex-1 text-[15px] font-bold">
                  {toast.message ? `Couldn’t save it: ${toast.message}` : 'Couldn’t save it'}
                </span>
                <button
                  type="button"
                  onClick={() => toast.watchPath && navigateToAppPath(toast.watchPath)}
                  className="h-9 shrink-0 rounded-full bg-nx-accent px-3.5 text-[13px] font-extrabold text-black"
                >
                  Watch it anyway
                </button>
              </div>
            ) : (
              <PasteToast state="failed" />
            ))}
        </div>
      )}
    </div>
  )

  return { toast: node, pasteFromClipboard, save: (url: string) => void save(url) }
}

/** The yellow Paste pill. */
export function PasteButton({ onClick, className }: { onClick: () => void; className?: string }) {
  // Saving needs an account; signed out, the header offers Sign in instead.
  const { me, loading } = useAuthMe()
  if (!loading && !me?.authenticated) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-[38px] shrink-0 items-center gap-1.5 rounded-full bg-nx-accent px-3 text-sm font-extrabold text-black',
        className,
      )}
    >
      <ClipboardPaste aria-hidden className="h-4 w-4" strokeWidth={2.2} />
      <span>Paste</span>
    </button>
  )
}
