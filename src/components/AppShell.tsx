'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { Header } from './Header'
import { PWAInstallPrompt } from './PWAInstallPrompt'

// Header loading skeleton
function HeaderSkeleton() {
  return (
    <header className="sticky top-0 z-50 bg-surface border-b border-hairline">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="w-32 h-8 bg-inset rounded-card animate-pulse" />
          <div className="flex-1 max-w-xl h-10 bg-inset rounded-full animate-pulse" />
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-inset rounded-full animate-pulse" />
            <div className="w-10 h-10 bg-inset rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    </header>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Full-width pages without header (public share pages, URL prefix quick-add pages)
  const isFullWidth =
    pathname.startsWith('/share/') ||
    /^\/\w+\/status\/\d+$/.test(pathname) ||
    /^\/reels?\/[A-Za-z0-9_-]+$/.test(pathname) ||
    /^\/shorts\/[A-Za-z0-9_-]{11}$/.test(pathname) ||
    /^\/@?[A-Za-z0-9._]+\/video\/\d+$/.test(pathname)

  if (isFullWidth) {
    return (
      <>
        {children}
        <PWAInstallPrompt />
      </>
    )
  }

  return (
    <div className="min-h-screen bg-paper">
      <Suspense fallback={<HeaderSkeleton />}>
        <Header />
      </Suspense>
      <main>{children}</main>
      <PWAInstallPrompt />
    </div>
  )
}
