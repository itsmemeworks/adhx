'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

/** A first-visit hint, never a gate in front of the video. */
export function TheaterIntro() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    try {
      setVisible(localStorage.getItem('adhx-theater-intro-v1') !== 'dismissed')
    } catch {
      setVisible(true)
    }
  }, [])
  if (!visible) return null

  return (
    <aside
      aria-label="Getting started"
      className="absolute left-4 top-20 z-10 max-w-[min(17rem,calc(100%-6rem))] rounded-2xl border border-white/15 bg-black/65 p-3 text-white backdrop-blur-md lg:left-7 lg:top-24"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Paste. Watch. Send.</p>
        <button
          type="button"
          aria-label="Dismiss getting started"
          className="-m-2 flex min-h-11 min-w-11 items-center justify-center rounded-full text-white/60 hover:text-white"
          onClick={() => {
            setVisible(false)
            try {
              localStorage.setItem('adhx-theater-intro-v1', 'dismissed')
            } catch {
              /* Optional hint. */
            }
          }}
        >
          <X size={16} />
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-white/70 [@media(max-height:520px)]:hidden">
        Paste a social link. Watch it here, then send the video to your mates.
      </p>
    </aside>
  )
}
