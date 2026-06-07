'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { parseShareUrl } from '@/lib/utils/parse-share-url'

/**
 * The "Preview another link" field, shared by all four preview pages.
 *
 * Accepts a link from ANY platform ADHX previews — X, Instagram, TikTok,
 * YouTube — plus TikTok short links, and navigates to the matching on-ADHX
 * preview path. It is intentionally NOT scoped to the current page's platform
 * (pasting an X link on a TikTok preview should just work). Owns its own state
 * so pages drop it in with no wiring.
 */
export function PreviewAnotherLink({ className }: { className?: string }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  const parseAndNavigate = (value: string): boolean => {
    const trimmed = value.trim()
    const result = parseShareUrl(trimmed)
    if (result) {
      window.location.href = result.path
      return true
    }
    // TikTok short link (vm./vt.tiktok.com/{code} or /t/{code}) — resolve server-side.
    if (/(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]+|tiktok\.com\/t\/[A-Za-z0-9]+/i.test(trimmed)) {
      window.location.href = `/api/tiktok/resolve?go=1&url=${encodeURIComponent(trimmed)}`
      return true
    }
    return false
  }

  const onChange = (value: string) => {
    setUrl(value)
    setError('')
    // Auto-navigate the moment a recognised link is pasted.
    if (/(?:x\.com|twitter\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\//i.test(value)) {
      parseAndNavigate(value)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!parseAndNavigate(url)) {
      setError("That's not a link we recognize. Try X, Instagram, TikTok or YouTube.")
    }
  }

  return (
    <div data-section="preview-another" className={cn('rounded-2xl border border-hairline bg-surface px-4 py-4', className)}>
      <p className="font-bold text-[13.5px] text-ink mb-2.5">Preview another link</p>
      <form onSubmit={onSubmit}>
        <div className="flex gap-2.5">
          <input
            type="text"
            value={url}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Paste a link…"
            className="flex-1 font-mono text-base sm:text-[12.5px] bg-inset px-3 py-2.5 rounded-xl border border-hairline text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-clay/40 focus:border-transparent"
          />
          <button
            type="submit"
            className="px-[18px] rounded-xl bg-clay-grad text-white font-semibold text-[13.5px] shadow-glow transition-all hover:opacity-95"
          >
            Go
          </button>
        </div>
        {error && <p className="text-[#EF4444] text-xs mt-2">{error}</p>}
      </form>
      <p className="text-xs text-ink-3 mt-2.5">Works with X, Instagram, TikTok &amp; YouTube.</p>
    </div>
  )
}
