'use client'

import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { getPlatformType, type PlatformType } from '@/lib/platform'
import { IosShortcutInstallButton, SHORTCUT_DISMISS_KEY } from '@/components/IosShortcutInstall'

/**
 * Mobile install nudge.
 *
 * - **Android / Chrome**: `beforeinstallprompt` → one-tap Add to Home Screen
 *   (needs the cache-free SW in `public/sw.js`).
 * - **iOS / Safari**: Share Sheet shortcut is the useful install (home screen
 *   is a 3-step dance and doesn't help send from Instagram/X). One tap opens
 *   the iCloud shortcut. Still shown in standalone — the shortcut is separate.
 *
 * Hidden on desktop, when Android is already installed, and once dismissed.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const A2HS_DISMISS_KEY = 'adhx-a2hs-dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function PWAInstallPrompt() {
  const [platform, setPlatform] = useState<PlatformType>('desktop')
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const p = getPlatformType()
    setPlatform(p)

    const dismissKey = p === 'ios' ? SHORTCUT_DISMISS_KEY : A2HS_DISMISS_KEY
    let dismissed = false
    try {
      dismissed = localStorage.getItem(dismissKey) === '1'
    } catch {
      // private mode — still show
    }
    if (dismissed) return

    if (p === 'ios') {
      setVisible(true)
      return
    }

    if (isStandalone()) return

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const dismiss = () => {
    setVisible(false)
    const key = platform === 'ios' ? SHORTCUT_DISMISS_KEY : A2HS_DISMISS_KEY
    try {
      localStorage.setItem(key, '1')
    } catch {
      // ignore
    }
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    dismiss()
  }

  if (!visible || platform === 'desktop') return null

  if (platform === 'ios') {
    return (
      <div className="fixed bottom-3 inset-x-3 z-[60] sm:hidden">
        <div className="mx-auto max-w-md flex items-center gap-3 rounded-2xl bg-surface border border-hairline shadow-2xl px-4 py-3">
          <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Add ADHX to Share</p>
            <p className="text-xs text-ink-3">In X: Share → ADHX. Skip rewriting the URL.</p>
          </div>
          <IosShortcutInstallButton className="flex-shrink-0 !px-3 text-sm">
            Add
          </IosShortcutInstallButton>
          <button
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

  return (
    <div className="fixed bottom-3 inset-x-3 z-[60] sm:hidden">
      <div className="mx-auto max-w-md flex items-center gap-3 rounded-2xl bg-surface border border-hairline shadow-2xl px-4 py-3">
        <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Add ADHX to your home screen</p>
          <p className="text-xs text-ink-3">One tap — open it like an app, no app store needed.</p>
        </div>
        {deferred && (
          <button
            onClick={install}
            className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-full text-sm font-semibold text-white bg-clay-grad shadow-glow transition-transform hover:scale-105"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        )}
        <button
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
