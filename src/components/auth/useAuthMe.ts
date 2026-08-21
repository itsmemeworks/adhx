'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Shared client-side auth model — GET /api/auth/me. Unlike the legacy
 * /api/auth/twitter/status (X-only), this reports "authenticated" for both
 * X-connected AND email-only accounts, so email-only users aren't bounced
 * to the landing page. See CLAUDE.md's auth plumbing notes.
 */
export interface AuthMeUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  usernameChosen: boolean
  usernameChangeCount: number
}

export interface AuthMe {
  authenticated: boolean
  user: AuthMeUser | null
  identities: {
    x: { username: string } | null
    email: { email: string } | null
  }
  xConnected: boolean
}

// Module-level cache + in-flight dedupe so every mounted consumer shares one
// fetch instead of each firing its own request on mount.
let cache: AuthMe | null = null
let inflight: Promise<AuthMe> | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

async function fetchMe(): Promise<AuthMe> {
  const res = await fetch('/api/auth/me')
  if (!res.ok) throw new Error(`Failed to fetch /api/auth/me: ${res.status}`)
  return res.json()
}

/** Clears the shared cache — call after login/logout so the next render refetches. */
export function invalidateAuthMe() {
  cache = null
  notify()
}

export function useAuthMe() {
  const [me, setMe] = useState<AuthMe | null>(cache)
  const [loading, setLoading] = useState(cache === null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (!inflight) inflight = fetchMe()
      const data = await inflight
      cache = data
      notify()
    } catch (error) {
      console.error('Failed to fetch auth status:', error)
    } finally {
      inflight = null
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const listener = () => setMe(cache)
    listeners.add(listener)
    if (cache === null) {
      refresh()
    } else {
      setMe(cache)
      setLoading(false)
    }
    return () => {
      listeners.delete(listener)
    }
  }, [refresh])

  return { me, loading, refresh }
}
