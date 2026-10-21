'use client'

import { useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Commands that start a line, picked out in the accent colour. */
const COMMAND = /^(git clone|docker build|docker compose)\b/

/** One line of shell: comments muted, the leading command in yellow. */
function Line({ line }: { line: string }) {
  if (line.startsWith('#')) return <span className="text-nx-muted">{line}</span>
  const m = COMMAND.exec(line)
  if (!m) return <>{line}</>
  return (
    <>
      <span className="text-nx-accent">{m[0]}</span>
      {line.slice(m[0].length)}
    </>
  )
}

/**
 * A shell snippet with a copy button (tick for 2 seconds). With a `title`, it
 * gets a header bar and a labelled Copy button.
 */
export function CopyCommand({
  text,
  title,
  note,
}: {
  text: string
  title?: string
  note?: string
}) {
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
  const lines = text.split('\n')
  const code = (
    <code>
      {lines.map((l, i) => (
        <span key={i}>
          <Line line={l} />
          {i < lines.length - 1 && '\n'}
        </span>
      ))}
    </code>
  )
  if (title) {
    return (
      <div className="overflow-hidden rounded-[20px] border border-white/10 bg-black md:rounded-[24px]">
        <div className="flex h-12 items-center gap-2.5 border-b border-white/10 bg-nx-surface pl-4 pr-1.5 md:h-14 md:pl-[22px] md:pr-2.5">
          <span className="whitespace-nowrap text-[13px] font-extrabold md:text-[14px]">
            {title}
          </span>
          {note && (
            <span className="hidden whitespace-nowrap text-[13px] text-nx-muted sm:inline">
              {note}
            </span>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void copy()}
            className="flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#262320] px-3.5 text-[13px] font-extrabold text-nx-cream hover:bg-[#34302a]"
          >
            {copied ? (
              <Check aria-hidden className="h-4 w-4 text-nx-accent" strokeWidth={3} />
            ) : (
              <Copy aria-hidden className="h-4 w-4" />
            )}
            <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="m-0 overflow-x-auto px-4 py-3.5 font-mono text-[12px] leading-[1.7] text-nx-cream md:px-6 md:py-5 md:text-[14px] md:leading-[1.75]">
          {code}
        </pre>
      </div>
    )
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
        {code}
      </pre>
    </div>
  )
}
