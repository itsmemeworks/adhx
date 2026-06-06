'use client'

import { useEffect, useState } from 'react'
import { Share, Plus, X } from 'lucide-react'
import { ADHX_PURPLE } from '@/lib/gestalt/theme'
import { getPlatformType, type PlatformType } from '@/lib/platform'

/**
 * "Add ADHX to your home screen" prompt for mobile.
 *
 * - **Android / Chrome**: captures the native `beforeinstallprompt` event and
 *   offers a one-tap "Add" button that triggers the real install dialog.
 *   (Requires the cache-free service worker in `public/sw.js`, registered here,
 *   so Chrome considers the app installable.)
 * - **iOS / Safari**: there is no programmatic install API, so we show the
 *   manual "tap Share → Add to Home Screen" instructions instead.
 *
 * Hidden on desktop, when already running standalone (installed), and once the
 * user dismisses it (remembered in localStorage).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'adhx-a2hs-dismissed'

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
    // Register the (cache-free) SW so Chrome will offer one-tap install.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    if (isStandalone()) return // already installed — nothing to prompt
    let dismissed = false
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      // localStorage unavailable (private mode) — just show the prompt
    }
    if (dismissed) return

    const p = getPlatformType()
    setPlatform(p)

    // Android/Chrome: stash the native prompt and reveal the one-tap button.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)

    // iOS Safari never fires that event — show manual instructions instead.
    if (p === 'ios') setVisible(true)

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const dismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore — dismissal just won't persist
    }
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    dismiss()
  }

  // Mobile only; desktop installs aren't what we're nudging here.
  if (!visible || platform === 'desktop') return null

  return (
    <div className="fixed bottom-3 inset-x-3 z-[60] sm:hidden">
      <div className="mx-auto max-w-md flex items-center gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl px-4 py-3">
        <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Add ADHX to your home screen</p>
          {platform === 'ios' ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 flex-wrap">
              Tap <Share className="w-3.5 h-3.5 inline" aria-label="the Share button" /> then &ldquo;Add to Home Screen&rdquo;
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">One tap — open it like an app, no app store needed.</p>
          )}
        </div>
        {deferred && (
          <button
            onClick={install}
            className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-105"
            style={{ backgroundColor: ADHX_PURPLE }}
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
