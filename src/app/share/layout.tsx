import type { Metadata } from 'next'

// `/share` is the PWA Share Target landing page (`page.tsx` is a client
// component and can't export `metadata` itself) — a redirect-only utility
// route, never meant to be indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children
}
