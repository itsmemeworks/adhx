'use client'

import { useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** A shell snippet with a copy button (tick for 2 seconds). */
export function CopyCommand({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Selectable below.
    }
  }
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-nx-surface">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : 'Copy the commands'}
        className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black text-white"
      >
        {copied ? (
          <Check aria-hidden className="h-4 w-4 text-nx-accent" strokeWidth={3} />
        ) : (
          <Copy aria-hidden className="h-4 w-4" />
        )}
      </button>
      <pre className="m-0 overflow-x-auto p-5 pr-16 font-mono text-[13px] leading-relaxed text-nx-cream md:text-[14px]">
        <code>{text}</code>
      </pre>
    </div>
  )
}
