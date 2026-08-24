'use client'

import { useEffect, useState } from 'react'
import { MoreVertical, Plus, Share, Smartphone, X, type LucideIcon } from 'lucide-react'
import { getPlatformType } from '@/lib/platform'
import { cn } from '@/lib/utils'

export const ANDROID_A2HS_DISMISS_KEY = 'adhx-a2hs-dismissed'

export const ANDROID_INSTALL_TITLE = 'Share a post directly to ADHX'
export const ANDROID_INSTALL_BODY = 'From X, Instagram, TikTok, or YouTube: Share → ADHX.'
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

const HOW_STEPS: { icon: LucideIcon; label: string; hint: string }[] = [
  { icon: MoreVertical, label: 'Add to Home', hint: 'Browser ⋮ menu' },
  { icon: Smartphone, label: 'Open the app', hint: 'From the home screen' },
  { icon: Share, label: 'Share → ADHX', hint: 'Any app, one tap' },
]

/** Chrome / Samsung / Firefox steps — share sheet only works after install. */
export function AndroidHow({ className }: { className?: string }) {
  return (
    <div className={cn('mt-3', className)}>
      <ol className="grid grid-cols-3 gap-2">
        {HOW_STEPS.map((step, i) => {
          const Icon = step.icon
          return (
            <li key={step.label} className="flex flex-col items-center px-0.5 text-center">
              <span className="relative flex h-11 w-11 items-center justify-center rounded-[14px] bg-clay text-white">
                <Icon className="h-5 w-5" aria-hidden />
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[9px] font-semibold text-surface">
                  {i + 1}
                </span>
              </span>
              <span className="mt-2 text-[12px] font-semibold leading-tight text-ink">
                {step.label}
              </span>
              <span className="mt-0.5 text-[11px] leading-snug text-ink-3">{step.hint}</span>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-center text-[11px] leading-snug text-ink-3">
        <span>Paste link still works if Share → ADHX is missing.</span>
      </p>
    </div>
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
  alwaysHow = false,
  onDismiss,
}: {
  id?: string
  className?: string
  cardClassName?: string
  dismissible?: boolean
  alwaysHow?: boolean
  onDismiss?: () => void
}) {
  const [howOpen, setHowOpen] = useState(alwaysHow)
  const [standalone, setStandalone] = useState(false)
  const { deferred, install } = useAndroidInstallPrompt()

  useEffect(() => {
    setStandalone(isStandaloneDisplay())
  }, [])

  const runInstall = async () => {
    await install()
    onDismiss?.()
  }

  const showHow = !standalone && !deferred && (alwaysHow || howOpen)

  return (
    <div
      id={id}
      className={cn(
        'rounded-2xl border border-hairline bg-surface px-4 py-3 shadow-2xl',
        alwaysHow && 'px-5 py-4',
        cardClassName,
        className,
      )}
    >
      <div className="flex items-center gap-3">
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
            !alwaysHow && (
              <button
                type="button"
                onClick={() => setHowOpen((open) => !open)}
                aria-expanded={howOpen}
                className="flex-shrink-0 inline-flex items-center px-3 py-1.5 min-h-[36px] rounded-full text-sm font-semibold text-ink border border-hairline"
              >
                How
              </button>
            )
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
      {showHow && <AndroidHow className="mt-4" />}
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

  return <AndroidInstallBanner id="android-install" alwaysHow />
}

/** Landing-card copy — Android first, bookmarklet is desktop. */
export function AndroidLandingPromo() {
  return (
    <>
      <p className="mb-4 text-[14px] leading-[1.5] text-ink-2">
        <span>Share a post from X, Instagram, TikTok, or YouTube and it opens here.</span>
      </p>
      <AndroidHow className="mb-1" />
    </>
  )
}
