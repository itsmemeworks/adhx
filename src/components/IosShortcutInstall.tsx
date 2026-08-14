'use client'

import { useEffect, useState } from 'react'
import { Share, X } from 'lucide-react'
import { IosShareRecipe } from '@/components/IosShareRecipe'
import { isIOSDevice } from '@/lib/platform'
import { X_ONLY_SHORTCUT_URL } from '@/lib/share/ios'
import { cn } from '@/lib/utils'

export const SHORTCUT_DISMISS_KEY = 'adhx-shortcut-dismissed'

/** One-tap install: opens the iCloud shortcut (X-only today) in Shortcuts. */
export function IosShortcutInstallButton({
  className,
  children = 'Add to Share Sheet',
  variant = 'primary',
}: {
  className?: string
  children?: React.ReactNode
  variant?: 'primary' | 'ink'
}) {
  return (
    <a
      href={X_ONLY_SHORTCUT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-full font-semibold text-sm transition-transform hover:scale-[1.02]',
        variant === 'ink' ? 'bg-ink text-surface' : 'bg-clay-grad text-white shadow-glow',
        className,
      )}
    >
      <Share className="w-4 h-4" aria-hidden />
      {children}
    </a>
  )
}

/** Extra steps for Reels / TikToks / Shorts until the iCloud shortcut is rebuilt. */
export function IosShortcutHow() {
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer list-none text-[13.5px] font-semibold text-clay min-h-[44px] flex items-center [&::-webkit-details-marker]:hidden">
        Instagram, TikTok, YouTube too
      </summary>
      <p className="text-[13px] text-ink-2 leading-relaxed mb-2">
        The one-tap shortcut currently rewrites X links. For the other apps, swap the host to{' '}
        <code className="font-mono text-ink">adhx.com</code>, or add a Share Sheet shortcut that
        works on all four:
      </p>
      <IosShareRecipe />
    </details>
  )
}

/** Preview-page card: next time, skip rewriting the URL. */
export function IosShortcutNudge() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!isIOSDevice()) return
    try {
      if (localStorage.getItem(SHORTCUT_DISMISS_KEY) === '1') return
    } catch {
      // show anyway
    }
    setShow(true)
  }, [])

  if (!show) return null

  const dismiss = () => {
    setShow(false)
    try {
      localStorage.setItem(SHORTCUT_DISMISS_KEY, '1')
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-2xl px-4 py-4 bg-surface border border-hairline">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-ink mb-0.5">Next time, skip this page</div>
          <p className="text-[13px] text-ink-2 leading-snug mb-3">
            Add ADHX to the share sheet. In X: Share → ADHX. Watch and send from here.
          </p>
          <IosShortcutInstallButton className="w-full rounded-xl" />
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 p-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-ink-3 hover:text-ink-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
