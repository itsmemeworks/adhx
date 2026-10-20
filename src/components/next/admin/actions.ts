'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

/**
 * Admin actions: POST/PATCH/DELETE to an admin API, then re-read the page's
 * numbers from the server. `busy` is the action running, `error` the last
 * thing that went wrong, in plain words.
 */
export function useAdminAction() {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (
      key: string,
      url: string,
      init: { method?: string; body?: unknown } = {},
    ): Promise<Record<string, unknown> | null> => {
      setBusy(key)
      setError(null)
      try {
        const res = await fetch(url, {
          method: init.method ?? 'POST',
          headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
          cache: 'no-store',
        })
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
        if (!res.ok) {
          setError(typeof data.error === 'string' ? data.error : 'That didn’t work. Try again.')
          return null
        }
        router.refresh()
        return data
      } catch {
        setError('That didn’t work. Try again.')
        return null
      } finally {
        setBusy(null)
      }
    },
    [router],
  )

  return { run, busy, error, setError }
}

/** Copy words to the clipboard; false when the browser said no. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
