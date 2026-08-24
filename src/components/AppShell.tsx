'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { Header } from './Header'
import { PWAInstallPrompt } from './PWAInstallPrompt'

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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Full-width pages without header (public share pages, URL prefix quick-add pages,
  // the full-screen trending reel)
  const isPreviewPage =
    /^\/\w+\/status\/\d+$/.test(pathname) ||
    /^\/reels?\/[A-Za-z0-9_-]+$/.test(pathname) ||
    /^\/shorts\/[A-Za-z0-9_-]{11}$/.test(pathname) ||
    /^\/@?[A-Za-z0-9._]+\/video\/\d+$/.test(pathname)
  // TheaterShell is `fixed inset-0 z-[60]` and owns the chrome. Hide the
  // Header; the install banner still mounts (z-70, under the top-left logo).
  const isTheaterPage =
    pathname === '/' ||
    pathname === '/live' ||
    pathname === '/collection' ||
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

  if (isFullWidth) {
    return (
      <>
        {children}
        {/* Theater owns the Header slot; the install banner still mounts and
            hangs under the top-left logo (see PWAInstallPrompt). */}
        {!hideInstallBanner && <PWAInstallPrompt />}
      </>
    )
  }

  return (
    <div className="min-h-screen bg-paper">
      <Suspense fallback={<HeaderSkeleton />}>
        <Header />
      </Suspense>
      {/* In-flow under the header so the callout doesn't cover Paste / filters. */}
      <PWAInstallPrompt />
      <main>{children}</main>
    </div>
  )
}
