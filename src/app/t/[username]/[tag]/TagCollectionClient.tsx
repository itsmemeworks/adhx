'use client'

import { useState } from 'react'

/**
 * "Add to My Collection" CTA for a public tag page — the only interactive
 * piece of `/t/{username}/{tag}` (everything else server-renders). POSTs to
 * the existing clone endpoint; on 401 it bounces through OAuth and back.
 */
export default function AddToCollectionButton({
  username,
  tag,
}: {
  username: string
  tag: string
}) {
  const [cloning, setCloning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClone() {
    setCloning(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/share/tag/by-name/${encodeURIComponent(username)}/${encodeURIComponent(tag)}/clone`,
        { method: 'POST' },
      )

      if (response.status === 401) {
        const returnUrl = encodeURIComponent(window.location.pathname)
        window.location.href = `/api/auth/twitter?returnUrl=${returnUrl}`
        return
      }

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        setError(result.error || 'Failed to add to collection. Please try again.')
        return
      }

      window.location.href = '/'
    } catch {
      setError('Failed to add to collection. Please try again.')
    } finally {
      setCloning(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={handleClone}
        disabled={cloning}
        className="min-h-[40px] flex-none rounded-full bg-clay-grad px-4 py-2 text-[13px] font-semibold text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {cloning ? 'Adding…' : 'Add to My Collection'}
      </button>
      {error && <p className="max-w-[220px] text-right text-xs text-red-500">{error}</p>}
    </div>
  )
}
