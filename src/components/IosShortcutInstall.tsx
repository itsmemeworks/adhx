'use client'

import { useEffect, useState } from 'react'
import { Plus, Share, Smartphone, type LucideIcon } from 'lucide-react'
import { getPlatformType } from '@/lib/platform'
import { cn } from '@/lib/utils'

const HOW_STEPS: { icon: LucideIcon; label: string; hint: string }[] = [
  { icon: Plus, label: 'Add shortcut', hint: 'Puts it in Share' },
  { icon: Smartphone, label: 'Open a post', hint: 'In any app' },
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

/** Always-available install path in Settings — iOS only, in the redesign's card look. */
export function IosShortcutSettingsCard() {
  const [show, setShow] = useState(false)
  const [origin, setOrigin] = useState<string | null>(null)
  useEffect(() => {
    setShow(getPlatformType() === 'ios')
    setOrigin(window.location.origin)
  }, [])
  if (!show || !origin) return null
  return <OwnShortcutCard origin={origin} />
}

/**
 * A self-hosted ADHX: the shortcut is three steps in the Shortcuts app,
 * pointed at this server.
 */
function OwnShortcutCard({ origin }: { origin: string }) {
  const [copied, setCopied] = useState(false)
  const prefix = `${origin}/share?url=`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prefix)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The text is selectable; people can copy it themselves.
    }
  }
  return (
    <section className="flex flex-col gap-4 rounded-[22px] bg-nx-surface p-4 font-nx-sans text-white md:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-nx-serif text-[26px] font-normal leading-none">
          Add to the iOS share menu
        </h2>
        <p className="m-0 text-sm text-white/65">
          Make a small shortcut once. Then from any app: Share → ADHX.
        </p>
      </div>
      <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-white/80">
        <li>
          <span>In the Shortcuts app, tap + and name the shortcut ADHX.</span>
        </li>
        <li>
          <span>Tap the ⓘ button and turn on Show in Share Sheet.</span>
        </li>
        <li>
          <span>Add the Open URLs action. Paste this, then add Shortcut Input after it:</span>
        </li>
      </ol>
      <code className="block select-all break-all rounded-xl bg-black px-3 py-2.5 font-mono text-[13px] text-nx-cream">
        {prefix}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-nx-accent px-5 text-[15px] font-extrabold text-black"
      >
        <span>{copied ? 'Copied' : 'Copy the address'}</span>
      </button>
    </section>
  )
}
