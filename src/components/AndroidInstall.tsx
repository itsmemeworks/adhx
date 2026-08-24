'use client'

import { useEffect, useState } from 'react'
import { Plus, Share, X } from 'lucide-react'
import { getPlatformType } from '@/lib/platform'
import { cn } from '@/lib/utils'

export const ANDROID_A2HS_DISMISS_KEY = 'adhx-a2hs-dismissed'

export const ANDROID_INSTALL_TITLE = 'Share a post directly to ADHX'
export const ANDROID_INSTALL_BODY =
  'Add to your home screen once. Then in X, Instagram, TikTok, or YouTube: Share → ADHX.'
export const ANDROID_INSTALL_STANDALONE =
  'Installed. From X, Instagram, TikTok, or YouTube: Share → ADHX.'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** Chrome / Samsung / Firefox steps — share sheet only works after install. */
export function AndroidHow({ className }: { className?: string }) {
  return (
    <ol className={cn('mt-3 space-y-2 text-[13px] leading-relaxed text-ink-2', className)}>
      <li>
        <span>1. Browser menu (⋮) → Add to Home screen.</span>
      </li>
      <li>
        <span>2. Open ADHX from the home screen once, like an app.</span>
      </li>
      <li>
        <span>3. In X, Instagram, TikTok, or YouTube: Share → ADHX.</span>
      </li>
      <li>
        <span>Paste link still works if Share → ADHX is missing.</span>
      </li>
    </ol>
  )
}

function useAndroidInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
  }

  return { deferred, install }
}

/**
 * Shared Android install chrome — the theater/library nudge and Settings
 * mount this. Copy leads with why (share a post into ADHX). How expands the
 * steps; Add appears when `beforeinstallprompt` fires.
 */
export function AndroidInstallBanner({
  id,
  className,
  cardClassName,
  dismissible = false,
  onDismiss,
}: {
  id?: string
  className?: string
  cardClassName?: string
  dismissible?: boolean
  onDismiss?: () => void
}) {
  const [howOpen, setHowOpen] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const { deferred, install } = useAndroidInstallPrompt()

  useEffect(() => {
    setStandalone(isStandaloneDisplay())
  }, [])

  const runInstall = async () => {
    await install()
    onDismiss?.()
  }

  return (
    <div id={id} className={className}>
      <div
        className={cn(
          'flex items-center gap-3 rounded-2xl border border-hairline bg-surface px-4 py-3 shadow-2xl',
          cardClassName,
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{ANDROID_INSTALL_TITLE}</p>
          <p className="text-xs leading-snug text-ink-3">
            {standalone ? ANDROID_INSTALL_STANDALONE : ANDROID_INSTALL_BODY}
          </p>
        </div>
        {!standalone &&
          (deferred ? (
            <button
              type="button"
              onClick={runInstall}
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
          ))}
        {dismissible && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="flex-shrink-0 p-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-ink-3 hover:text-ink-2"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {howOpen && !deferred && !standalone && (
        <div
          className={cn(
            'mt-2 rounded-2xl border border-hairline bg-surface px-4 py-3 shadow-2xl',
            cardClassName,
          )}
        >
          <AndroidHow className="mt-0" />
        </div>
      )}
    </div>
  )
}

/** Always-available install path in Settings — Android only. Same chrome as the nudge. */
export function AndroidSettingsCard() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(getPlatformType() === 'android')
  }, [])

  useEffect(() => {
    if (!show || typeof window === 'undefined') return
    if (window.location.hash !== '#android-install') return
    document.getElementById('android-install')?.scrollIntoView({ block: 'start' })
  }, [show])

  if (!show) return null

  return <AndroidInstallBanner id="android-install" />
}

/** Landing-card copy — Android first, bookmarklet is desktop. */
export function AndroidLandingPromo() {
  return (
    <>
      <p className="mb-4 text-[14px] leading-[1.5] text-ink-2">
        <span>
          Add ADHX to your home screen once. Next time you&apos;re in X, Instagram, TikTok, or
          YouTube, tap Share → ADHX — the preview opens so you can watch and send the file.
        </span>
      </p>
      <AndroidHow className="mb-1 text-left" />
      <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-ink-3">
        <Share className="h-3.5 w-3.5" aria-hidden />
        <span>Share Target needs the installed app, not a browser tab.</span>
      </p>
    </>
  )
}
