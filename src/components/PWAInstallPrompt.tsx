'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPlatformType, type PlatformType } from '@/lib/platform'
import { SHORTCUT_DISMISS_KEY } from '@/components/IosShortcutInstall'
import { ANDROID_A2HS_DISMISS_KEY, AndroidHow } from '@/components/AndroidInstall'
import { X_ONLY_SHORTCUT_URL } from '@/lib/share/ios'
import { pingAnalytic } from '@/lib/analytics/client'

/**
 * Mobile install nudge.
 *
 * - **Android**: show even without `beforeinstallprompt` (Samsung / Firefox
 *   often never fire it). Add when the prompt exists; otherwise How expands
 *   the steps in the banner (Settings still has the always-on card). Do not
 *   send How to `/settings` — that page requires a session.
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
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
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
      setDeferred(e as BeforeInstallPromptEvent)
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

  // iOS banner is a soft nudge — any tap outside it dismisses (no need for X).
  useEffect(() => {
    if (!visible || platform !== 'ios') return
    function onPointerDown(e: PointerEvent) {
      const root = bannerRef.current
      if (!root || root.contains(e.target as Node)) return
      dismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [visible, platform])

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
              href={X_ONLY_SHORTCUT_URL}
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
      className={cn(
        'z-[70] sm:hidden',
        pinUnderTheaterLogo ? `fixed left-3 ${THEATER_BANNER_TOP}` : 'relative mx-3 mt-2',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 rounded-2xl bg-surface border border-hairline shadow-2xl px-4 py-3',
          pinUnderTheaterLogo ? 'w-[min(22rem,calc(100vw-1.5rem))]' : 'mx-auto max-w-md',
        )}
      >
        <Image
          src="/icon-192.png"
          alt=""
          width={40}
          height={40}
          className="w-10 h-10 rounded-xl flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Add ADHX to your home screen</p>
          <p className="text-xs text-ink-3">
            Then Share → ADHX from X, Instagram, TikTok, or YouTube.
          </p>
        </div>
        {deferred ? (
          <button
            onClick={install}
            className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-full text-sm font-semibold text-white bg-clay-grad shadow-glow transition-transform hover:scale-105"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setHowOpen((open) => !open)}
            aria-expanded={howOpen}
            className="flex-shrink-0 inline-flex items-center px-3 py-1.5 min-h-[36px] rounded-full text-sm font-semibold text-ink border border-hairline"
          >
            How
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
      {howOpen && !deferred && (
        <div
          className={cn(
            'mt-2 rounded-2xl border border-hairline bg-surface px-4 py-3 shadow-2xl',
            pinUnderTheaterLogo ? 'w-[min(22rem,calc(100vw-1.5rem))]' : 'mx-auto max-w-md',
          )}
        >
          <AndroidHow className="mt-0" />
        </div>
      )}
    </div>
  )
}
