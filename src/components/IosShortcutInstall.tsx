'use client'

import { useEffect, useState } from 'react'
import { Plus, Share, Smartphone, X, type LucideIcon } from 'lucide-react'
import { getPlatformType, isIOSDevice } from '@/lib/platform'
import { IOS_SHORTCUT_URL } from '@/lib/share/ios'
import { pingAnalytic } from '@/lib/analytics/client'
import { cn } from '@/lib/utils'

export const SHORTCUT_DISMISS_KEY = 'adhx-shortcut-dismissed'

const HOW_STEPS: { icon: LucideIcon; label: string; hint: string }[] = [
  { icon: Plus, label: 'Add shortcut', hint: 'Puts it in Share' },
  { icon: Smartphone, label: 'Open a post', hint: 'X, IG, TikTok' },
  { icon: Share, label: 'Share → ADHX', hint: 'Saves it here' },
]

/** Chrome-style 3-step strip — same tiles as AndroidHow. */
export function IosHow({
  className,
  tone = 'matter',
}: {
  className?: string
  /** `next` = the redesign's dark cards (Settings). */
  tone?: 'matter' | 'next'
}) {
  return (
    <div className={cn('mt-3', className)}>
      <ol className="grid grid-cols-3 gap-2">
        {HOW_STEPS.map((step, i) => {
          const Icon = step.icon
          return (
            <li key={step.label} className="flex flex-col items-center px-0.5 text-center">
              <span
                className={cn(
                  'relative flex h-11 w-11 items-center justify-center rounded-[14px]',
                  tone === 'next' ? 'bg-nx-accent text-black' : 'bg-clay text-white',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span
                  className={cn(
                    'absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold',
                    tone === 'next' ? 'bg-white text-black' : 'bg-ink text-surface',
                  )}
                >
                  {i + 1}
                </span>
              </span>
              <span
                className={cn(
                  'mt-2 text-[12px] font-semibold leading-tight',
                  tone === 'next' ? 'text-white' : 'text-ink',
                )}
              >
                {step.label}
              </span>
              <span
                className={cn(
                  'mt-0.5 text-[11px] leading-snug',
                  tone === 'next' ? 'text-white/55' : 'text-ink-3',
                )}
              >
                {step.hint}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** One-tap install: opens the iCloud shortcut so ADHX appears in Share. */
export function IosShortcutInstallButton({
  className,
  children = 'Add to Share Sheet',
  variant = 'primary',
}: {
  className?: string
  children?: React.ReactNode
  variant?: 'primary' | 'ink' | 'outline'
}) {
  return (
    <a
      href={IOS_SHORTCUT_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => pingAnalytic('shortcut.install', { source: 'shortcut' })}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold',
        variant === 'outline'
          ? // Full-strength `border-clay` — Matter colors are hex CSS vars, so
            // Tailwind opacity modifiers (`border-clay/NN`) silently drop.
            'border border-clay bg-transparent text-ink'
          : variant === 'ink'
            ? 'bg-ink text-surface transition-transform hover:scale-[1.02]'
            : 'bg-clay-grad text-white shadow-glow transition-transform hover:scale-[1.02]',
        className,
      )}
    >
      <Share className="w-4 h-4" aria-hidden />
      <span>{children}</span>
    </a>
  )
}

/** Always-available install path in Settings — iOS only, in the redesign's card look. */
export function IosShortcutSettingsCard() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    setShow(getPlatformType() === 'ios')
  }, [])
  if (!show) return null
  return (
    <section className="flex flex-col gap-4 rounded-[22px] bg-nx-surface p-4 font-nx-sans text-white md:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-nx-serif text-[26px] font-normal leading-none">
          Add to the iOS share menu
        </h2>
        <p className="m-0 text-sm text-white/65">
          Then from X, Instagram, or TikTok: Share → ADHX.
        </p>
      </div>
      <IosHow tone="next" className="mt-0" />
      <a
        href={IOS_SHORTCUT_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => pingAnalytic('shortcut.install', { source: 'shortcut' })}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-nx-accent px-5 text-[15px] font-extrabold text-black"
      >
        <Share className="h-4 w-4" aria-hidden />
        <span>Add to Share Sheet</span>
      </a>
    </section>
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
            Add ADHX to the iOS share menu. From X, Instagram, or TikTok: Share → ADHX.
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
