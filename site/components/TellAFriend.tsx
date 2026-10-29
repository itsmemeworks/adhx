'use client'

import { useRef, useState } from 'react'
import { cn } from './cn'
import { Send } from './icons'

const MESSAGE =
  'Found a private feed for our lot: everything we share to it gets kept (even if the original’s deleted) and you can find it by describing it. Free, open source, and you’d have it running in minutes.'

/**
 * For people who won't host it themselves: hands the site to whoever will,
 * through the phone's share sheet, or copies a message where there isn't one.
 */
export function TellAFriend({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  async function send() {
    const url = 'https://adhx.com'
    try {
      if (navigator.share) {
        await navigator.share({ title: 'ADHX', text: MESSAGE, url })
        return
      }
      await navigator.clipboard.writeText(`${MESSAGE} ${url}`)
      setCopied(true)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2500)
    } catch {
      // Cancelled, or the clipboard was refused: nothing to do.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void send()}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-2 text-left text-[14px] font-bold text-nx-accent hover:text-white md:text-[15px]',
        className,
      )}
    >
      <Send size={16} className="shrink-0" />
      <span aria-live="polite">
        {copied ? 'Copied. Paste it to them.' : 'Not techy? Send this to the friend who is'}
      </span>
    </button>
  )
}
