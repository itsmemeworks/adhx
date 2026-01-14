'use client'

import { Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { Header } from './Header'

// Header loading skeleton
function HeaderSkeleton() {
  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="w-32 h-8 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          <div className="flex-1 max-w-xl h-10 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
            <div className="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    </header>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Full-width pages without header (public share pages, URL prefix quick-add pages)
  const isFullWidth = pathname.startsWith('/share/') || /^\/\w+\/status\/\d+$/.test(pathname)

  if (isFullWidth) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <Suspense fallback={<HeaderSkeleton />}>
        <Header />
      </Suspense>
      <main>{children}</main>
    </div>
  )
}
