'use client'

import { useEffect, useState } from 'react'
import { Plus, Share, Smartphone } from 'lucide-react'
import { getPlatformType } from '@/lib/platform'
import { cn } from '@/lib/utils'

export const ANDROID_A2HS_DISMISS_KEY = 'adhx-a2hs-dismissed'

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

/** Always-available install path in Settings — Android only. */
export function AndroidSettingsCard() {
  const [show, setShow] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const { deferred, install } = useAndroidInstallPrompt()

  useEffect(() => {
    setShow(getPlatformType() === 'android')
    setStandalone(isStandaloneDisplay())
  }, [])

  if (!show) return null

  return (
    <div
      id="android-install"
      className="overflow-hidden rounded-card border border-hairline bg-surface shadow-m-sm"
    >
      <div className="flex items-center gap-3 px-5 pt-[18px]">
        <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-clay/10">
          <Smartphone className="h-[19px] w-[19px] text-clay" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-serif text-base font-semibold text-ink">Android install</div>
          <div className="mt-0.5 text-[13px] text-ink-3">
            {standalone ? (
              <span>Installed. From X, Instagram, TikTok, or YouTube: Share → ADHX.</span>
            ) : (
              <span>Add to Home screen, then Share → ADHX from any app.</span>
            )}
          </div>
        </div>
      </div>
      <div className="px-5 pb-5 pt-4">
        {standalone ? (
          <p className="text-[13px] leading-relaxed text-ink-2">
            <span>Open a post, tap Share, and pick ADHX. The preview opens here.</span>
          </p>
        ) : (
          <>
            {deferred && (
              <button
                type="button"
                onClick={install}
                className="mb-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-clay-grad px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02]"
              >
                <Plus className="h-4 w-4" aria-hidden />
                <span>Add to Home screen</span>
              </button>
            )}
            <AndroidHow className="mt-0" />
          </>
        )}
      </div>
    </div>
  )
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
