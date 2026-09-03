'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { setClientEventAccount, subscribeClientEventAuthScopeChange } from '@/lib/client-events'

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
    x: { username: string; avatarUrl?: string | null } | null
    email: { email: string } | null
  }
  xConnected: boolean
  isAdmin?: boolean
}

// Module-level cache + in-flight dedupe so every mounted consumer shares one
// fetch instead of each firing its own request on mount.
let cache: AuthMe | null = null
let authGeneration = 0
let authLoading = cache === null
let inflight: {
  generation: number
  promise: Promise<AuthMe>
  broadcastScopeChange: boolean
  retryOnFailure: boolean
} | null = null
const listeners = new Set<() => void>()
const AUTH_RETRY_BASE_MS = 1_000
const AUTH_RETRY_CAP_MS = 30_000
let authRetryTimer: ReturnType<typeof setTimeout> | null = null
let authRetryAttempt = 0
let authRetryGeneration: number | null = null
let authRecoveryRequired = false
interface AuthMeSnapshot {
  me: AuthMe | null
  loading: boolean
}
let authSnapshot: AuthMeSnapshot = { me: cache, loading: authLoading }
const serverAuthSnapshot: AuthMeSnapshot = { me: null, loading: true }

function notify() {
  authSnapshot = { me: cache, loading: authLoading }
  listeners.forEach((listener) => listener())
}

async function fetchMe(): Promise<AuthMe> {
  const res = await fetch('/api/auth/me')
  if (!res.ok) throw new Error(`Failed to fetch /api/auth/me: ${res.status}`)
  return res.json()
}

function cancelAuthRetry(resetAttempt = true) {
  if (authRetryTimer) clearTimeout(authRetryTimer)
  authRetryTimer = null
  authRetryGeneration = null
  if (resetAttempt) authRetryAttempt = 0
}

/** Clears the shared cache — call after login/logout so the next render refetches. */
function invalidateAuthMeState(options: { recover?: boolean } = {}) {
  authGeneration += 1
  cancelAuthRetry()
  authRecoveryRequired = options.recover === true
  cache = null
  authLoading = true
  // Detach an older request so a refresh for the new session/account does not
  // reuse it. The old promise may still settle, but its generation cannot
  // repopulate either the auth cache or the client-event account scope.
  inflight = null
  setClientEventAccount(undefined)
  notify()
}

export function invalidateAuthMe() {
  invalidateAuthMeState()
}

function scheduleAuthRetry(generation: number, broadcastScopeChange: boolean): boolean {
  if (generation !== authGeneration || listeners.size === 0) return false
  if (authRetryTimer && authRetryGeneration === generation) return true

  if (authRetryTimer) clearTimeout(authRetryTimer)
  authRetryGeneration = generation
  const exponent = Math.min(authRetryAttempt, 5)
  const delay = Math.min(AUTH_RETRY_BASE_MS * 2 ** exponent, AUTH_RETRY_CAP_MS)
  authRetryAttempt = Math.min(authRetryAttempt + 1, 6)
  authRetryTimer = setTimeout(() => {
    authRetryTimer = null
    if (generation !== authGeneration || listeners.size === 0) {
      cancelAuthRetry()
      return
    }
    void refreshAuthMe({
      broadcastScopeChange,
      retryOnFailure: true,
    })
  }, delay)
  return true
}

async function refreshAuthMe(
  options: { broadcastScopeChange?: boolean; retryOnFailure?: boolean } = {},
) {
  authLoading = true
  // A session may have changed since the cached response. Cross-tab
  // collection events fail closed until this request identifies the current
  // immutable account (or confirms a signed-out state).
  setClientEventAccount(undefined)
  notify()
  const generation = authGeneration
  const recoveryActive = authRetryGeneration === generation
  if (authRetryTimer) {
    clearTimeout(authRetryTimer)
    authRetryTimer = null
  }
  let request = inflight
  if (!request || request.generation !== generation) {
    request = {
      generation,
      promise: fetchMe(),
      broadcastScopeChange: options.broadcastScopeChange !== false,
      retryOnFailure: options.retryOnFailure === true || recoveryActive,
    }
    inflight = request
  }
  let retryScheduled = false
  try {
    const data = await request.promise
    if (generation !== authGeneration) return
    cache = data
    authRecoveryRequired = false
    cancelAuthRetry()
    setClientEventAccount(
      data.authenticated && typeof data.user?.id === 'string' ? data.user.id : null,
      { broadcast: request.broadcastScopeChange },
    )
  } catch (error) {
    if (generation === authGeneration) {
      console.error('Failed to fetch auth status:', error)
      if (request.retryOnFailure) {
        retryScheduled = scheduleAuthRetry(generation, request.broadcastScopeChange)
      }
    }
  } finally {
    if (inflight === request) inflight = null
    if (generation === authGeneration) {
      // Recovery remains visibly unresolved and fail-closed between attempts.
      authLoading = retryScheduled || authRecoveryRequired
      notify()
    }
  }
}

// One module-level listener serves every mounted hook consumer. A remote tab
// changed the shared cookie, so generation-invalidate any old request before
// refetching. The resulting settle is not re-broadcast.
subscribeClientEventAuthScopeChange(() => {
  invalidateAuthMeState({ recover: true })
  void refreshAuthMe({ broadcastScopeChange: false, retryOnFailure: true })
})

function subscribeAuthMe(listener: () => void) {
  listeners.add(listener)
  if (cache === null) {
    if (authRecoveryRequired) {
      void refreshAuthMe({ broadcastScopeChange: false, retryOnFailure: true })
    } else {
      void refreshAuthMe({ retryOnFailure: true })
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      cancelAuthRetry()
      if (inflight?.retryOnFailure) {
        authGeneration += 1
        inflight = null
      }
    }
  }
}

export function useAuthMe() {
  // Initial discovery and explicit refreshes both recover from transient
  // failures. Until one settles, auth remains unresolved and account-scoped
  // client events stay fail-closed.
  const refresh = useCallback(() => refreshAuthMe({ retryOnFailure: true }), [])
  const { me, loading } = useSyncExternalStore(
    subscribeAuthMe,
    () => authSnapshot,
    () => serverAuthSnapshot,
  )

  return { me, loading, refresh }
}
