'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPlatformType, type PlatformType } from '@/lib/platform'
import { SHORTCUT_DISMISS_KEY } from '@/components/IosShortcutInstall'
import { ANDROID_A2HS_DISMISS_KEY, AndroidInstallBanner } from '@/components/AndroidInstall'
import { IOS_SHORTCUT_URL } from '@/lib/share/ios'
import { pingAnalytic } from '@/lib/analytics/client'

/**
 * Mobile install nudge.
 *
 * - **Android**: show even without `beforeinstallprompt` (Samsung / Firefox
 *   often never fire it). Uses `AndroidInstallBanner` (same chrome as Settings).
 *   Add when the prompt exists; otherwise How expands the steps. Skip on
 *   `/settings` so the always-on card is not doubled. Hidden in standalone.
 * - **iOS / Safari**: Share Sheet shortcut is the useful install (home screen
 *   is a 3-step dance and doesn't help send from Instagram/X). One tap opens
 *   the iCloud shortcut. Still shown in standalone — the shortcut is separate.
 *
 * Hidden on desktop, when Android is already installed, and once dismissed.
 */

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** Just under the theater logo row (safe-area + wordmark + a little air). */
const THEATER_BANNER_TOP = 'top-[calc(env(safe-area-inset-top,0px)+3.15rem)]'

function isTheaterPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/live' ||
    pathname === '/collection' ||
    pathname.startsWith('/t/') ||
    /^\/\w+\/status\/\d+$/.test(pathname) ||
    /^\/reels?\/[A-Za-z0-9_-]+$/.test(pathname) ||
    /^\/shorts\/[A-Za-z0-9_-]{11}$/.test(pathname) ||
    /^\/@?[A-Za-z0-9._]+\/video\/\d+$/.test(pathname)
  )
}

export function PWAInstallPrompt() {
  const pathname = usePathname()
  const [platform, setPlatform] = useState<PlatformType>('desktop')
  const [visible, setVisible] = useState(false)
  const bannerRef = useRef<HTMLDivElement>(null)
  const pinUnderTheaterLogo = isTheaterPath(pathname)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const p = getPlatformType()
    setPlatform(p)

    const dismissKey = p === 'ios' ? SHORTCUT_DISMISS_KEY : ANDROID_A2HS_DISMISS_KEY
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

    // Samsung / Firefox often never fire beforeinstallprompt — still nudge.
    if (p === 'android') setVisible(true)

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const dismiss = () => {
    setVisible(false)
    const key = platform === 'ios' ? SHORTCUT_DISMISS_KEY : ANDROID_A2HS_DISMISS_KEY
    try {
      localStorage.setItem(key, '1')
    } catch {
      // ignore
    }
  }

  // Soft nudge — any tap outside the card dismisses (How / Add still need the X).
  useEffect(() => {
    if (!visible || platform === 'desktop') return
    function onPointerDown(e: PointerEvent) {
      const root = bannerRef.current
      if (!root || root.contains(e.target as Node)) return
      dismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [visible, platform])

  if (!visible || platform === 'desktop') return null
  // Settings mounts the same AndroidInstallBanner as an always-on card.
  if (platform === 'android' && pathname === '/settings') return null

  if (platform === 'ios') {
    return (
      <div
        ref={bannerRef}
        className={cn(
          'z-[70] sm:hidden',
          pinUnderTheaterLogo ? `fixed left-3 ${THEATER_BANNER_TOP}` : 'relative mx-3 mt-2',
        )}
      >
        <div className="relative w-[min(19rem,calc(100vw-1.5rem))]">
          <span
            aria-hidden
            className="absolute -top-1.5 left-5 h-3 w-3 rotate-45 border-l border-t border-clay bg-surface"
          />
          <div className="relative flex items-start rounded-2xl border border-clay bg-surface shadow-2xl">
            <a
              href={IOS_SHORTCUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 px-4 py-3"
              onClick={() => pingAnalytic('shortcut.install', { source: 'shortcut' })}
            >
              <p className="text-sm font-semibold text-ink">Install the iOS shortcut</p>
              <p className="text-xs leading-snug text-ink-3">
                Share posts to ADHX from X, Instagram, TikTok, and YouTube in one tap.
              </p>
            </a>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="inline-flex min-h-[44px] min-w-[44px] flex-none items-center justify-center p-1.5 text-ink-3 hover:text-ink-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={bannerRef}
      className={cn(
        'z-[70] sm:hidden',
        pinUnderTheaterLogo ? `fixed left-3 ${THEATER_BANNER_TOP}` : 'relative mx-3 mt-2',
      )}
    >
      <AndroidInstallBanner
        dismissible
        onDismiss={dismiss}
        cardClassName={
          pinUnderTheaterLogo ? 'w-[min(22rem,calc(100vw-1.5rem))]' : 'mx-auto max-w-md'
        }
      />
    </div>
  )
}
