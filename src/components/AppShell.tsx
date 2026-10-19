'use client'

import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { FontProvider } from './FontProvider'
import { isSavedPath } from '@/lib/theater/collection-href'
import { startClientEventBridge } from '@/lib/client-events'
import { useAuthMe } from '@/components/auth'
import { PreferencesProvider } from '@/lib/preferences-context'

interface AppAccountScope {
  serverAccountId: string | null
  clientAccountId: string | null | undefined
  trusted: boolean
}

const AppAccountScopeContext = createContext<AppAccountScope | null>(null)
const SCOPE_REFRESH_RETRY_BASE_MS = 1_000
const SCOPE_REFRESH_RETRY_CAP_MS = 30_000

/**
 * Auth-aware public controls use this in addition to `useAuthMe()`. A client
 * cookie read is not enough to authorize account actions until a fresh RSC
 * payload, bound by the server to the same immutable account ID, has arrived.
 */
export function useAppAccountScope(): AppAccountScope | null {
  return useContext(AppAccountScopeContext)
}

/** New-design pages that sign you in and bring you back, rather than going home. */
const SIGN_IN_FIRST = new Set(['/search', '/play', '/channels', '/settings'])

function isPublicPlay(search: string): boolean {
  const params = new URLSearchParams(search)
  return params.has('moment') || params.has('channel')
}

export function AppShell({
  children,
  serverAccountId,
}: {
  children: React.ReactNode
  serverAccountId: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  // Every document needs a settled immutable account scope, including pages
  // without TheaterAvatarMenu/useAuthMe consumers. The module-level hook cache
  // dedupes this with descendants and refetches after cross-tab auth changes.
  const { me, loading } = useAuthMe()
  const clientAccountId = loading
    ? undefined
    : me?.authenticated && typeof me.user?.id === 'string'
      ? me.user.id
      : null
  const trusted = clientAccountId !== undefined && clientAccountId === serverAccountId
  const serverScopeKey = serverAccountId === null ? 'signed-out' : `account:${serverAccountId}`
  // During a mismatch, retain the last trusted subtree as visible public
  // content but keep it inert. Only a matching server scope advances this key,
  // which hard-remounts all account state (including preferences) for B.
  const trustedScopeKeyRef = useRef(serverScopeKey)
  if (trusted) trustedScopeKeyRef.current = serverScopeKey
  const accountScope = useMemo<AppAccountScope>(
    () => ({ serverAccountId, clientAccountId, trusted }),
    [clientAccountId, serverAccountId, trusted],
  )

  useEffect(() => {
    startClientEventBridge()
  }, [])

  useEffect(() => {
    if (clientAccountId === undefined || trusted) return

    let timer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0

    const retry = () => {
      router.refresh()
      const exponent = Math.min(attempt, 5)
      const delay = Math.min(
        SCOPE_REFRESH_RETRY_BASE_MS * 2 ** exponent,
        SCOPE_REFRESH_RETRY_CAP_MS,
      )
      attempt += 1
      timer = setTimeout(retry, delay)
    }

    // Scheduling the first attempt instead of calling synchronously prevents
    // React Strict Mode's effect setup/cleanup replay from issuing two refreshes.
    timer = setTimeout(retry, 0)
    return () => {
      if (timer) clearTimeout(timer)
      timer = null
    }
  }, [clientAccountId, router, serverScopeKey, trusted])

  const isAccountOwnedPage =
    isSavedPath(pathname) ||
    pathname === '/library' ||
    pathname === '/search' ||
    pathname === '/play' ||
    pathname === '/channels' ||
    pathname.startsWith('/channels/') ||
    pathname === '/tags' ||
    pathname === '/settings' ||
    pathname === '/welcome' ||
    pathname === '/invite/done' ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/')

  // Tune in (`/play?moment=`) and a public channel (`/play?channel=`) play
  // for anyone. The query is read on the client only: the root layout can't
  // use useSearchParams without breaking static pages.
  const [publicPlay, setPublicPlay] = useState(false)
  useEffect(() => {
    setPublicPlay(pathname === '/play' && isPublicPlay(window.location.search))
  }, [pathname])

  useEffect(() => {
    // The server page throws a redirect for signed-out private routes, but
    // fail-closed rendering deliberately never mounts that untrusted RSC child.
    // Complete the same redirect from the independently verified client scope
    // so the redirect instruction cannot be hidden with the private payload.
    if (isAccountOwnedPage && trusted && serverAccountId === null) {
      const search = window.location.search
      if (pathname === '/play' && isPublicPlay(search)) return
      // The new design signs you in and brings you back; older pages go home.
      router.replace(
        SIGN_IN_FIRST.has(pathname) || pathname.startsWith('/channels/')
          ? `/start?${new URLSearchParams({ returnTo: `${pathname}${search}` })}`
          : '/',
      )
    }
  }, [isAccountOwnedPage, pathname, router, serverAccountId, trusted])

  const accountChildrenVisible =
    !isAccountOwnedPage || publicPlay || (trusted && serverAccountId !== null)
  const scopedChildren = accountChildrenVisible ? children : null
  const scopeBlocked = !trusted

  return (
    <AppAccountScopeContext.Provider value={accountScope}>
      <Fragment key={trustedScopeKeyRef.current}>
        <PreferencesProvider>
          <FontProvider>
            {/* Every page draws its own header (the new design's NxHeader). */}
            <div
              className="contents"
              data-app-account-scope={scopeBlocked ? 'blocked' : 'trusted'}
              inert={scopeBlocked ? true : undefined}
              aria-busy={scopeBlocked || undefined}
            >
              {scopedChildren}
            </div>
          </FontProvider>
        </PreferencesProvider>
      </Fragment>
    </AppAccountScopeContext.Provider>
  )
}
