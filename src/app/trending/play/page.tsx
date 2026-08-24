import { redirect } from 'next/navigation'

/**
 * /trending/play — the old Trending Reel now evolves into the mobile theater
 * (spec §8: "Evolves /trending/play rather than duplicating it — /trending/play
 * redirects into the theater"). `/live` is Live for signed-in users and
 * redirects to `/` when signed out; there's no query state to carry over.
 *
 * Kept `force-dynamic` (matching the page it replaces) even though a redirect
 * has no DB read of its own — avoids any static-generation surprise if this
 * route ever grows logic again.
 */
export const dynamic = 'force-dynamic'

export default function TrendingPlayPage() {
  redirect('/live')
}
