'use client'

import { useEffect, useRef, useState } from 'react'
import { DEMO_HEADER } from '@/lib/demo/mode'

const RUN_YOUR_OWN = 'https://github.com/itsmemeworks/adhx#run-your-own'

/**
 * The public demo's own bit of chrome: a pill that says what this is, and a
 * note when the demo refuses something you just did (its gate answers 403
 * with `x-adhx-demo`), so a Save that does nothing explains itself. Refused
 * background writes (watch marks and the like) stay quiet.
 */

/** A refusal this soon after a tap or key press was that person's doing. */
const GESTURE_MS = 2500
export function DemoBar() {
  const [refused, setRefused] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    let lastGesture = 0
    const gesture = () => {
      lastGesture = Date.now()
    }
    window.addEventListener('pointerdown', gesture, true)
    window.addEventListener('keydown', gesture, true)
    const original = window.fetch
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args)
      const yours = Date.now() - lastGesture < GESTURE_MS
      if (yours && res.status === 403 && res.headers.get(DEMO_HEADER)) {
        setRefused(true)
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setRefused(false), 4000)
      }
      return res
    }
    return () => {
      window.removeEventListener('pointerdown', gesture, true)
      window.removeEventListener('keydown', gesture, true)
      window.fetch = original
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(64px+env(safe-area-inset-top))] z-[200] flex flex-col items-center gap-2 px-4 font-nx-sans md:bottom-4 md:left-auto md:right-4 md:top-auto md:flex-col-reverse md:items-end">
      {refused && (
        <p
          role="status"
          className="pointer-events-auto m-0 max-w-[340px] rounded-2xl bg-nx-accent px-4 py-3 text-center text-[14px] font-bold leading-snug text-black shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
        >
          <span>This is the demo, so saving and changes are off. </span>
          <a href={RUN_YOUR_OWN} className="underline">
            Run your own
          </a>
        </p>
      )}
      <a
        href={RUN_YOUR_OWN}
        className="pointer-events-auto flex min-h-[36px] items-center gap-2 rounded-full border border-white/20 bg-black/75 px-3.5 text-[13px] font-semibold text-nx-ink backdrop-blur-md hover:bg-black"
      >
        <span className="rounded-full bg-nx-accent px-1.5 py-px text-[11px] font-extrabold uppercase tracking-wide text-black">
          Demo
        </span>
        <span>You’re Sam. Run your own →</span>
      </a>
    </div>
  )
}
