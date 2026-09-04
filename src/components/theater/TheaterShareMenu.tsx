'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Download, Link2, Loader2, Send, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ContentType } from '@/components/matter'
import type { SendFile } from './useSendFile'
import { fileSendCopy, textCopyAction } from './send-action'
import { THEATER_SHORTCUT_KEYS } from './theater-shortcuts'

const MENU_ITEM =
  'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-semibold text-white transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-50'

export function TheaterShareMenu({
  open,
  onOpenChange,
  kind,
  actionKey,
  hasText,
  textCopied,
  sendFile,
  onCopyText,
  onShareLink,
  alignTop = false,
  triggerClassName,
  variant = 'mobile',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: ContentType | null
  actionKey: string | null
  hasText: boolean
  textCopied: boolean
  sendFile: SendFile
  onCopyText: () => boolean | Promise<boolean>
  onShareLink: () => boolean | Promise<boolean>
  alignTop?: boolean
  triggerClassName?: string
  variant?: 'mobile' | 'desktop'
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const skipFocusRestoreRef = useRef(false)
  const completedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [completedActionKey, setCompletedActionKey] = useState<string | null>(null)
  const actionComplete = completedActionKey !== null && completedActionKey === actionKey
  const fileAction = fileSendCopy(kind)
  const copyAction = textCopyAction(kind)
  const mediaLabel = kind === 'photo' ? 'photo' : 'video'
  const desktop = variant === 'desktop'

  useEffect(
    () => () => {
      if (completedTimeoutRef.current) clearTimeout(completedTimeoutRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!open) return

    const items = () =>
      [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].filter(
        (item) => !(item instanceof HTMLButtonElement && item.disabled),
      )
    items()[0]?.focus({ preventScroll: true })

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        skipFocusRestoreRef.current = true
        onOpenChange(false)
      }
    }
    const focusAt = (index: number) => {
      const options = items()
      if (options.length === 0) return
      options[(index + options.length) % options.length]?.focus({ preventScroll: true })
    }
    const tabTarget = (backward: boolean) => {
      const trigger = triggerRef.current
      if (!trigger) return undefined
      const candidates = [
        ...document.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((candidate) => !rootRef.current?.contains(candidate))
      if (backward) {
        return candidates
          .filter((candidate) =>
            Boolean(trigger.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_PRECEDING),
          )
          .at(-1)
      }
      return candidates.find((candidate) =>
        Boolean(trigger.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING),
      )
    }
    const onKeyDownCapture = (event: KeyboardEvent) => {
      const swallow = () => {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      if (event.key === 'Escape') {
        swallow()
        onOpenChange(false)
        return
      }

      const options = items()
      const currentIndex = options.findIndex((item) => item === document.activeElement)
      if (event.key === 'Tab') {
        swallow()
        const target = tabTarget(event.shiftKey)
        skipFocusRestoreRef.current = true
        onOpenChange(false)
        queueMicrotask(() => target?.focus({ preventScroll: true }))
        return
      }
      if (event.key === 'ArrowDown') {
        swallow()
        focusAt(currentIndex >= 0 ? currentIndex + 1 : 0)
        return
      }
      if (event.key === 'ArrowUp') {
        swallow()
        focusAt(currentIndex >= 0 ? currentIndex - 1 : options.length - 1)
        return
      }

      const fromMenu = event.target instanceof Node && menuRef.current?.contains(event.target)
      if (fromMenu && (event.key === 'Enter' || event.key === ' ')) return
      if (THEATER_SHORTCUT_KEYS.has(event.key)) swallow()
    }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDownCapture, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDownCapture, true)
      if (skipFocusRestoreRef.current) {
        skipFocusRestoreRef.current = false
      } else if (triggerRef.current?.isConnected) {
        triggerRef.current.focus({ preventScroll: true })
      }
    }
  }, [open, onOpenChange])

  const markComplete = (completedKey: string | null) => {
    setCompletedActionKey(completedKey)
    if (completedTimeoutRef.current) clearTimeout(completedTimeoutRef.current)
    completedTimeoutRef.current = setTimeout(() => setCompletedActionKey(null), 1600)
  }

  const run = async (action: () => boolean | Promise<boolean>) => {
    const startedForKey = actionKey
    onOpenChange(false)
    try {
      if (await action()) markComplete(startedForKey)
    } catch {
      // The chosen action did not complete; leave the Share glyph unchanged.
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', !desktop && 'order-3')}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label="Share"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn('inline-flex items-center justify-center', triggerClassName)}
      >
        {actionComplete ? (
          <Check size={desktop ? 14 : 16} className="text-done" />
        ) : (
          <Share2 size={desktop ? 14 : 16} />
        )}
        {desktop ? <span>Share</span> : null}
        <span className="sr-only" role="status" aria-live="polite">
          {actionComplete ? 'Share action completed' : ''}
        </span>
      </button>

      <div
        ref={menuRef}
        role="menu"
        aria-label="Share options"
        aria-hidden={!open}
        className={cn(
          'absolute w-48 rounded-2xl border border-white/15 bg-[#121117]/95 p-1.5 text-white shadow-[0_16px_50px_rgba(0,0,0,.45)] backdrop-blur-xl transition-[opacity,transform] duration-150',
          desktop
            ? 'bottom-[calc(100%+0.6rem)] right-0'
            : cn('right-[calc(100%+0.6rem)]', alignTop ? 'top-0' : 'top-1/2 -translate-y-1/2'),
          open
            ? 'pointer-events-auto translate-x-0 opacity-100'
            : 'pointer-events-none invisible translate-x-2 opacity-0',
        )}
      >
        {hasText ? (
          <button
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => void run(onCopyText)}
            onKeyDown={(event) => event.stopPropagation()}
            className={MENU_ITEM}
            data-theater-action="copy"
          >
            {textCopied ? <Check size={17} className="text-done" /> : <copyAction.Icon size={17} />}
            <span>{textCopied ? copyAction.copiedLabel : copyAction.title}</span>
          </button>
        ) : null}

        {sendFile.supported ? (
          <button
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => void run(sendFile.download)}
            onKeyDown={(event) => event.stopPropagation()}
            className={MENU_ITEM}
            data-theater-action="download"
          >
            <Download size={17} />
            <span>{fileAction.title}</span>
          </button>
        ) : null}

        {sendFile.supported && sendFile.mode === 'share' ? (
          <button
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            disabled={sendFile.sending}
            onClick={() => void run(sendFile.send)}
            onKeyDown={(event) => event.stopPropagation()}
            className={MENU_ITEM}
          >
            {sendFile.sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
            <span>
              {sendFile.sending
                ? `Getting ${mediaLabel}`
                : sendFile.primed
                  ? `Share ${mediaLabel} — tap again`
                  : `Share ${mediaLabel}`}
            </span>
          </button>
        ) : null}

        <button
          type="button"
          role="menuitem"
          tabIndex={open ? 0 : -1}
          onClick={() => void run(onShareLink)}
          onKeyDown={(event) => event.stopPropagation()}
          className={MENU_ITEM}
          data-theater-action="link"
        >
          <Link2 size={17} />
          <span>Share link</span>
        </button>
      </div>
    </div>
  )
}
