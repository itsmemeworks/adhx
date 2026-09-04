'use client'

import { createContext, Fragment, Suspense, useContext, useEffect, useMemo, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Header } from './Header'
import { PWAInstallPrompt } from './PWAInstallPrompt'
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

// Header loading skeleton
function HeaderSkeleton() {
  return (
    <header className="sticky top-0 z-50 bg-surface border-b border-hairline">
      <div className="px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="w-24 h-8 bg-inset rounded-card animate-pulse" />
        <div className="w-[33px] h-[33px] bg-inset rounded-full animate-pulse" />
      </div>
    </header>
  )
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

  // Full-width pages without header (public share pages, URL prefix quick-add pages,
  // the full-screen trending reel)
  const isPreviewPage =
    /^\/\w+\/status\/\d+$/.test(pathname) ||
    /^\/reels?\/[A-Za-z0-9_-]+$/.test(pathname) ||
    /^\/p\/[A-Za-z0-9_-]+$/.test(pathname) ||
    /^\/shorts\/[A-Za-z0-9_-]{11}$/.test(pathname) ||
    /^\/@?[A-Za-z0-9._]+\/video\/\d+$/.test(pathname)
  // TheaterShell is a full-viewport z-60 overlay and owns the chrome. Hide
  // the Header; the install banner still mounts (z-70, under the top-left logo).
  const isTheaterPage =
    pathname === '/' ||
    pathname === '/live' ||
    isSavedPath(pathname) ||
    pathname.startsWith('/t/') ||
    isPreviewPage
  const isFullWidth =
    isTheaterPage ||
    pathname === '/trending/play' ||
    pathname.startsWith('/share/') ||
    // /welcome is the one-shot username chooser: a full-screen dark card with
    // no app chrome — a mounted (visually hidden) Header would leave its
    // search input focusable underneath the overlay.
    pathname === '/welcome'
  // One-shot username / starter-playlist screen — the banner covers the card.
  const hideInstallBanner = pathname === '/welcome'
  const isAccountOwnedPage =
    pathname === '/live' ||
    isSavedPath(pathname) ||
    pathname === '/library' ||
    pathname === '/tags' ||
    pathname === '/settings' ||
    pathname === '/welcome' ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/')

  useEffect(() => {
    // The server page throws redirect('/') for signed-out private routes, but
    // fail-closed rendering deliberately never mounts that untrusted RSC child.
    // Complete the same redirect from the independently verified client scope
    // so the redirect instruction cannot be hidden with the private payload.
    if (isAccountOwnedPage && trusted && serverAccountId === null) {
      router.replace('/')
    }
  }, [isAccountOwnedPage, router, serverAccountId, trusted])

  const accountChildrenVisible = !isAccountOwnedPage || (trusted && serverAccountId !== null)
  const scopedChildren = accountChildrenVisible ? children : null
  const scopeBlocked = !trusted

  return (
    <AppAccountScopeContext.Provider value={accountScope}>
      <Fragment key={trustedScopeKeyRef.current}>
        <PreferencesProvider>
          <FontProvider>
            {isFullWidth ? (
              <>
                <div
                  className="contents"
                  data-app-account-scope={scopeBlocked ? 'blocked' : 'trusted'}
                  inert={scopeBlocked ? true : undefined}
                  aria-busy={scopeBlocked || undefined}
                >
                  {scopedChildren}
                </div>
                {/* Theater owns the Header slot; the install banner still mounts and
                    hangs under the top-left logo (see PWAInstallPrompt). */}
                {!hideInstallBanner && <PWAInstallPrompt />}
              </>
            ) : (
              <div
                className="min-h-screen bg-paper"
                data-app-account-scope={scopeBlocked ? 'blocked' : 'trusted'}
                inert={scopeBlocked ? true : undefined}
                aria-busy={scopeBlocked || undefined}
              >
                {trusted && accountChildrenVisible ? (
                  <Suspense fallback={<HeaderSkeleton />}>
                    <Header />
                  </Suspense>
                ) : loading || !trusted ? (
                  <HeaderSkeleton />
                ) : null}
                {/* In-flow under the header so the callout doesn't cover Paste / filters. */}
                <PWAInstallPrompt />
                <main>{scopedChildren}</main>
              </div>
            )}
          </FontProvider>
        </PreferencesProvider>
      </Fragment>
    </AppAccountScopeContext.Provider>
  )
}
