import { notFound } from 'next/navigation'

/**
 * `/dev/*` is a QA-only surface (tweet fixture previews, OG tag debugging) —
 * never meant to be reachable in production. This layout gates the entire
 * subtree: production requests 404 before the page component even renders.
 * Also excluded from crawling via `Disallow: /dev/` in robots.txt (belt and
 * suspenders — a 404 doesn't stop a crawler from wasting a fetch).
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') {
    notFound()
  }
  return children
}
